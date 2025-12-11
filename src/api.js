import { hashPassword, signJwt, verifyJwt, verifyPassword } from './security.js';

export async function handleApi(request, env, path, url) {
  const method = request.method;

  const requireAuth = async (role = 'teacher') => {
    const user = await verifyJwt(request);
    if (!user) throw new Error("Unauthorized");
    if (role === 'super_admin' && user.role !== 'super_admin') throw new Error("Forbidden");
    return user;
  };

  try {
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
      await requireAuth('super_admin');
      try {
        await env.DB.batch([
          env.DB.prepare("DROP TABLE IF EXISTS attempts"),
          env.DB.prepare("DROP TABLE IF EXISTS questions"),
          env.DB.prepare("DROP TABLE IF EXISTS exams"),
          env.DB.prepare("DROP TABLE IF EXISTS school_config"),
          env.DB.prepare("DROP TABLE IF EXISTS students"),
          env.DB.prepare("DROP TABLE IF EXISTS users"),
        ]);
        await env.DB.batch([
          env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, role TEXT DEFAULT 'teacher', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id TEXT UNIQUE, name TEXT, roll TEXT, class TEXT, section TEXT, extra_info TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS school_config (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT UNIQUE, title TEXT, teacher_id INTEGER, settings TEXT, is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, text TEXT, image_key TEXT, choices TEXT)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, student_db_id INTEGER, score INTEGER, total INTEGER, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_db_id) REFERENCES students(id))")
        ]);
        return Response.json({ success: true });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    if (path === '/api/config/get' && method === 'GET') {
      try {
        const data = await env.DB.prepare("SELECT * FROM school_config ORDER BY value ASC").all();
        return Response.json(data.results);
      } catch (e) {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS school_config (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT)").run();
        return Response.json([]);
      }
    }

    if (path === '/api/config/add' && method === 'POST') {
      await requireAuth('super_admin');
      const { type, value } = await request.json();
      await env.DB.prepare("INSERT INTO school_config (type, value) VALUES (?, ?)").bind(type, value).run();
      return Response.json({ success: true });
    }

    if (path === '/api/config/delete' && method === 'POST') {
      await requireAuth('super_admin');
      const { id } = await request.json();
      await env.DB.prepare("DELETE FROM school_config WHERE id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    if (path === '/api/auth/setup-admin' && method === 'POST') {
      let count = 0;
      try { count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count'); }
      catch (e) { return Response.json({ error: "Database not initialized." }, { status: 500 }); }
      if (count > 0) return Response.json({ error: "Admin already exists" }, { status: 403 });
      const { username, password, name } = await request.json();
      const hashedPassword = await hashPassword(password);
      await env.DB.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'super_admin')")
        .bind(username, hashedPassword, name).run();
      return Response.json({ success: true });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = await request.json();
      const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
      if (!user || !(await verifyPassword(password, user.password))) {
        return Response.json({ error: "Invalid credentials" }, { status: 401 });
      }
      const token = await signJwt({ id: user.id, role: user.role, name: user.name });
      return Response.json({ success: true, user: { ...user, password: '' }, token });
    }

    if (path === '/api/admin/teachers' && method === 'POST') {
      await requireAuth('super_admin');
      const { username, password, name } = await request.json();
      const hashedPassword = await hashPassword(password);
      try {
        await env.DB.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'teacher')")
          .bind(username, hashedPassword, name).run();
        return Response.json({ success: true });
      } catch (e) {
        return Response.json({ error: "Username likely taken" }, { status: 400 });
      }
    }

    if (path === '/api/admin/teachers' && method === 'GET') {
      await requireAuth('super_admin');
      const teachers = await env.DB.prepare("SELECT id, name, username, created_at FROM users WHERE role = 'teacher' ORDER BY created_at DESC").all();
      return Response.json(teachers.results);
    }

    if (path === '/api/admin/exams' && method === 'GET') {
      await requireAuth('super_admin');
      const exams = await env.DB.prepare(`
            SELECT e.*, u.name as teacher_name
            FROM exams e
            LEFT JOIN users u ON e.teacher_id = u.id
            ORDER BY e.created_at DESC
        `).all();
      return Response.json(exams.results);
    }

    if (path === '/api/admin/teacher/delete' && method === 'POST') {
      await requireAuth('super_admin');
      const { id } = await request.json();
      await env.DB.prepare("DELETE FROM users WHERE id = ? AND role = 'teacher'").bind(id).run();
      return Response.json({ success: true });
    }

    if (path === '/api/admin/student/delete' && method === 'POST') {
      await requireAuth('super_admin');
      const { id } = await request.json();
      await env.DB.prepare("DELETE FROM students WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM attempts WHERE student_db_id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    if (path === '/api/exam/save' && method === 'POST') {
      const user = await requireAuth('teacher');
      const { id, title, teacher_id, settings } = await request.json();
      if (user.role !== 'super_admin' && parseInt(teacher_id) !== user.id) return Response.json({ error: "Unauthorized" }, { status: 403 });
      let examId = id;
      let link_id = null;
      if (examId) {
        await env.DB.prepare("UPDATE exams SET title = ?, settings = ? WHERE id = ?")
          .bind(title, JSON.stringify(settings), examId).run();
        await env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(examId).run();
      } else {
        link_id = crypto.randomUUID();
        const res = await env.DB.prepare("INSERT INTO exams (link_id, title, teacher_id, settings) VALUES (?, ?, ?, ?)")
          .bind(link_id, title, teacher_id, JSON.stringify(settings)).run();
        examId = res.meta.last_row_id;
      }
      return Response.json({ success: true, id: examId, link_id });
    }

    if (path === '/api/exam/delete' && method === 'POST') {
      const user = await requireAuth('teacher');
      const { id } = await request.json();
      const exam = await env.DB.prepare("SELECT teacher_id FROM exams WHERE id = ?").bind(id).first();
      if (exam && (user.role === 'super_admin' || exam.teacher_id === user.id)) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM exams WHERE id = ?").bind(id),
          env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(id),
          env.DB.prepare("DELETE FROM attempts WHERE exam_id = ?").bind(id)
        ]);
        return Response.json({ success: true });
      }
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (path === '/api/exam/toggle' && method === 'POST') {
      const user = await requireAuth('teacher');
      const { id, is_active } = await request.json();
      const exam = await env.DB.prepare("SELECT teacher_id FROM exams WHERE id = ?").bind(id).first();
      if (exam && (user.role === 'super_admin' || exam.teacher_id === user.id)) {
        await env.DB.prepare("UPDATE exams SET is_active = ? WHERE id = ?").bind(is_active ? 1 : 0, id).run();
        return Response.json({ success: true });
      }
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (path === '/api/question/add' && method === 'POST') {
      const user = await requireAuth('teacher');
      const formData = await request.formData();
      const exam_id = formData.get('exam_id');
      const exam = await env.DB.prepare("SELECT teacher_id FROM exams WHERE id = ?").bind(exam_id).first();
      if (!exam || (user.role !== 'super_admin' && exam.teacher_id !== user.id)) return Response.json({ error: "Unauthorized" }, { status: 403 });
      const text = formData.get('text');
      const choices = formData.get('choices');
      const image = formData.get('image');
      const existing_image_key = formData.get('existing_image_key');
      let image_key = null;
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
      const user = await requireAuth('teacher');
      const teacherId = url.searchParams.get('teacher_id');
      if (user.role !== 'super_admin' && parseInt(teacherId) !== user.id) return Response.json({ error: "Unauthorized" }, { status: 403 });
      try {
        const exams = await env.DB.prepare("SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC").bind(teacherId).all();
        return Response.json(exams.results);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    if (path === '/api/teacher/exam-details' && method === 'GET') {
      await requireAuth('teacher');
      const examId = url.searchParams.get('id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(examId).first();
      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(examId).all();
      return Response.json({ exam, questions: questions.results });
    }

    if (path === '/api/student/portal-history' && method === 'POST') {
      const { school_id } = await request.json();
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
      const { school_id } = await request.json();
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

    if (path === '/api/exam/get' && method === 'GET') {
      const link_id = url.searchParams.get('link_id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE link_id = ?").bind(link_id).first();
      if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
      const sanitizedQuestions = questions.results.map((q) => ({
        ...q,
        choices: JSON.stringify(JSON.parse(q.choices).map((c) => ({ id: c.id, text: c.text })))
      }));
      let config = [];
      try {
        const c = await env.DB.prepare("SELECT * FROM school_config").all();
        config = c.results;
      } catch (e) {}
      return Response.json({ exam, questions: sanitizedQuestions, config });
    }

    if (path === '/api/student/check' && method === 'POST') {
      const { exam_id, school_id } = await request.json();
      const student = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(school_id).first();
      if (!student) return Response.json({ canTake: true });
      const attempt = await env.DB.prepare("SELECT id FROM attempts WHERE exam_id = ? AND student_db_id = ?").bind(exam_id, student.id).first();
      return Response.json({ canTake: !attempt });
    }

    if (path === '/api/submit' && method === 'POST') {
      const { link_id, student, answers } = await request.json();
      if (!student || !student.school_id || !student.name || !student.roll || !student.class || !student.section) {
        return Response.json({ error: "Incomplete student profile" }, { status: 400 });
      }

      const normalizedStudent = {
        school_id: String(student.school_id).trim(),
        name: String(student.name).trim(),
        roll: String(student.roll).trim(),
        class: String(student.class).trim(),
        section: String(student.section).trim(),
      };

      const exam = await env.DB.prepare("SELECT id FROM exams WHERE link_id = ?").bind(link_id).first();
      if (!exam) return Response.json({ error: "Invalid Exam" });

      const questions = await env.DB.prepare("SELECT id, choices, text FROM questions WHERE exam_id = ?").bind(exam.id).all();
      let serverScore = 0;
      let total = questions.results.length;
      let detailedResults = [];

      questions.results.forEach((q) => {
        const studentAnswerId = answers[q.id];
        const dbChoices = JSON.parse(q.choices);
        const correctChoice = dbChoices.find((c) => c.isCorrect);
        const isCorrect = correctChoice && studentAnswerId === correctChoice.id;
        if (isCorrect) serverScore++;
        const studentChoice = dbChoices.find((c) => c.id === studentAnswerId);
        detailedResults.push({
          qId: q.id,
          qText: q.text,
          selectedText: studentChoice ? studentChoice.text : "Skipped",
          correctText: correctChoice ? correctChoice.text : "Error",
          isCorrect: isCorrect
        });
      });

      let studentRecord = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(normalizedStudent.school_id).first();
      if (!studentRecord) {
        try {
          const res = await env.DB.prepare("INSERT INTO students (school_id, name, roll, class, section) VALUES (?, ?, ?, ?, ?)")
            .bind(normalizedStudent.school_id, normalizedStudent.name, normalizedStudent.roll, normalizedStudent.class || null, normalizedStudent.section || null).run();
          studentRecord = { id: res.meta.last_row_id };
        } catch (e) {
          try { await env.DB.prepare("ALTER TABLE students ADD COLUMN class TEXT").run(); } catch (err) {}
          try { await env.DB.prepare("ALTER TABLE students ADD COLUMN section TEXT").run(); } catch (err) {}
          const res = await env.DB.prepare("INSERT INTO students (school_id, name, roll, class, section) VALUES (?, ?, ?, ?, ?)")
            .bind(normalizedStudent.school_id, normalizedStudent.name, normalizedStudent.roll, normalizedStudent.class || null, normalizedStudent.section || null).run();
          studentRecord = { id: res.meta.last_row_id };
        }
      } else {
        try {
          await env.DB.prepare("UPDATE students SET name = ?, roll = ?, class = ?, section = ? WHERE id = ?")
            .bind(normalizedStudent.name, normalizedStudent.roll, normalizedStudent.class || null, normalizedStudent.section || null, studentRecord.id).run();
        } catch (e) {
          await env.DB.prepare("UPDATE students SET name = ?, roll = ?, class = ?, section = ? WHERE id = ?")
            .bind(normalizedStudent.name, normalizedStudent.roll, normalizedStudent.class || null, normalizedStudent.section || null, studentRecord.id).run();
        }
      }

      await env.DB.prepare("INSERT INTO attempts (exam_id, student_db_id, score, total, details) VALUES (?, ?, ?, ?, ?)")
        .bind(exam.id, studentRecord.id, serverScore, total, JSON.stringify(detailedResults)).run();

      return Response.json({ success: true, score: serverScore, total, details: detailedResults });
    }

    if (path === '/api/analytics/exam' && method === 'GET') {
      await requireAuth('teacher');
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
      await requireAuth('teacher');
      try {
        const students = await env.DB.prepare(`
                SELECT s.*, COUNT(a.id) as exams_count, AVG(CAST(a.score AS FLOAT)/CAST(a.total AS FLOAT))*100 as avg_score
                FROM students s
                LEFT JOIN attempts a ON s.id = a.student_db_id
                GROUP BY s.id
                ORDER BY s.created_at DESC
            `).all();
        return Response.json(students.results);
      } catch (e) {
        return Response.json([]);
      }
    }

  } catch (err) {
    if (err.message === "Unauthorized" || err.message === "Forbidden") {
      return Response.json({ error: err.message }, { status: 401 });
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
  return new Response("Not Found", { status: 404 });
}
