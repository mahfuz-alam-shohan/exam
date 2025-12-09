// API route handling for Cloudflare Worker
// Splits database and submission logic away from the main entry for readability.

async function readJson(request) {
  try {
    return await request.json();
  } catch (err) {
    throw new Error('Invalid JSON body');
  }
}

function textToUint8Array(text) {
  return new TextEncoder().encode(text);
}

function toBase64Url(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getSigningKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    textToUint8Array(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signToken(payload, env) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = toBase64Url(textToUint8Array(JSON.stringify(header)));
  const encodedPayload = toBase64Url(textToUint8Array(JSON.stringify(payload)));
  const data = `${encodedHeader}.${encodedPayload}`;
  const key = await getSigningKey(env.JWT_SECRET);
  const signature = await crypto.subtle.sign('HMAC', key, textToUint8Array(data));
  const encodedSignature = toBase64Url(signature);
  return `${data}.${encodedSignature}`;
}

async function verifyUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  try {
    const key = await getSigningKey(env.JWT_SECRET);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(encodedSignature),
      textToUint8Array(data)
    );

    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(fromBase64Url(encodedPayload));
    return JSON.parse(payloadJson);
  } catch (e) {
    return null;
  }
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getPage(url) {
  const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
  if (Number.isNaN(pageParam) || pageParam < 1) return 1;
  return pageParam;
}

export async function handleApi(request, env, path, url) {
  const method = request.method;

  try {
    // 1. SYSTEM INIT & RESET
    if (path === '/api/system/status' && method === 'GET') {
      try {
        const count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count');
        return Response.json({ installed: true, hasAdmin: count > 0 });
      } catch (e) {
        return Response.json({ installed: false, hasAdmin: false, error: e.message });
      }
    }

    if (path === '/api/system/init' && method === 'POST') {
      try {
        await env.DB.batch([
          env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, role TEXT DEFAULT 'teacher', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id TEXT UNIQUE, name TEXT, roll TEXT, class TEXT, section TEXT, extra_info TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS school_config (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT UNIQUE, title TEXT, teacher_id INTEGER, settings TEXT, is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, text TEXT, image_key TEXT, choices TEXT)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, student_db_id INTEGER, score INTEGER, total INTEGER, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_db_id) REFERENCES students(id))")
        ]);

        try { await env.DB.prepare("ALTER TABLE students ADD COLUMN class TEXT").run(); } catch (e) {}
        try { await env.DB.prepare("ALTER TABLE students ADD COLUMN section TEXT").run(); } catch (e) {}

        return Response.json({ success: true });
      } catch (err) {
        return Response.json({ error: "DB Init Error: " + err.message }, { status: 500 });
      }
    }

    if (path === '/api/system/reset' && method === 'POST') {
      const user = await verifyUser(request, env);
      if (!user || user.role !== 'super_admin') {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM students"),
          env.DB.prepare("DELETE FROM exams"),
          env.DB.prepare("DELETE FROM questions"),
          env.DB.prepare("DELETE FROM attempts"),
          env.DB.prepare("DELETE FROM school_config"),
        ]);
        return Response.json({ success: true });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    // 2. CONFIG (Classes/Sections)
    if (path === '/api/config/get' && method === 'GET') {
      const user = await verifyUser(request, env);
      if (!user) return new Response("Unauthorized", { status: 401 });
      try {
        const data = await env.DB.prepare("SELECT * FROM school_config ORDER BY value ASC").all();
        return Response.json(data.results);
      } catch (e) {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS school_config (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT)").run();
        return Response.json([]);
      }
    }

    if (path === '/api/config/add' && method === 'POST') {
      const { type, value } = await readJson(request);
      if (!type || !value) {
        return Response.json({ error: 'Missing type or value' }, { status: 400 });
      }
      await env.DB.prepare("INSERT INTO school_config (type, value) VALUES (?, ?)").bind(type, value).run();
      return Response.json({ success: true, type, value });
    }

    if (path === '/api/config/delete' && method === 'POST') {
      const { id } = await readJson(request);
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      await env.DB.prepare("DELETE FROM school_config WHERE id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    // 3. AUTH & USER MANAGEMENT
    if (path === '/api/auth/setup-admin' && method === 'POST') {
      let count = 0;
      try { count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count'); }
      catch (e) { return Response.json({ error: "Database not initialized." }, { status: 500 }); }

      if (count > 0) return Response.json({ error: "Admin already exists" }, { status: 403 });

      const { username, password, name } = await readJson(request);
      if (!username || !password || !name) {
        return Response.json({ error: "Missing credentials" }, { status: 400 });
      }
      if (username.length > 50) {
        return Response.json({ error: "Username too long" }, { status: 400 });
      }
      if (password.length > 100) {
        return Response.json({ error: "Password too long" }, { status: 400 });
      }
      if (name.length > 100) {
        return Response.json({ error: "Name too long" }, { status: 400 });
      }
      const hashed = await hashPassword(password);
      await env.DB.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'super_admin')")
        .bind(username, hashed, name).run();
      return Response.json({ success: true });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = await readJson(request);
      if (!username || !password) {
        return Response.json({ error: "Missing credentials" }, { status: 400 });
      }
      const hashed = await hashPassword(password);
      const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?")
        .bind(username).first();

      if (!user) return Response.json({ error: "Invalid credentials" }, { status: 401 });

      const matchesHash = user.password === hashed;
      const matchesPlain = user.password === password;

      if (!matchesHash && !matchesPlain) {
        return Response.json({ error: "Invalid credentials" }, { status: 401 });
      }

      if (matchesPlain && !matchesHash) {
        await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?")
          .bind(hashed, user.id)
          .run();
        user.password = hashed;
      }

      const payload = { id: user.id, username: user.username, role: user.role, name: user.name };
      const token = await signToken(payload, env);
      return Response.json({ success: true, token, user: payload });
    }

    if (path === '/api/admin/teachers' && method === 'POST') {
      const currentUser = await verifyUser(request, env);
      if (!currentUser || currentUser.role !== 'super_admin') {
        return new Response("Unauthorized", { status: 401 });
      }
      const { username, password, name } = await readJson(request);
      if (!username || !password || !name) {
        return Response.json({ error: 'Missing fields' }, { status: 400 });
      }
      try {
        const hashed = await hashPassword(password);
        await env.DB.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'teacher')")
          .bind(username, hashed, name).run();
        return Response.json({ success: true });
      } catch (e) {
        return Response.json({ error: "Username likely taken" }, { status: 400 });
      }
    }

    if (path === '/api/admin/teachers' && method === 'GET') {
      const teachers = await env.DB.prepare("SELECT id, name, username, created_at FROM users WHERE role = 'teacher' ORDER BY created_at DESC").all();
      return Response.json(teachers.results);
    }

    if (path === '/api/admin/teacher/delete' && method === 'POST') {
      const currentUser = await verifyUser(request, env);
      if (!currentUser || currentUser.role !== 'super_admin') {
        return new Response("Unauthorized", { status: 401 });
      }
      const { id } = await readJson(request);
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      await env.DB.prepare("DELETE FROM users WHERE id = ? AND role = 'teacher'").bind(id).run();
      return Response.json({ success: true });
    }

    if (path === '/api/admin/student/delete' && method === 'POST') {
      const currentUser = await verifyUser(request, env);
      if (!currentUser || currentUser.role !== 'super_admin') {
        return new Response("Unauthorized", { status: 401 });
      }
      const { id } = await readJson(request);
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      await env.DB.prepare("DELETE FROM students WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM attempts WHERE student_db_id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    // 4. EXAM MANAGEMENT
    if (path === '/api/exam/save' && method === 'POST') {
      const user = await verifyUser(request, env);
      if (!user) {
        return new Response("Unauthorized", { status: 401 });
      }
      const { id, title, teacher_id, settings } = await readJson(request);
      if (!title || !teacher_id) {
        return Response.json({ error: 'Missing exam data' }, { status: 400 });
      }
      if (typeof title !== 'string' || title.length > 200) {
        return Response.json({ error: 'Title too long' }, { status: 400 });
      }
      const settingsString = JSON.stringify(settings || {});
      if (settingsString.length > 5000) {
        return Response.json({ error: 'Settings too large' }, { status: 400 });
      }
      let examId = id;
      let link_id = null;

      if (examId) {
        await env.DB.prepare("UPDATE exams SET title = ?, settings = ? WHERE id = ?")
          .bind(title, settingsString, examId).run();
        await env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(examId).run();
      } else {
        link_id = crypto.randomUUID();
        const res = await env.DB.prepare("INSERT INTO exams (link_id, title, teacher_id, settings) VALUES (?, ?, ?, ?)")
          .bind(link_id, title, teacher_id, settingsString).run();
        examId = res.meta.last_row_id;
      }
      return Response.json({ success: true, id: examId, link_id });
    }

    if (path === '/api/exam/delete' && method === 'POST') {
      const user = await verifyUser(request, env);
      if (!user) {
        return new Response("Unauthorized", { status: 401 });
      }
      const { id } = await readJson(request);
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      await env.DB.batch([
        env.DB.prepare("DELETE FROM exams WHERE id = ?").bind(id),
        env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(id),
        env.DB.prepare("DELETE FROM attempts WHERE exam_id = ?").bind(id)
      ]);
      return Response.json({ success: true });
    }

    if (path === '/api/exam/toggle' && method === 'POST') {
      const user = await verifyUser(request, env);
      if (!user) {
        return new Response("Unauthorized", { status: 401 });
      }
      const { id, is_active } = await readJson(request);
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
      await env.DB.prepare("UPDATE exams SET is_active = ? WHERE id = ?").bind(is_active ? 1 : 0, id).run();
      return Response.json({ success: true });
    }

    if (path === '/api/question/add' && method === 'POST') {
      const user = await verifyUser(request, env);
      if (!user) {
        return new Response("Unauthorized", { status: 401 });
      }
      const formData = await request.formData();
      const exam_id = formData.get('exam_id');
      const text = formData.get('text');
      const choices = formData.get('choices');
      const image = formData.get('image');
      const existing_image_key = formData.get('existing_image_key');

      let image_key = null;

      if (image && image.size > 2 * 1024 * 1024) {
        return Response.json({ error: 'Image exceeds 2MB limit' }, { status: 400 });
      }

      if (image && image.size > 0) {
        image_key = crypto.randomUUID();
        await env.BUCKET.put(image_key, image);
      } else if (existing_image_key && existing_image_key !== 'null' && existing_image_key !== 'undefined') {
        image_key = existing_image_key;
      }

      await env.DB.prepare("INSERT INTO questions (exam_id, text, image_key, choices) VALUES (?, ?, ?, ?)")
        .bind(exam_id, text, image_key, choices).run();
      return Response.json({ success: true });
    }

    if (path === '/api/teacher/exams' && method === 'GET') {
      const user = await verifyUser(request, env);
      if (!user) return new Response("Unauthorized", { status: 401 });
      const teacherId = url.searchParams.get('teacher_id');
      const page = getPage(url);
      const offset = (page - 1) * 20;
      try {
        const exams = await env.DB.prepare("SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC LIMIT 20 OFFSET ?")
          .bind(teacherId, offset).all();
        return Response.json(exams.results);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    if (path === '/api/teacher/exam-details' && method === 'GET') {
      const user = await verifyUser(request, env);
      if (!user) return new Response("Unauthorized", { status: 401 });
      const examId = url.searchParams.get('id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(examId).first();
      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(examId).all();
      return Response.json({ exam, questions: questions.results });
    }

    // 5. STUDENT PORTAL
    if (path === '/api/student/portal-history' && method === 'POST') {
      const { school_id } = await readJson(request);
      if (!school_id) return Response.json({ error: 'Missing school_id' }, { status: 400 });
      const student = await env.DB.prepare("SELECT * FROM students WHERE school_id = ?").bind(school_id).first();

      if (!student) return Response.json({ found: false });

      const history = await env.DB.prepare(`
            SELECT a.*, e.title, e.id as exam_id
            FROM attempts a
            JOIN exams e ON a.exam_id = e.id
            WHERE a.student_db_id = ?
            ORDER BY a.timestamp DESC
        `).bind(student.id).all();

      return Response.json({ found: true, student, history: history.results });
    }

    if (path === '/api/student/identify' && method === 'POST') {
      const { school_id } = await readJson(request);
      if (!school_id) return Response.json({ error: 'Missing school_id' }, { status: 400 });
      const student = await env.DB.prepare("SELECT * FROM students WHERE school_id = ?").bind(school_id).first();

      if (student) {
        const stats = await env.DB.prepare(`
                SELECT COUNT(*) as total_exams, AVG(CAST(score AS FLOAT)/CAST(total AS FLOAT))*100 as avg_score
                FROM attempts WHERE student_db_id = ?
            `).bind(student.id).first();
        return Response.json({ found: true, student, stats });
      }
      return Response.json({ found: false });
    }

    // 6. EXAM DATA
    if (path === '/api/exam/get' && method === 'GET') {
      const link_id = url.searchParams.get('link_id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE link_id = ?").bind(link_id).first();
      if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });

      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
      let config = [];
      try {
        const c = await env.DB.prepare("SELECT * FROM school_config").all();
        config = c.results;
      } catch (e) {}

      return Response.json({ exam, questions: questions.results, config });
    }

    if (path === '/api/student/check' && method === 'POST') {
      const { exam_id, school_id } = await readJson(request);
      if (!exam_id || !school_id) return Response.json({ error: 'Missing identifiers' }, { status: 400 });
      const student = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(school_id).first();
      if (!student) return Response.json({ canTake: true });

      const attempt = await env.DB.prepare("SELECT id FROM attempts WHERE exam_id = ? AND student_db_id = ?").bind(exam_id, student.id).first();
      return Response.json({ canTake: !attempt });
    }

    if (path === '/api/submit' && method === 'POST') {
      const { link_id, student, answers, score, total } = await readJson(request);
      if (!link_id || !student || !student.school_id) {
        return Response.json({ error: 'Missing submission data' }, { status: 400 });
      }

      const exam = await env.DB.prepare("SELECT id FROM exams WHERE link_id = ?").bind(link_id).first();
      if (!exam) return Response.json({ error: "Invalid Exam" });

      let studentRecord = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(student.school_id).first();

      if (!studentRecord) {
        try {
          const res = await env.DB.prepare("INSERT INTO students (school_id, name, roll, class, section) VALUES (?, ?, ?, ?, ?)")
            .bind(student.school_id, student.name, student.roll, student.class || null, student.section || null).run();
          studentRecord = { id: res.meta.last_row_id };
        } catch (e) {
          studentRecord = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(student.school_id).first();
          if (!studentRecord) throw e;
        }
      }

      await env.DB.prepare("UPDATE students SET name = ?, roll = ?, class = ?, section = ? WHERE id = ?")
        .bind(
          student.name,
          student.roll,
          student.class || null,
          student.section || null,
          studentRecord.id
        ).run();

      await env.DB.prepare("INSERT INTO attempts (exam_id, student_db_id, score, total, details) VALUES (?, ?, ?, ?, ?)")
        .bind(exam.id, studentRecord.id, score, total, JSON.stringify(answers)).run();

      return Response.json({ success: true });
    }

    // 7. ANALYTICS
    if (path === '/api/analytics/exam' && method === 'GET') {
      const user = await verifyUser(request, env);
      if (!user) return new Response("Unauthorized", { status: 401 });
      const examId = url.searchParams.get('exam_id');
      try {
        const results = await env.DB.prepare(`
            SELECT a.*, s.name, s.school_id, s.roll, s.class, s.section
            FROM attempts a
            JOIN students s ON a.student_db_id = s.id
            WHERE a.exam_id = ?
            ORDER BY a.timestamp DESC
          `).bind(examId).all();
        return Response.json(results.results);
      } catch (e) {
        return Response.json([]);
      }
    }

    if (path === '/api/students/list' && method === 'GET') {
      const user = await verifyUser(request, env);
      if (!user || (user.role !== 'teacher' && user.role !== 'super_admin')) {
        return new Response("Unauthorized", { status: 401 });
      }
      const page = getPage(url);
      const offset = (page - 1) * 20;
      try {
        const students = await env.DB.prepare(`
                SELECT s.*, COUNT(a.id) as exams_count, AVG(CAST(a.score AS FLOAT)/CAST(a.total AS FLOAT))*100 as avg_score
                FROM students s
                LEFT JOIN attempts a ON s.id = a.student_db_id
                GROUP BY s.id
                ORDER BY s.created_at DESC
                LIMIT 20 OFFSET ?
            `).bind(offset).all();
        return Response.json(students.results);
      } catch (e) {
        return Response.json([]);
      }
    }
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  return new Response("Not Found", { status: 404 });
}
