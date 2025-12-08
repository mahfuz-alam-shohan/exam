/**
 * Cloudflare Worker - Exam System (SaaS Masterclass)
 * - Roles: 'super_admin' (Owner), 'teacher' (Creators), 'student' (Takers)
 * - Features: Deep Analytics, Snapshot Reviews, Question Editing, Student Hub, Gamification
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API ROUTES ---
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path, url);
    }

    // --- IMAGE SERVING (R2) ---
    if (path.startsWith('/img/')) {
      const key = path.split('/img/')[1];
      if (!key) return new Response('Image ID required', { status: 400 });
      
      const object = await env.BUCKET.get(key);
      if (!object) return new Response('Image not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);

      return new Response(object.body, { headers });
    }

    // --- FRONTEND SERVING ---
    return new Response(getHtml(), {
      headers: { 'Content-Type': 'text/html' },
    });
  },
};

// --- API LOGIC ---
async function handleApi(request, env, path, url) {
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
          env.DB.prepare("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id TEXT UNIQUE, name TEXT, roll TEXT, extra_info TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT UNIQUE, title TEXT, teacher_id INTEGER, settings TEXT, is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, text TEXT, image_key TEXT, choices TEXT)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, student_db_id INTEGER, score INTEGER, total INTEGER, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_db_id) REFERENCES students(id))")
        ]);
        return Response.json({ success: true });
      } catch (err) {
        return Response.json({ error: "DB Init Error: " + err.message }, { status: 500 });
      }
    }

    if (path === '/api/system/reset' && method === 'POST') {
        // DANGER ZONE: Wipe data
        await env.DB.batch([
            env.DB.prepare("DELETE FROM students"),
            env.DB.prepare("DELETE FROM exams"),
            env.DB.prepare("DELETE FROM questions"),
            env.DB.prepare("DELETE FROM attempts"),
        ]);
        return Response.json({ success: true });
    }

    // 2. AUTH
    if (path === '/api/auth/setup-admin' && method === 'POST') {
      let count = 0;
      try { count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count'); } 
      catch(e) { return Response.json({ error: "Database not initialized." }, { status: 500 }); }

      if (count > 0) return Response.json({ error: "Admin already exists" }, { status: 403 });

      const { username, password, name } = await request.json();
      await env.DB.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'super_admin')")
        .bind(username, password, name).run();
      return Response.json({ success: true });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = await request.json();
      const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?")
        .bind(username, password).first();
      
      if (!user) return Response.json({ error: "Invalid credentials" }, { status: 401 });
      return Response.json({ success: true, user });
    }

    if (path === '/api/admin/teachers' && method === 'POST') {
      const { username, password, name } = await request.json();
      try {
        await env.DB.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'teacher')")
          .bind(username, password, name).run();
        return Response.json({ success: true });
      } catch(e) {
        return Response.json({ error: "Username likely taken" }, { status: 400 });
      }
    }
    
    if (path === '/api/admin/teachers' && method === 'GET') {
      const teachers = await env.DB.prepare("SELECT id, name, username, created_at FROM users WHERE role = 'teacher'").all();
      return Response.json(teachers.results);
    }

    // 3. EXAM MANAGEMENT
    if (path === '/api/exam/save' && method === 'POST') {
      const { id, title, teacher_id, settings } = await request.json();
      let examId = id;
      let link_id = null;

      if(examId) {
          // Update Existing
          await env.DB.prepare("UPDATE exams SET title = ?, settings = ? WHERE id = ?")
            .bind(title, JSON.stringify(settings), examId).run();
          // We wipe questions to re-insert them (simpler than syncing)
          await env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(examId).run();
      } else {
          // Create New
          link_id = crypto.randomUUID();
          const res = await env.DB.prepare("INSERT INTO exams (link_id, title, teacher_id, settings) VALUES (?, ?, ?, ?)")
            .bind(link_id, title, teacher_id, JSON.stringify(settings)).run();
          examId = res.meta.last_row_id;
      }
      return Response.json({ success: true, id: examId, link_id });
    }

    if (path === '/api/exam/delete' && method === 'POST') {
        const { id } = await request.json();
        // Batch delete everything related to exam
        await env.DB.batch([
            env.DB.prepare("DELETE FROM exams WHERE id = ?").bind(id),
            env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(id),
            env.DB.prepare("DELETE FROM attempts WHERE exam_id = ?").bind(id)
        ]);
        return Response.json({ success: true });
    }

    if (path === '/api/exam/toggle' && method === 'POST') {
        const { id, is_active } = await request.json();
        await env.DB.prepare("UPDATE exams SET is_active = ? WHERE id = ?").bind(is_active ? 1 : 0, id).run();
        return Response.json({ success: true });
    }
    
    if (path === '/api/question/add' && method === 'POST') {
      const formData = await request.formData();
      const exam_id = formData.get('exam_id');
      const text = formData.get('text');
      const choices = formData.get('choices');
      const image = formData.get('image'); 

      let image_key = formData.get('existing_image_key'); 
      
      if (image && image.size > 0) {
        image_key = crypto.randomUUID();
        await env.BUCKET.put(image_key, image);
      }

      await env.DB.prepare("INSERT INTO questions (exam_id, text, image_key, choices) VALUES (?, ?, ?, ?)")
        .bind(exam_id, text, image_key, choices).run();
      return Response.json({ success: true });
    }

    if (path === '/api/teacher/exams' && method === 'GET') {
      const teacherId = url.searchParams.get('teacher_id');
      const exams = await env.DB.prepare("SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC").bind(teacherId).all();
      return Response.json(exams.results);
    }

    if (path === '/api/teacher/exam-details' && method === 'GET') {
        const examId = url.searchParams.get('id');
        const exam = await env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(examId).first();
        const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(examId).all();
        return Response.json({ exam, questions: questions.results });
    }

    // 4. STUDENT PORTAL
    if (path === '/api/student/portal-history' && method === 'POST') {
        const { school_id } = await request.json();
        const student = await env.DB.prepare("SELECT * FROM students WHERE school_id = ?").bind(school_id).first();
        
        if(!student) return Response.json({ found: false });

        const history = await env.DB.prepare(`
            SELECT a.*, e.title 
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
        
        if(student) {
            const stats = await env.DB.prepare(`
                SELECT COUNT(*) as total_exams, AVG(CAST(score AS FLOAT)/CAST(total AS FLOAT))*100 as avg_score 
                FROM attempts WHERE student_db_id = ?
            `).bind(student.id).first();
            return Response.json({ found: true, student, stats });
        }
        return Response.json({ found: false });
    }

    // 5. EXAM DATA
    if (path === '/api/exam/get' && method === 'GET') {
      const link_id = url.searchParams.get('link_id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE link_id = ?").bind(link_id).first();
      if(!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
      
      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
      return Response.json({ exam, questions: questions.results });
    }
    
    // Check eligibility
    if (path === '/api/student/check' && method === 'POST') {
        const { exam_id, school_id } = await request.json();
        const student = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(school_id).first();
        if(!student) return Response.json({ canTake: true });
        
        const attempt = await env.DB.prepare("SELECT id FROM attempts WHERE exam_id = ? AND student_db_id = ?").bind(exam_id, student.id).first();
        return Response.json({ canTake: !attempt });
    }

    if (path === '/api/submit' && method === 'POST') {
      const { link_id, student, answers, score, total } = await request.json();
      
      const exam = await env.DB.prepare("SELECT id FROM exams WHERE link_id = ?").bind(link_id).first();
      if(!exam) return Response.json({error: "Invalid Exam"});

      let studentRecord = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(student.school_id).first();
      
      if (!studentRecord) {
        const res = await env.DB.prepare("INSERT INTO students (school_id, name, roll) VALUES (?, ?, ?)")
          .bind(student.school_id, student.name, student.roll).run();
        studentRecord = { id: res.meta.last_row_id };
      } else {
        if(student.name) {
             await env.DB.prepare("UPDATE students SET name = ?, roll = ? WHERE id = ?")
            .bind(student.name, student.roll, studentRecord.id).run();
        }
      }

      await env.DB.prepare("INSERT INTO attempts (exam_id, student_db_id, score, total, details) VALUES (?, ?, ?, ?, ?)")
        .bind(exam.id, studentRecord.id, score, total, JSON.stringify(answers)).run();

      return Response.json({ success: true });
    }

    // 6. ANALYTICS
    if (path === '/api/analytics/exam' && method === 'GET') {
      const examId = url.searchParams.get('exam_id');
      const results = await env.DB.prepare(`
        SELECT a.*, s.name, s.school_id, s.roll 
        FROM attempts a 
        JOIN students s ON a.student_db_id = s.id 
        WHERE a.exam_id = ? 
        ORDER BY a.timestamp DESC
      `).bind(examId).all();
      return Response.json(results.results);
    }

    if (path === '/api/students/list' && method === 'GET') {
        const students = await env.DB.prepare(`
            SELECT s.*, COUNT(a.id) as exams_count, AVG(CAST(a.score AS FLOAT)/CAST(a.total AS FLOAT))*100 as avg_score 
            FROM students s 
            LEFT JOIN attempts a ON s.id = a.student_db_id 
            GROUP BY s.id
        `).all();
        return Response.json(students.results);
    }
    
    if (path === '/api/student/details' && method === 'GET') {
        const id = url.searchParams.get('id');
        const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
        const history = await env.DB.prepare(`
            SELECT a.*, e.title 
            FROM attempts a 
            JOIN exams e ON a.exam_id = e.id 
            WHERE a.student_db_id = ? 
            ORDER BY a.timestamp DESC
        `).bind(id).all();
        return Response.json({ student, history: history.results });
    }

    if (path === '/api/student/update' && method === 'POST') {
        const { id, name, roll } = await request.json();
        await env.DB.prepare("UPDATE students SET name = ?, roll = ? WHERE id = ?").bind(name, roll, id).run();
        return Response.json({ success: true });
    }

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
  return new Response("Not Found", { status: 404 });
}

// --- FRONTEND ---
function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ExamMaster SaaS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <!-- Confetti -->
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=Outfit:wght@300;500;800&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
      .font-display { font-family: 'Outfit', sans-serif; }
      .anim-enter { animation: slideUp 0.3s ease-out; }
      .anim-pop { animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes popIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      .glass { background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); }
      .trophy-shine { background: linear-gradient(45deg, #ffd700, #fff, #ffd700); background-size: 200% 200%; animation: shine 2s infinite; -webkit-background-clip: text; color: transparent; }
      @keyframes shine { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
    </style>
</head>
<body class="text-gray-900 antialiased">
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

        // --- ICONS ---
        const Icons = {
            Logo: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
            User: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
            Logout: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
            Plus: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
            Chart: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
            Users: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
            Edit: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
            Trash: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
            Setting: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
            Image: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
            Check: () => <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>,
            X: () => <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>,
            Trophy: () => <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/></svg>, // Simple star/trophy placeholder
        };

        function Toggle({ checked, onChange }) {
            return (
                <button onClick={() => onChange(!checked)} className={\`relative inline-flex h-6 w-11 items-center rounded-full transition-colors \${checked ? 'bg-green-500' : 'bg-gray-300'}\`}>
                    <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${checked ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
            );
        }

        function ToastContainer({ toasts }) {
            return (
                <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                    {toasts.map(t => (
                        <div key={t.id} className={\`p-4 rounded-lg shadow-xl text-white text-sm font-medium flex items-center gap-2 anim-pop \${t.type === 'error' ? 'bg-red-600' : 'bg-slate-900'}\`}>
                            {t.msg}
                        </div>
                    ))}
                </div>
            );
        }

        // --- DASHBOARD ---
        function DashboardLayout({ user, onLogout, title, action, children, activeTab, onTabChange }) {
            return (
                <div className="min-h-screen bg-gray-50 flex font-sans">
                    <aside className="w-64 bg-slate-900 text-white flex-col hidden md:flex sticky top-0 h-screen shadow-xl z-20">
                        <div className="p-6 flex items-center gap-3 border-b border-gray-800">
                            <div className="bg-indigo-500 p-1.5 rounded-lg text-white"><Icons.Logo /></div>
                            <span className="font-display font-bold text-xl tracking-tight">ExamMaster</span>
                        </div>
                        <nav className="flex-1 p-4 space-y-2">
                            <div className="px-4 py-2 text-xs uppercase text-gray-500 font-bold tracking-wider">Menu</div>
                            <button onClick={()=>onTabChange('exams')} className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition \${activeTab === 'exams' ? 'bg-indigo-600 shadow-lg shadow-indigo-900/50' : 'hover:bg-gray-800 text-gray-400'}\`}>
                                <Icons.Chart /> My Exams
                            </button>
                            {user.role === 'teacher' && (
                            <button onClick={()=>onTabChange('students')} className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition \${activeTab === 'students' ? 'bg-indigo-600 shadow-lg shadow-indigo-900/50' : 'hover:bg-gray-800 text-gray-400'}\`}>
                                <Icons.Users /> Students
                            </button>
                            )}
                            {user.role === 'super_admin' && (
                            <button onClick={()=>onTabChange('settings')} className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition \${activeTab === 'settings' ? 'bg-indigo-600 shadow-lg shadow-indigo-900/50' : 'hover:bg-gray-800 text-gray-400'}\`}>
                                <Icons.Setting /> Settings
                            </button>
                            )}
                        </nav>
                        <div className="p-4 border-t border-gray-800">
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-800/50 rounded-xl">
                                <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-sm font-bold">{user.name[0]}</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{user.name}</p>
                                    <p className="text-xs text-gray-400 truncate capitalize">{user.role.replace('_', ' ')}</p>
                                </div>
                                <button onClick={onLogout} className="text-gray-400 hover:text-white"><Icons.Logout /></button>
                            </div>
                        </div>
                    </aside>
                    <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                        <header className="bg-white border-b border-gray-200 px-8 py-5 flex justify-between items-center sticky top-0 z-10 shadow-sm backdrop-blur-md bg-white/80">
                            <h1 className="text-2xl font-display font-bold text-gray-900">{title}</h1>
                            {action}
                        </header>
                        <div className="flex-1 overflow-auto p-8">
                            {children}
                        </div>
                    </main>
                </div>
            );
        }

        // --- ADMIN VIEW ---
        function AdminView({ user, onLogout, addToast }) {
            const [activeTab, setActiveTab] = useState('settings');
            const [teachers, setTeachers] = useState([]);

            const handleReset = async () => {
                if(!confirm("⚠️ DANGER: This will delete ALL exams, questions, students, and results permanently. Are you sure?")) return;
                const res = await fetch('/api/system/reset', { method: 'POST' });
                if(res.ok) addToast("System has been factory reset.");
                else addToast("Reset failed.", 'error');
            };

            const addTeacher = async (e) => {
                e.preventDefault();
                const res = await fetch('/api/admin/teachers', {
                    method: 'POST',
                    body: JSON.stringify({ name: e.target.name.value, username: e.target.username.value, password: e.target.password.value })
                });
                if(res.ok) { addToast("Teacher Added"); e.target.reset(); }
                else addToast("Failed", 'error');
            };

            return (
                <DashboardLayout user={user} onLogout={onLogout} title="System Admin" activeTab={activeTab} onTabChange={setActiveTab}>
                    {activeTab === 'settings' && (
                        <div className="space-y-8 anim-enter">
                            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Teacher</h3>
                                <form onSubmit={addTeacher} className="flex gap-4">
                                    <input name="name" placeholder="Name" className="border p-2 rounded flex-1" required />
                                    <input name="username" placeholder="Username" className="border p-2 rounded flex-1" required />
                                    <input name="password" placeholder="Password" className="border p-2 rounded flex-1" required />
                                    <button className="bg-indigo-600 text-white px-6 rounded font-bold">Add</button>
                                </form>
                            </div>
                            <div className="bg-red-50 p-8 rounded-xl border border-red-200">
                                <h3 className="text-lg font-bold text-red-900 mb-2">Danger Zone</h3>
                                <p className="text-red-700 mb-4 text-sm">Performing a system reset will wipe all database records except admin accounts. This cannot be undone.</p>
                                <button onClick={handleReset} className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 shadow-lg shadow-red-200 transition">Factory Reset Database</button>
                            </div>
                        </div>
                    )}
                </DashboardLayout>
            );
        }

        // --- TEACHER VIEW ---
        function TeacherView({ user, onLogout, addToast }) {
            const [activeTab, setActiveTab] = useState('exams'); 
            const [view, setView] = useState('list'); 
            const [exams, setExams] = useState([]);
            const [editingExamId, setEditingExamId] = useState(null);
            const [activeExamId, setActiveExamId] = useState(null);

            useEffect(() => { loadExams(); }, []);
            const loadExams = async () => {
                const res = await fetch(\`/api/teacher/exams?teacher_id=\${user.id}\`);
                setExams(await res.json());
            };

            const toggleExam = async (id, currentState) => {
                await fetch('/api/exam/toggle', { method: 'POST', body: JSON.stringify({ id, is_active: !currentState }) });
                loadExams();
                addToast(\`Exam \${!currentState ? 'Enabled' : 'Disabled'}\`);
            };

            const deleteExam = async (id) => {
                if(!confirm("Are you sure you want to delete this exam and all its results?")) return;
                const res = await fetch('/api/exam/delete', { method: 'POST', body: JSON.stringify({ id }) });
                if(res.ok) { addToast("Exam Deleted"); loadExams(); }
            };

            const handleCreate = () => { setEditingExamId(null); setView('create'); }

            if (view === 'create') return <ExamCreator user={user} examId={editingExamId} onCancel={() => { setView('list'); setEditingExamId(null); }} onFinish={() => { setView('list'); loadExams(); addToast("Exam saved"); }} addToast={addToast} />;
            if (view === 'stats') return <DashboardLayout user={user} onLogout={onLogout} title="Analytics" activeTab={activeTab} onTabChange={setActiveTab} action={<button onClick={() => setView('list')} className="text-gray-500 font-bold">← Back</button>}><ExamStats examId={activeExamId} /></DashboardLayout>;

            return (
                <DashboardLayout user={user} onLogout={onLogout} title={activeTab === 'exams' ? "My Exams" : "Student Roster"} activeTab={activeTab} onTabChange={setActiveTab}
                    action={activeTab === 'exams' && <button onClick={handleCreate} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center gap-2"><Icons.Plus /> Create Exam</button>}
                >
                    {activeTab === 'exams' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 anim-enter">
                            {exams.map(exam => (
                                <div key={exam.id} className={\`relative bg-white rounded-xl shadow-sm border p-6 transition flex flex-col group \${exam.is_active ? 'border-gray-200 hover:shadow-md' : 'border-gray-200 opacity-75'}\`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <span className={\`text-xs font-bold px-2 py-1 rounded uppercase tracking-wide \${exam.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}\`}>{exam.is_active ? 'Active' : 'Closed'}</span>
                                        <div className="flex items-center gap-2">
                                            <Toggle checked={!!exam.is_active} onChange={()=>toggleExam(exam.id, exam.is_active)} />
                                            <button onClick={() => { setEditingExamId(exam.id); setView('create'); }} className="text-gray-400 hover:text-indigo-600 p-1"><Icons.Edit/></button>
                                            <button onClick={() => deleteExam(exam.id)} className="text-gray-400 hover:text-red-600 p-1"><Icons.Trash/></button>
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2 truncate">{exam.title}</h3>
                                    <p className="text-sm text-gray-500 mb-6 flex-1">Created: {new Date(exam.created_at).toLocaleDateString()}</p>
                                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                                        <button onClick={() => { if(!exam.is_active) return addToast("Enable exam to share", 'error'); navigator.clipboard.writeText(\`\${window.location.origin}/?exam=\${exam.link_id}\`); addToast("Link copied!"); }} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-bold transition">Share</button>
                                        <button onClick={() => { setActiveExamId(exam.id); setView('stats'); }} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 rounded-lg text-sm font-bold transition">Results</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {activeTab === 'students' && <StudentList addToast={addToast} />}
                </DashboardLayout>
            );
        }

        // --- EXAM CREATOR ---
        function ExamCreator({ user, examId, onCancel, onFinish, addToast }) {
            const [step, setStep] = useState('settings');
            const [settings, setSettings] = useState({ title: '', timerMode: 'question', timerValue: 30, studentFields: { name: true, roll: true, school_id: true }, allowBack: false, allowRetakes: false, showResult: true, showCorrect: false });
            const [questions, setQuestions] = useState([]);
            const [activeQIndex, setActiveQIndex] = useState(-1);
            const [currQ, setCurrQ] = useState({ text: '', choices: [{id:1, text:'', isCorrect:false}, {id:2, text:'', isCorrect:false}], image: null });

            useEffect(() => {
                if(examId) fetch(\`/api/teacher/exam-details?id=\${examId}\`).then(r=>r.json()).then(data => {
                    const s = JSON.parse(data.exam.settings || '{}');
                    setSettings({ ...settings, ...s, title: data.exam.title });
                    setQuestions(data.questions.map(q => ({...q, choices: JSON.parse(q.choices)})));
                });
            }, [examId]);

            const saveQ = () => {
                if(!currQ.text || !currQ.choices.some(c=>c.isCorrect)) return addToast("Question incomplete", 'error');
                
                if (activeQIndex > -1) {
                    // Update existing
                    const newQs = [...questions];
                    newQs[activeQIndex] = { ...currQ, tempId: currQ.tempId || Date.now() };
                    setQuestions(newQs);
                    addToast("Question Updated");
                } else {
                    // Add new
                    setQuestions([...questions, { ...currQ, tempId: Date.now() }]);
                    addToast("Question Added");
                }
                
                // Reset
                setCurrQ({ text: '', choices: [{id:Date.now(), text:'', isCorrect:false}, {id:Date.now()+1, text:'', isCorrect:false}], image: null });
                setActiveQIndex(-1);
            };

            const editQ = (index) => {
                setCurrQ(questions[index]);
                setActiveQIndex(index);
            };

            const publish = async () => {
                if(!settings.title) return addToast("Title required", 'error');
                if(questions.length===0) return addToast("Add questions", 'error');
                const res = await fetch('/api/exam/save', { method: 'POST', body: JSON.stringify({ id: examId, title: settings.title, teacher_id: user.id, settings }) });
                const data = await res.json();
                for(let q of questions) {
                    const fd = new FormData();
                    fd.append('exam_id', data.id);
                    fd.append('text', q.text);
                    fd.append('choices', JSON.stringify(q.choices));
                    if(q.image instanceof File) fd.append('image', q.image);
                    else if(q.image_key) fd.append('existing_image_key', q.image_key); 
                    await fetch('/api/question/add', { method: 'POST', body: fd });
                }
                onFinish();
            };

            return (
                <div className="flex h-screen bg-gray-100 font-sans">
                    <div className="w-80 bg-white border-r flex flex-col p-6 shadow-lg z-10">
                        <h2 className="font-bold text-xl mb-6 flex items-center gap-2"><button onClick={onCancel} className="text-gray-400 hover:text-black">←</button> {examId ? 'Edit Exam' : 'New Exam'}</h2>
                        <div className="space-y-6 flex-1 overflow-y-auto">
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Title</label><input value={settings.title} onChange={e=>setSettings({...settings, title:e.target.value})} className="w-full border-b-2 border-gray-200 p-2 font-bold outline-none focus:border-indigo-600 transition bg-transparent" placeholder="Exam Name" /></div>
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-gray-500 uppercase">Settings</label>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span className="text-sm font-medium">Back Button</span><Toggle checked={settings.allowBack} onChange={v=>setSettings({...settings, allowBack:v})} /></div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span className="text-sm font-medium">Retakes</span><Toggle checked={settings.allowRetakes} onChange={v=>setSettings({...settings, allowRetakes:v})} /></div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span className="text-sm font-medium">Show Score</span><Toggle checked={settings.showResult} onChange={v=>setSettings({...settings, showResult:v})} /></div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><span className="text-sm font-medium">Show Answers</span><Toggle checked={settings.showCorrect} onChange={v=>setSettings({...settings, showCorrect:v})} /></div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Timer</label>
                                <div className="flex gap-2 mt-2">
                                    <select value={settings.timerMode} onChange={e=>setSettings({...settings, timerMode:e.target.value})} className="border p-2 rounded text-sm"><option value="question">Per Q</option><option value="total">Total</option></select>
                                    <input type="number" value={settings.timerValue} onChange={e=>setSettings({...settings, timerValue:e.target.value})} className="border p-2 rounded w-20 text-sm" />
                                </div>
                            </div>
                        </div>
                        <button onClick={publish} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition mt-4">Publish Exam</button>
                    </div>
                    <div className="flex-1 p-10 overflow-y-auto">
                        <div className="max-w-3xl mx-auto">
                            <h3 className="font-bold text-2xl mb-6 text-gray-800">Questions ({questions.length})</h3>
                            
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 mb-8 anim-enter relative">
                                <h4 className="text-xs font-bold text-indigo-500 uppercase mb-4">{activeQIndex > -1 ? 'Editing Question' : 'New Question'}</h4>
                                <textarea value={currQ.text} onChange={e=>setCurrQ({...currQ, text:e.target.value})} className="w-full text-lg font-medium outline-none placeholder-gray-300 mb-4 resize-none" rows="2" placeholder="Type your question here..." autoFocus />
                                
                                <div className="mb-6">
                                    <label className="flex items-center gap-2 text-sm font-bold text-indigo-600 cursor-pointer bg-indigo-50 w-fit px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition">
                                        <Icons.Image /> {currQ.image ? 'Image Selected' : 'Add Image'}
                                        <input type="file" className="hidden" onChange={e=>setCurrQ({...currQ, image:e.target.files[0]})} />
                                    </label>
                                    {currQ.image && <div className="mt-2 text-xs text-gray-500">Selected: {currQ.image.name}</div>}
                                </div>

                                <div className="space-y-3">
                                    {currQ.choices.map((c, i) => (
                                        <div key={c.id} className="flex items-center gap-3">
                                            <div onClick={()=>setCurrQ({...currQ, choices: currQ.choices.map(x=>({...x, isCorrect:x.id===c.id}))})} className={\`w-6 h-6 rounded-full border-2 cursor-pointer flex items-center justify-center \${c.isCorrect ? 'border-green-500 bg-green-500' : 'border-gray-300'}\`}>{c.isCorrect && <span className="text-white text-xs">✓</span>}</div>
                                            <input value={c.text} onChange={e=>setCurrQ({...currQ, choices: currQ.choices.map(x=>x.id===c.id?{...x, text:e.target.value}:x)})} className="flex-1 border-b border-gray-200 p-2 outline-none focus:border-indigo-500 transition" placeholder={\`Option \${i+1}\`} />
                                            {currQ.choices.length > 2 && <button onClick={()=>setCurrQ({...currQ, choices: currQ.choices.filter(x=>x.id!==c.id)})} className="text-gray-300 hover:text-red-500">×</button>}
                                        </div>
                                    ))}
                                    <button onClick={()=>setCurrQ({...currQ, choices: [...currQ.choices, {id:Date.now(), text:'', isCorrect:false}]})} className="text-sm font-bold text-indigo-600 mt-2">+ Add Option</button>
                                </div>
                                <div className="mt-6 flex justify-end gap-2">
                                    {activeQIndex > -1 && <button onClick={()=>{setActiveQIndex(-1); setCurrQ({ text: '', choices: [{id:Date.now(), text:'', isCorrect:false}, {id:Date.now()+1, text:'', isCorrect:false}], image: null });}} className="text-gray-500 px-4 py-2 font-bold">Cancel Edit</button>}
                                    <button onClick={saveQ} className="bg-gray-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-black">{activeQIndex > -1 ? 'Update Question' : 'Add to List'}</button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {questions.map((q, i) => (
                                    <div key={i} onClick={() => editQ(i)} className={\`cursor-pointer bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center group hover:shadow-md transition \${activeQIndex === i ? 'ring-2 ring-indigo-500' : ''}\`}>
                                        <div className="flex items-center gap-4">
                                            <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-sm text-gray-500">{i+1}</span>
                                            <div>
                                                <p className="font-medium text-gray-900 line-clamp-1">{q.text}</p>
                                                <p className="text-xs text-gray-400">{q.choices.length} options • {q.image || q.image_key ? 'Has Image' : 'Text only'}</p>
                                            </div>
                                        </div>
                                        <button onClick={(e)=>{e.stopPropagation(); setQuestions(questions.filter((_, idx)=>idx!==i));}} className="text-gray-300 hover:text-red-500 transition px-2"><Icons.Trash /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // --- PUBLIC FACING (Student Hub & Landing) ---
        function Landing({ onTeacher, onStudent }) {
            return (
                <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
                    <div className="mb-8 p-4 bg-white rounded-full shadow-xl anim-pop"><div className="text-indigo-600"><Icons.Logo /></div></div>
                    <h1 className="text-5xl font-display font-black text-slate-900 mb-4 tracking-tight">ExamMaster.</h1>
                    <p className="text-gray-500 text-lg mb-10 max-w-md">The masterclass platform for testing, learning, and tracking progress.</p>
                    
                    <div className="grid gap-4 w-full max-w-sm">
                        <button onClick={onStudent} className="group relative w-full bg-indigo-600 text-white p-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition transform hover:-translate-y-1">
                            <span className="flex items-center justify-center gap-3">Student Hub <span className="opacity-70 group-hover:translate-x-1 transition">→</span></span>
                        </button>
                        <button onClick={onTeacher} className="w-full bg-white text-slate-700 p-5 rounded-2xl font-bold text-lg shadow-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition">
                            Teacher Access
                        </button>
                    </div>
                </div>
            );
        }

        function StudentPortal({ onBack }) {
            const [id, setId] = useState('');
            const [data, setData] = useState(null);
            const [reviewExam, setReviewExam] = useState(null);
            
            const fetchHistory = async (e) => {
                e.preventDefault();
                const res = await fetch('/api/student/portal-history', { method: 'POST', body: JSON.stringify({ school_id: id }) }).then(r=>r.json());
                if(res.found) setData(res);
                else alert("Student ID not found");
            };

            const viewReport = (attempt) => {
                // If the details are present, show them
                if (attempt.details) {
                    setReviewExam({ ...attempt, details: JSON.parse(attempt.details) });
                } else {
                    alert("Detailed report not available for this exam.");
                }
            };

            if (reviewExam) return (
                <div className="min-h-screen bg-gray-50 p-6">
                    <div className="max-w-2xl mx-auto anim-enter">
                        <button onClick={()=>setReviewExam(null)} className="text-gray-500 font-bold mb-6 hover:text-black">← Back to History</button>
                        <div className="bg-white p-8 rounded-3xl shadow-xl mb-6">
                            <div className="flex justify-between items-center mb-4">
                                <h1 className="text-2xl font-display font-bold text-gray-900">{reviewExam.title}</h1>
                                <span className={\`text-xl font-black \${(reviewExam.score/reviewExam.total)>0.7 ? 'text-green-500' : 'text-orange-500'}\`}>{reviewExam.score}/{reviewExam.total}</span>
                            </div>
                            <p className="text-gray-500 text-sm">Attempted on {new Date(reviewExam.timestamp).toLocaleString()}</p>
                        </div>
                        
                        <div className="space-y-4">
                            {reviewExam.details.map((d, i) => (
                                <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="font-bold text-gray-800 mb-2">Q{i+1}: {d.qText || "Question Text Unavailable"}</div>
                                    <div className="space-y-1 text-sm">
                                        <div className={\`p-2 rounded \${d.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}\`}>
                                            Your Answer: {d.selectedText || "None"}
                                        </div>
                                        {!d.isCorrect && (
                                            <div className="p-2 rounded bg-gray-100 text-gray-600">
                                                Correct Answer: {d.correctText || "Hidden"}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );

            if(data) return (
                <div className="min-h-screen bg-slate-50 p-6">
                    <div className="max-w-3xl mx-auto anim-enter">
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={()=>setData(null)} className="text-slate-500 font-bold hover:text-slate-800">← Logout</button>
                            <h2 className="text-slate-900 font-bold">Student Hub</h2>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="col-span-2 bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-3xl shadow-xl text-white">
                                <h1 className="text-3xl font-display font-bold mb-1">Hi, {data.student.name}</h1>
                                <p className="opacity-75">ID: {data.student.school_id}</p>
                                <div className="mt-6 flex gap-4">
                                    <div>
                                        <span className="text-3xl font-bold">{data.history.length}</span>
                                        <span className="block text-xs uppercase opacity-75 font-bold">Exams</span>
                                    </div>
                                    <div className="w-px bg-white/20"></div>
                                    <div>
                                        <span className="text-3xl font-bold">{Math.round(data.history.reduce((a,b)=>a+(b.score/b.total),0)/data.history.length * 100 || 0)}%</span>
                                        <span className="block text-xs uppercase opacity-75 font-bold">Avg Score</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center">
                                <h3 className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-3">Trophy Case</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {data.history.length > 0 && <div className="text-center" title="First Exam"><span className="text-2xl">🥉</span></div>}
                                    {data.history.some(h => (h.score/h.total) === 1) && <div className="text-center" title="Perfect Score"><span className="text-2xl">🏆</span></div>}
                                    {data.history.length > 5 && <div className="text-center" title="Veteran"><span className="text-2xl">🎖️</span></div>}
                                </div>
                                {data.history.length === 0 && <span className="text-xs text-gray-400">Complete exams to earn badges!</span>}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-400 uppercase text-xs tracking-wider ml-2">Exam History</h3>
                            {data.history.map(h => (
                                <div onClick={() => viewReport(h)} key={h.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center cursor-pointer hover:shadow-md transition group">
                                    <div>
                                        <h4 className="font-bold text-lg text-slate-800 group-hover:text-indigo-600 transition">{h.title}</h4>
                                        <p className="text-xs text-slate-400">{new Date(h.timestamp).toLocaleDateString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className={\`text-2xl font-black \${(h.score/h.total)>0.7 ? 'text-green-500' : 'text-orange-500'}\`}>{h.score}/{h.total}</div>
                                        <div className="text-xs font-bold text-slate-300 uppercase">Score</div>
                                    </div>
                                </div>
                            ))}
                            {data.history.length === 0 && <div className="text-center py-10 text-slate-400">No exams taken yet.</div>}
                        </div>
                    </div>
                </div>
            );

            return (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                    <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md text-center relative anim-pop">
                        <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 hover:text-gray-600">✕</button>
                        <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Student Hub</h2>
                        <p className="text-slate-500 mb-8">Enter your School ID to view your progress.</p>
                        <form onSubmit={fetchHistory}>
                            <input value={id} onChange={e=>setId(e.target.value)} className="w-full bg-slate-100 p-4 rounded-xl font-bold text-center text-xl mb-4 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. ST-2024-001" autoFocus />
                            <button className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition">Check Progress</button>
                        </form>
                    </div>
                </div>
            );
        }

        // --- APP ROOT & ROUTING ---
        function App() {
            const [status, setStatus] = useState(null);
            const [user, setUser] = useState(null);
            const [toasts, setToasts] = useState([]);
            const [route, setRoute] = useState('landing'); // landing, teacher-login, student-portal
            const urlParams = new URLSearchParams(window.location.search);
            const linkId = urlParams.get('exam');

            const addToast = (msg, type='success') => {
                const id = Date.now();
                setToasts(p => [...p, {id, msg, type}]);
                setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
            };

            useEffect(() => {
                if(!linkId) fetch('/api/system/status').then(r=>r.json()).then(setStatus);
            }, []);

            if(linkId) return <StudentApp linkId={linkId} />; // Direct Exam Link
            if(!status) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;

            if(!status.hasAdmin) return <><Setup onComplete={() => setStatus({hasAdmin:true})} addToast={addToast} /><ToastContainer toasts={toasts} /></>;

            // Main Routing
            if(user) {
                if(user.role === 'super_admin') return <><AdminView user={user} onLogout={()=>setUser(null)} addToast={addToast} /><ToastContainer toasts={toasts} /></>;
                return <><TeacherView user={user} onLogout={()=>setUser(null)} addToast={addToast} /><ToastContainer toasts={toasts} /></>;
            }

            if(route === 'student-portal') return <StudentPortal onBack={()=>setRoute('landing')} />;
            if(route === 'teacher-login') return <><Login onLogin={setUser} addToast={addToast} onBack={()=>setRoute('landing')} /><ToastContainer toasts={toasts} /></>;

            return <Landing onTeacher={()=>setRoute('teacher-login')} onStudent={()=>setRoute('student-portal')} />;
        }

        // --- REUSED COMPONENTS ---
        function Setup({ onComplete, addToast }) { 
             const handle = async (e) => { e.preventDefault(); const init = await fetch('/api/system/init', { method: 'POST' }); if(!init.ok) return addToast("Init Failed", 'error'); const res = await fetch('/api/auth/setup-admin', { method: 'POST', body: JSON.stringify({ name: e.target.name.value, username: e.target.username.value, password: e.target.password.value }) }); if(res.ok) onComplete(); else addToast("Failed", 'error'); };
             return (<div className="min-h-screen bg-slate-900 flex items-center justify-center"><form onSubmit={handle} className="bg-white p-8 rounded-2xl w-96"><h2 className="font-bold text-xl mb-4 text-slate-800">Install System</h2><input name="name" placeholder="Org Name" className="block w-full border p-2 mb-2 rounded" /><input name="username" placeholder="Admin User" className="block w-full border p-2 mb-2 rounded" /><input name="password" type="password" placeholder="Pass" className="block w-full border p-2 mb-4 rounded" /><button className="w-full bg-blue-600 text-white px-4 py-2 rounded font-bold">Install</button></form></div>);
        }
        function Login({ onLogin, addToast, onBack }) { 
             const handle = async (e) => { e.preventDefault(); const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: e.target.username.value, password: e.target.password.value }) }); const data = await res.json(); if(data.success) onLogin(data.user); else addToast("Login Failed", 'error'); };
             return (<div className="min-h-screen bg-gray-50 flex items-center justify-center"><form onSubmit={handle} className="bg-white p-10 rounded-3xl shadow-xl w-96 relative"><button type="button" onClick={onBack} className="absolute top-6 left-6 text-gray-400 font-bold">←</button><h2 className="font-bold text-2xl mb-8 text-center text-slate-900">Teacher Login</h2><input name="username" placeholder="Username" className="block w-full bg-gray-50 border-gray-200 border p-3 rounded-xl mb-4 font-medium outline-none focus:ring-2 focus:ring-indigo-500" /><input name="password" type="password" placeholder="Password" className="block w-full bg-gray-50 border-gray-200 border p-3 rounded-xl mb-6 font-medium outline-none focus:ring-2 focus:ring-indigo-500" /><button className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black transition">Sign In</button></form></div>);
        }
        function StudentApp({ linkId }) { return <div className="text-center p-10 font-bold">Please use the full Student App implementation from previous code... (Placeholder for brevity in this specific update, merging logic...)</div> }
        function StudentList({ addToast }) { return <div className="p-8">Student List Component</div> } 
        function ExamStats({ examId }) { return <div className="p-8">Stats for {examId}</div> }

        // MERGING BACK THE FULL STUDENT APP LOGIC BECAUSE I REPLACED IT WITH PLACEHOLDER ABOVE MISTAKENLY
        // Restoring StudentApp, StudentList, ExamStats fully below:
        
        StudentApp = function({ linkId }) {
            const [mode, setMode] = useState('identify'); const [student, setStudent] = useState({ name: '', school_id: '', roll: '' }); const [exam, setExam] = useState(null); const [history, setHistory] = useState(null); const [qIdx, setQIdx] = useState(0); const [score, setScore] = useState(0); const [answers, setAnswers] = useState({}); const [qTime, setQTime] = useState(0); const [totalTime, setTotalTime] = useState(0);
            useEffect(() => { fetch(\`/api/exam/get?link_id=\${linkId}\`).then(r => r.ok ? r.json() : null).then(data => { if(!data || !data.exam.is_active) return alert("Exam closed or invalid"); setExam(data); }); }, [linkId]);
            useEffect(() => { if(mode !== 'game' || !exam) return; const s = JSON.parse(exam.exam.settings || '{}'); const int = setInterval(() => { if(s.timerMode === 'question') { if(qTime > 0) setQTime(t=>t-1); else nextQ(); } else if(s.timerMode === 'total') { if(totalTime > 0) setTotalTime(t=>t-1); else finish(); } }, 1000); return () => clearInterval(int); }, [mode, qTime, totalTime, exam]);
            const nextQ = () => { if(qIdx < exam.questions.length - 1) { setQIdx(p=>p+1); const s = JSON.parse(exam.exam.settings || '{}'); if(s.timerMode === 'question') setQTime(s.timerValue || 30); } else finish(); };
            const finish = async () => { 
                let fs = 0; 
                // SNAPSHOT LOGIC
                const det = exam.questions.map(q => { 
                    const s = answers[q.id]; 
                    const choices = JSON.parse(q.choices);
                    const correctChoice = choices.find(x=>x.isCorrect);
                    const selectedChoice = choices.find(x=>x.id === s);
                    const c = correctChoice?.id; 
                    if(s===c) fs++; 
                    // Save text snapshot so if questions change, history is safe
                    return { 
                        qId: q.id, 
                        qText: q.text,
                        selected: s, 
                        selectedText: selectedChoice?.text || "Skipped",
                        correct: c, 
                        correctText: correctChoice?.text,
                        isCorrect: s===c 
                    }; 
                }); 
                setScore(fs); setMode('summary'); 
                if((fs/exam.questions.length)>0.7) confetti({particleCount:150, spread:70, origin:{y:0.6}}); 
                await fetch('/api/submit', { method: 'POST', body: JSON.stringify({ link_id: linkId, student, score: fs, total: exam.questions.length, answers: det }) }); 
            };
            if(!exam) return <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white">Loading...</div>;
            const settings = JSON.parse(exam.exam.settings || '{}');
            
            if(mode === 'identify') return (<div className="min-h-screen bg-gradient-to-br from-indigo-900 to-purple-800 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md text-center anim-pop"><h1 className="text-2xl font-black mb-4">Login</h1><input className="w-full bg-gray-100 p-4 rounded-xl font-bold mb-4" placeholder="ID Number" value={student.school_id} onChange={e=>setStudent({...student, school_id:e.target.value})} /><button onClick={async()=>{ const r=await fetch('/api/student/identify', {method:'POST', body:JSON.stringify({school_id:student.school_id})}).then(x=>x.json()); if(r.found) { setStudent({...r.student, ...student}); setHistory(r.stats); setMode('lobby'); } else setMode('register'); }} className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl">Next</button></div></div>);
            if(mode === 'register') return (<div className="min-h-screen bg-indigo-900 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-3xl w-full max-w-md anim-pop"><h2 className="font-bold text-2xl mb-4">New Student</h2><input className="w-full bg-gray-100 p-3 rounded-lg mb-4" placeholder="Name" value={student.name} onChange={e=>setStudent({...student, name:e.target.value})} /><input className="w-full bg-gray-100 p-3 rounded-lg mb-4" placeholder="Roll" value={student.roll} onChange={e=>setStudent({...student, roll:e.target.value})} /><button onClick={()=>setMode('lobby')} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg">Save</button></div></div>);
            if(mode === 'lobby') return (<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md text-center anim-pop"><h2 className="text-3xl font-black mb-2">Hi, {student.name}!</h2><p className="text-gray-500 mb-8">{exam.exam.title}</p><button onClick={async()=>{ if(!settings.allowRetakes){ const c=await fetch('/api/student/check', {method:'POST', body:JSON.stringify({exam_id:exam.exam.id, school_id:student.school_id})}).then(r=>r.json()); if(!c.canTake) return alert("Already taken"); } setMode('game'); if(settings.timerMode==='question') setQTime(settings.timerValue||30); if(settings.timerMode==='total') setTotalTime((settings.timerValue||10)*60); }} className="w-full bg-indigo-600 text-white font-black text-xl py-4 rounded-xl shadow-lg">Start Exam</button></div></div>);
            if(mode === 'game') return (<div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4"><div className="w-full max-w-2xl bg-slate-800 p-4 rounded-xl mb-8 flex justify-between"><span>Q {qIdx+1}</span><span className="font-mono font-bold text-xl">{(settings.timerMode==='question'?qTime:totalTime)}s</span></div><div className="w-full max-w-2xl text-center"><div className="bg-white text-black p-8 rounded-3xl mb-4">{exam.questions[qIdx].image_key && <img src={\`/img/\${exam.questions[qIdx].image_key}\`} className="max-h-48 mx-auto mb-4"/>}<h2 className="text-2xl font-bold">{exam.questions[qIdx].text}</h2></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{JSON.parse(exam.questions[qIdx].choices).map(c=><button key={c.id} onClick={()=>{ setAnswers({...answers, [exam.questions[qIdx].id]:c.id}); if(settings.timerMode==='question') setTimeout(nextQ, 300); }} className={\`p-6 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-left font-bold \${answers[exam.questions[qIdx].id]===c.id?'ring-2 ring-indigo-500':''}\`}>{c.text}</button>)}</div><div className="mt-8 flex justify-between">{settings.allowBack && <button onClick={()=>setQIdx(Math.max(0, qIdx-1))} className="px-6 py-2 bg-slate-700 rounded-lg">Back</button>}{settings.timerMode==='total' && <button onClick={qIdx===exam.questions.length-1?finish:()=>setQIdx(qIdx+1)} className="px-6 py-2 bg-white text-black rounded-lg">Next</button>}</div></div></div>);
            if(mode === 'summary') return (<div className="min-h-screen bg-gray-900 flex items-center justify-center text-center p-4"><div className="bg-gray-800 p-10 rounded-3xl border border-gray-700"><h2 className="text-4xl font-bold text-white mb-4">Finished!</h2><div className="text-6xl font-black text-green-400 mb-8">{score} / {exam.questions.length}</div><button onClick={()=>window.location.href='/'} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold">Done</button></div></div>);
        }

        StudentList = function({ addToast }) {
            const [students, setStudents] = useState([]);
            useEffect(() => { fetch('/api/students/list').then(r=>r.json()).then(setStudents); }, []);
            return (<div className="bg-white rounded-xl border overflow-hidden"><table className="w-full text-left"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-4">Name</th><th className="p-4">ID</th><th className="p-4">Score</th></tr></thead><tbody>{students.map(s=><tr key={s.id} className="border-t hover:bg-gray-50"><td className="p-4 font-bold">{s.name}</td><td className="p-4 font-mono text-xs">{s.school_id}</td><td className="p-4"><span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">{Math.round(s.avg_score||0)}%</span></td></tr>)}</tbody></table></div>);
        }

        ExamStats = function({ examId }) {
            const [data, setData] = useState([]);
            const [viewDetail, setViewDetail] = useState(null);
            
            useEffect(() => { fetch(\`/api/analytics/exam?exam_id=\${examId}\`).then(r=>r.json()).then(setData); }, [examId]);
            
            if(viewDetail) return (
                <div className="bg-white rounded-xl border p-6 anim-enter">
                    <button onClick={()=>setViewDetail(null)} className="mb-4 text-sm font-bold text-gray-500">← Back to List</button>
                    <h3 className="font-bold text-xl mb-4">{viewDetail.name}'s Answers</h3>
                    <div className="space-y-4">
                        {JSON.parse(viewDetail.details || '[]').map((d,i) => (
                            <div key={i} className={\`p-4 rounded-lg border \${d.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}\`}>
                                <div className="font-bold text-gray-800 mb-1">Q{i+1}: {d.qText}</div>
                                <div className="text-sm">
                                    <span className="font-bold">Student:</span> {d.selectedText} 
                                    {!d.isCorrect && <span className="ml-4 text-gray-600"><span className="font-bold">Correct:</span> {d.correctText}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )

            return (
                <div className="bg-white rounded-xl border p-6">
                    <h3 className="font-bold mb-4">Submissions ({data.length})</h3>
                    <div className="space-y-2">
                        {data.map(r=>(
                            <div key={r.id} className="flex justify-between border-b pb-2 items-center">
                                <div>
                                    <div className="font-bold">{r.name}</div>
                                    <div className="text-xs text-gray-500">{new Date(r.timestamp).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="font-bold text-lg">{r.score}/{r.total}</span>
                                    <button onClick={()=>setViewDetail(r)} className="text-indigo-600 text-xs font-bold border border-indigo-200 px-2 py-1 rounded hover:bg-indigo-50">View Answers</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;
}
