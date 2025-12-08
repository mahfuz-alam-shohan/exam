/**
 * Cloudflare Worker - Exam System (SaaS Ultimate)
 * - Roles: 'super_admin' (Owner), 'teacher' (Creators), 'student' (Takers)
 * - Features: Smart ID Check, Student Progress History, Link Toggle, Result Review, Edit Student Data
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
    // 1. SYSTEM INIT & MIGRATION
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
        // Base Tables
        await env.DB.batch([
          env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, role TEXT DEFAULT 'teacher', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id TEXT UNIQUE, name TEXT, roll TEXT, extra_info TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT UNIQUE, title TEXT, teacher_id INTEGER, settings TEXT, is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, text TEXT, image_key TEXT, choices TEXT)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, student_db_id INTEGER, score INTEGER, total INTEGER, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_db_id) REFERENCES students(id))")
        ]);
        
        // MIGRATIONS (Try to add columns if missing for updates)
        try { await env.DB.prepare("ALTER TABLE students ADD COLUMN extra_info TEXT").run(); } catch(e) {}
        try { await env.DB.prepare("ALTER TABLE exams ADD COLUMN is_active BOOLEAN DEFAULT 1").run(); } catch(e) {}

        return Response.json({ success: true });
      } catch (err) {
        return Response.json({ error: "DB Init Error: " + err.message }, { status: 500 });
      }
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

      let image_key = null;
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

    // 4. STUDENT ENTRY & SMART CHECK
    if (path === '/api/exam/get' && method === 'GET') {
      const link_id = url.searchParams.get('link_id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE link_id = ?").bind(link_id).first();
      if(!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
      
      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
      return Response.json({ exam, questions: questions.results });
    }
    
    if (path === '/api/student/identify' && method === 'POST') {
        const { school_id } = await request.json();
        const student = await env.DB.prepare("SELECT * FROM students WHERE school_id = ?").bind(school_id).first();
        
        if(student) {
            // Get history stats
            const stats = await env.DB.prepare(`
                SELECT COUNT(*) as total_exams, AVG(CAST(score AS FLOAT)/CAST(total AS FLOAT))*100 as avg_score 
                FROM attempts WHERE student_db_id = ?
            `).bind(student.id).first();
            return Response.json({ found: true, student, stats });
        }
        return Response.json({ found: false });
    }

    // 5. SUBMISSION & DATA
    if (path === '/api/submit' && method === 'POST') {
      const { link_id, student, answers, score, total } = await request.json();
      
      const exam = await env.DB.prepare("SELECT id FROM exams WHERE link_id = ?").bind(link_id).first();
      if(!exam) return Response.json({error: "Invalid Exam"});

      // Student Sync (Upsert)
      let studentRecord = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(student.school_id).first();
      
      if (!studentRecord) {
        const res = await env.DB.prepare("INSERT INTO students (school_id, name, roll) VALUES (?, ?, ?)")
          .bind(student.school_id, student.name, student.roll).run();
        studentRecord = { id: res.meta.last_row_id };
      } else {
        // Only update if provided
        if(student.name) {
             await env.DB.prepare("UPDATE students SET name = ?, roll = ? WHERE id = ?")
            .bind(student.name, student.roll, studentRecord.id).run();
        }
      }

      await env.DB.prepare("INSERT INTO attempts (exam_id, student_db_id, score, total, details) VALUES (?, ?, ?, ?, ?)")
        .bind(exam.id, studentRecord.id, score, total, JSON.stringify(answers)).run();

      return Response.json({ success: true });
    }

    // 6. ANALYTICS & STUDENT MANAGEMENT
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
      body { font-family: 'Inter', sans-serif; }
      .font-display { font-family: 'Outfit', sans-serif; }
      .anim-enter { animation: slideUp 0.3s ease-out; }
      .anim-pop { animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes popIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 antialiased">
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

        // --- ICONS & UI HELPERS ---
        const Icons = {
            Logo: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
            User: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
            Logout: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
            Plus: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
            Chart: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
            Users: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
            Edit: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
            Eye: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
            Lock: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
            Unlock: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>,
        };

        function Toggle({ checked, onChange }) {
            return (
                <button onClick={() => onChange(!checked)} className={\`relative inline-flex h-6 w-11 items-center rounded-full transition-colors \${checked ? 'bg-green-500' : 'bg-gray-300'}\`}>
                    <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${checked ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
            );
        }

        // --- TOAST ---
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

        // --- DASHBOARD LAYOUT ---
        function DashboardLayout({ user, onLogout, title, action, children, activeTab, onTabChange }) {
            return (
                <div className="min-h-screen bg-gray-50 flex font-sans">
                    {/* Sidebar */}
                    <aside className="w-64 bg-slate-900 text-white flex-col hidden md:flex sticky top-0 h-screen">
                        <div className="p-6 flex items-center gap-3 border-b border-gray-800">
                            <div className="bg-indigo-500 p-1.5 rounded-lg text-white"><Icons.Logo /></div>
                            <span className="font-display font-bold text-xl tracking-tight">ExamMaster</span>
                        </div>
                        <nav className="flex-1 p-4 space-y-2">
                            <div className="px-4 py-2 text-xs uppercase text-gray-500 font-bold tracking-wider">Menu</div>
                            <button onClick={()=>onTabChange && onTabChange('exams')} className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition \${activeTab === 'exams' ? 'bg-indigo-600 shadow-lg shadow-indigo-900/50' : 'hover:bg-gray-800 text-gray-400'}\`}>
                                <Icons.Chart /> My Exams
                            </button>
                            {user.role === 'teacher' && (
                            <button onClick={()=>onTabChange && onTabChange('students')} className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition \${activeTab === 'students' ? 'bg-indigo-600 shadow-lg shadow-indigo-900/50' : 'hover:bg-gray-800 text-gray-400'}\`}>
                                <Icons.Users /> Students
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

                    {/* Main Content */}
                    <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <header className="bg-white border-b border-gray-200 px-8 py-5 flex justify-between items-center sticky top-0 z-20 shadow-sm">
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
                await fetch('/api/exam/toggle', {
                    method: 'POST',
                    body: JSON.stringify({ id, is_active: !currentState })
                });
                loadExams();
                addToast(\`Exam \${!currentState ? 'Enabled' : 'Disabled'}\`);
            };

            const handleCreate = () => { setEditingExamId(null); setView('create'); }

            if (view === 'create') {
                return (
                    <ExamCreator 
                        user={user} 
                        examId={editingExamId}
                        onCancel={() => { setView('list'); setEditingExamId(null); }} 
                        onFinish={() => { setView('list'); loadExams(); addToast("Exam saved successfully"); }} 
                        addToast={addToast} 
                    />
                );
            }

            if (view === 'stats') {
                return (
                     <DashboardLayout user={user} onLogout={onLogout} title="Analytics" activeTab={activeTab} onTabChange={setActiveTab}
                        action={<button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900">Back</button>}>
                        <ExamStats examId={activeExamId} onBack={() => setView('list')} />
                    </DashboardLayout>
                );
            }

            return (
                <DashboardLayout 
                    user={user} 
                    onLogout={onLogout} 
                    title={activeTab === 'exams' ? "My Exams" : "Student Roster"} 
                    activeTab={activeTab} 
                    onTabChange={setActiveTab}
                    action={activeTab === 'exams' && <button onClick={handleCreate} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center gap-2"><Icons.Plus /> Create Exam</button>}
                >
                    {activeTab === 'exams' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 anim-enter">
                            {exams.map(exam => (
                                <div key={exam.id} className={\`rounded-xl shadow-sm border p-6 transition flex flex-col group \${exam.is_active ? 'bg-white border-gray-200 hover:shadow-md' : 'bg-gray-50 border-gray-200 opacity-75'}\`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className={\`text-xs font-bold px-2 py-1 rounded uppercase tracking-wide \${exam.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}\`}>
                                                {exam.is_active ? 'Active' : 'Closed'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Toggle checked={!!exam.is_active} onChange={()=>toggleExam(exam.id, exam.is_active)} />
                                            <button onClick={() => { setEditingExamId(exam.id); setView('create'); }} className="text-gray-400 hover:text-indigo-600"><Icons.Edit/></button>
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">{exam.title}</h3>
                                    <p className="text-sm text-gray-500 mb-6 flex-1">Created on {new Date(exam.created_at).toLocaleDateString()}</p>
                                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                                        <button onClick={() => {
                                            if(!exam.is_active) return addToast("Enable exam to share link", 'error');
                                            navigator.clipboard.writeText(\`\${window.location.origin}/?exam=\${exam.link_id}\`);
                                            addToast("Link copied to clipboard");
                                        }} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium transition">Share</button>
                                        <button onClick={() => { setActiveExamId(exam.id); setView('stats'); }} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 rounded-lg text-sm font-medium transition">Stats</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {activeTab === 'students' && <StudentList addToast={addToast} />}
                </DashboardLayout>
            );
        }

        // --- STUDENT LIST (Advanced) ---
        function StudentList({ addToast }) {
            const [students, setStudents] = useState([]);
            const [selectedStudent, setSelectedStudent] = useState(null);
            
            useEffect(() => { load(); }, []);
            const load = () => fetch('/api/students/list').then(r=>r.json()).then(setStudents);

            const handleUpdate = async (e) => {
                e.preventDefault();
                const res = await fetch('/api/student/update', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        id: selectedStudent.student.id,
                        name: e.target.name.value,
                        roll: e.target.roll.value
                    })
                });
                if(res.ok) {
                    addToast("Student updated");
                    setSelectedStudent(null);
                    load();
                }
            };

            const viewDetails = async (id) => {
                const data = await fetch(\`/api/student/details?id=\${id}\`).then(r=>r.json());
                setSelectedStudent(data);
            };

            return (
                <div className="anim-enter">
                    {selectedStudent ? (
                         <div className="bg-white rounded-xl shadow-lg border p-8 max-w-3xl mx-auto">
                            <div className="flex justify-between items-start mb-6 border-b pb-4">
                                <h2 className="text-2xl font-bold text-gray-900">Student Profile</h2>
                                <button onClick={()=>setSelectedStudent(null)} className="text-gray-500 hover:text-gray-900">Close</button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                                <div className="md:col-span-1 bg-gray-50 p-6 rounded-xl border">
                                    <form onSubmit={handleUpdate} className="space-y-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
                                            <input name="name" defaultValue={selectedStudent.student.name} className="w-full border p-2 rounded bg-white" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase">Roll No</label>
                                            <input name="roll" defaultValue={selectedStudent.student.roll} className="w-full border p-2 rounded bg-white" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase">School ID</label>
                                            <div className="p-2 bg-gray-200 rounded text-gray-600 text-sm font-mono">{selectedStudent.student.school_id}</div>
                                        </div>
                                        <button className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700">Save Changes</button>
                                    </form>
                                </div>
                                <div className="md:col-span-2">
                                    <h3 className="font-bold text-gray-800 mb-4">Exam History</h3>
                                    <div className="space-y-3 max-h-64 overflow-y-auto">
                                        {selectedStudent.history.map(h => (
                                            <div key={h.id} className="flex justify-between items-center p-3 bg-white border rounded-lg shadow-sm">
                                                <div>
                                                    <div className="font-bold text-sm">{h.title}</div>
                                                    <div className="text-xs text-gray-500">{new Date(h.timestamp).toLocaleDateString()}</div>
                                                </div>
                                                <div className={\`font-bold \${(h.score/h.total) > 0.7 ? 'text-green-600' : 'text-orange-500'}\`}>
                                                    {h.score}/{h.total}
                                                </div>
                                            </div>
                                        ))}
                                        {selectedStudent.history.length === 0 && <p className="text-gray-400 italic">No exams taken yet.</p>}
                                    </div>
                                </div>
                            </div>
                         </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Student Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Roll</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Progress</th>
                                        <th className="px-6 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {students.map(s => (
                                        <tr key={s.id} className="hover:bg-gray-50 group">
                                            <td className="px-6 py-4 font-medium text-gray-900">{s.name}</td>
                                            <td className="px-6 py-4 text-gray-500 font-mono text-xs">{s.school_id}</td>
                                            <td className="px-6 py-4 text-gray-500">{s.roll}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 bg-gray-200 rounded-full h-2">
                                                        <div className="bg-green-500 h-2 rounded-full" style={{width: \`\${s.avg_score || 0}%\`}}></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-600">{Math.round(s.avg_score || 0)}%</span>
                                                </div>
                                                <div className="text-xs text-gray-400 mt-1">{s.exams_count} Exams</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={()=>viewDetails(s.id)} className="text-indigo-600 font-medium text-sm hover:underline opacity-0 group-hover:opacity-100 transition">View Profile</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            );
        }

        // --- EXAM CREATOR ---
        function ExamCreator({ user, examId, onCancel, onFinish, addToast }) {
            const [step, setStep] = useState('settings');
            const [settings, setSettings] = useState({
                title: '', timerMode: 'question', timerValue: 30, studentFields: { name: true, roll: true, school_id: true },
                allowBack: false, allowRetakes: false, showResult: true, showCorrect: false
            });
            const [questions, setQuestions] = useState([]);
            const [currQ, setCurrQ] = useState({ text: '', choices: [{id:1, text:'', isCorrect:false}, {id:2, text:'', isCorrect:false}], image: null });

            // ... (Load Logic same as before, ensuring we load new settings fields)
            useEffect(() => {
                if(examId) {
                    fetch(\`/api/teacher/exam-details?id=\${examId}\`).then(r=>r.json()).then(data => {
                        const s = JSON.parse(data.exam.settings || '{}');
                        setSettings({ ...settings, ...s, title: data.exam.title });
                        setQuestions(data.questions.map(q => ({...q, choices: JSON.parse(q.choices)})));
                    });
                }
            }, [examId]);

            const saveQ = () => {
                if(!currQ.text || !currQ.choices.some(c=>c.isCorrect)) return addToast("Invalid Question", 'error');
                setQuestions([...questions, { ...currQ, tempId: Date.now() }]);
                setCurrQ({ text: '', choices: [{id:Date.now(), text:'', isCorrect:false}, {id:Date.now()+1, text:'', isCorrect:false}], image: null });
            };

            const publish = async () => {
                if(!settings.title) return addToast("Title missing", 'error');
                if(questions.length===0) return addToast("No questions", 'error');
                const res = await fetch('/api/exam/save', { method: 'POST', body: JSON.stringify({ id: examId, title: settings.title, teacher_id: user.id, settings }) });
                const data = await res.json();
                for(let q of questions) {
                    const fd = new FormData();
                    fd.append('exam_id', data.id);
                    fd.append('text', q.text);
                    fd.append('choices', JSON.stringify(q.choices));
                    if(q.image instanceof File) fd.append('image', q.image);
                    await fetch('/api/question/add', { method: 'POST', body: fd });
                }
                onFinish();
            };

            return (
                <div className="flex h-[calc(100vh-80px)] bg-white rounded-xl shadow overflow-hidden">
                    <div className="w-1/3 bg-gray-50 border-r p-6 overflow-y-auto">
                        <h3 className="font-bold text-gray-900 mb-6">Exam Settings</h3>
                        <div className="space-y-6">
                            <div><label className="text-sm font-bold block mb-1">Title</label><input value={settings.title} onChange={e=>setSettings({...settings, title:e.target.value})} className="w-full border p-2 rounded" /></div>
                            
                            <div className="bg-white p-4 rounded border space-y-3">
                                <label className="flex items-center justify-between"><span className="text-sm">Allow Back Nav</span><input type="checkbox" checked={settings.allowBack} onChange={e=>setSettings({...settings, allowBack:e.target.checked})} /></label>
                                <label className="flex items-center justify-between"><span className="text-sm">Allow Retakes</span><input type="checkbox" checked={settings.allowRetakes} onChange={e=>setSettings({...settings, allowRetakes:e.target.checked})} /></label>
                                <label className="flex items-center justify-between"><span className="text-sm">Show Score</span><input type="checkbox" checked={settings.showResult} onChange={e=>setSettings({...settings, showResult:e.target.checked})} /></label>
                                <label className="flex items-center justify-between"><span className="text-sm">Show Correct Answers</span><input type="checkbox" checked={settings.showCorrect} onChange={e=>setSettings({...settings, showCorrect:e.target.checked})} /></label>
                            </div>

                            <div>
                                <h4 className="font-bold text-sm mb-2">Timer</h4>
                                <select value={settings.timerMode} onChange={e=>setSettings({...settings, timerMode:e.target.value})} className="w-full border p-2 rounded mb-2"><option value="question">Per Question</option><option value="total">Total Exam</option></select>
                                <input type="number" value={settings.timerValue} onChange={e=>setSettings({...settings, timerValue:e.target.value})} className="w-full border p-2 rounded" placeholder="Duration" />
                            </div>

                            <button onClick={publish} className="w-full bg-indigo-600 text-white py-3 rounded font-bold">Publish Exam</button>
                            <button onClick={onCancel} className="w-full text-gray-500 py-2">Cancel</button>
                        </div>
                    </div>
                    
                    <div className="flex-1 p-8 overflow-y-auto">
                         <h3 className="font-bold text-xl mb-4">Questions ({questions.length})</h3>
                         <div className="mb-6 bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                            <textarea value={currQ.text} onChange={e=>setCurrQ({...currQ, text:e.target.value})} className="w-full p-3 border rounded mb-3" placeholder="Question Text..." />
                            {currQ.choices.map((c, i) => (
                                <div key={c.id} className="flex gap-2 mb-2">
                                    <input type="radio" name="c" checked={c.isCorrect} onChange={()=>setCurrQ({...currQ, choices: currQ.choices.map(x=>({...x, isCorrect:x.id===c.id}))})} />
                                    <input value={c.text} onChange={e=>setCurrQ({...currQ, choices: currQ.choices.map(x=>x.id===c.id?{...x, text:e.target.value}:x)})} className="flex-1 border p-2 rounded" placeholder="Option" />
                                </div>
                            ))}
                            <button onClick={()=>setCurrQ({...currQ, choices: [...currQ.choices, {id:Date.now(), text:'', isCorrect:false}]})} className="text-xs text-blue-600 font-bold mb-4">+ Add Option</button>
                            <button onClick={saveQ} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold">Add Question</button>
                         </div>
                         
                         <div className="space-y-2">
                            {questions.map((q, i) => (
                                <div key={i} className="p-3 bg-white border rounded flex justify-between">
                                    <span>{i+1}. {q.text}</span>
                                    <button onClick={()=>setQuestions(questions.filter((_, idx)=>idx!==i))} className="text-red-500">Delete</button>
                                </div>
                            ))}
                         </div>
                    </div>
                </div>
            );
        }
        
        // --- STUDENT APP (Advanced Flow) ---
        function StudentApp({ linkId }) {
            const [mode, setMode] = useState('identify'); // identify, register, lobby, game, summary, review
            const [student, setStudent] = useState({ name: '', school_id: '', roll: '' });
            const [exam, setExam] = useState(null);
            const [history, setHistory] = useState(null); // Previous attempts of this student
            
            // Game State
            const [qIdx, setQIdx] = useState(0);
            const [score, setScore] = useState(0);
            const [answers, setAnswers] = useState({}); // { qId: choiceId }
            const [qTime, setQTime] = useState(0);
            const [totalTime, setTotalTime] = useState(0);

            useEffect(() => {
                fetch(\`/api/exam/get?link_id=\${linkId}\`).then(r => r.ok ? r.json() : null).then(data => {
                    if(!data) return alert("Invalid or Closed Link");
                    if(!data.exam.is_active) return alert("This exam is currently closed.");
                    setExam(data);
                });
            }, [linkId]);

            // Timer Tick
            useEffect(() => {
                if(mode !== 'game' || !exam) return;
                const settings = JSON.parse(exam.exam.settings || '{}');
                const interval = setInterval(() => {
                    if(settings.timerMode === 'question') {
                        if(qTime > 0) setQTime(t => t - 1);
                        else nextQ(); 
                    } else if(settings.timerMode === 'total') {
                        if(totalTime > 0) setTotalTime(t => t - 1);
                        else finish(); 
                    }
                }, 1000);
                return () => clearInterval(interval);
            }, [mode, qTime, totalTime, exam]);

            const checkIdentity = async (e) => {
                e.preventDefault();
                const res = await fetch('/api/student/identify', {
                    method: 'POST',
                    body: JSON.stringify({ school_id: student.school_id })
                }).then(r=>r.json());

                if(res.found) {
                    setStudent({ ...res.student, ...student }); // Keep entered ID, fill rest
                    setHistory(res.stats); // { total_exams, avg_score }
                    setMode('lobby');
                } else {
                    setMode('register');
                }
            };

            const startGame = async () => {
                // Check retakes
                const settings = JSON.parse(exam.exam.settings || '{}');
                if(!settings.allowRetakes) {
                    const check = await fetch('/api/student/check', { method: 'POST', body: JSON.stringify({ exam_id: exam.exam.id, school_id: student.school_id }) }).then(r=>r.json());
                    if(!check.canTake) return alert("You have already taken this exam.");
                }
                
                setMode('game');
                if(settings.timerMode === 'question') setQTime(settings.timerValue || 30);
                if(settings.timerMode === 'total') setTotalTime((settings.timerValue || 10) * 60);
            };

            const handleAnswer = (choiceId) => {
                const q = exam.questions[qIdx];
                setAnswers(prev => ({ ...prev, [q.id]: choiceId }));
                const settings = JSON.parse(exam.exam.settings || '{}');
                if(settings.timerMode === 'question') setTimeout(nextQ, 300);
            };

            const nextQ = () => {
                if(qIdx < exam.questions.length - 1) {
                    setQIdx(prev => prev + 1);
                    const settings = JSON.parse(exam.exam.settings || '{}');
                    if(settings.timerMode === 'question') setQTime(settings.timerValue || 30);
                } else {
                    finish();
                }
            };

            const finish = async () => {
                let finalScore = 0;
                const detailed = exam.questions.map(q => {
                    const sel = answers[q.id];
                    const choices = JSON.parse(q.choices);
                    const correct = choices.find(c => c.isCorrect)?.id;
                    if(sel === correct) finalScore++;
                    return { qId: q.id, selected: sel, correct, isCorrect: sel===correct };
                });
                setScore(finalScore);
                setMode('summary');
                
                // Confetti if score > 70%
                if((finalScore/exam.questions.length) > 0.7) confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

                await fetch('/api/submit', {
                    method: 'POST',
                    body: JSON.stringify({ link_id: linkId, student, score: finalScore, total: exam.questions.length, answers: detailed })
                });
            };

            if(!exam) return <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white">Loading Exam...</div>;
            const settings = JSON.parse(exam.exam.settings || '{}');

            // --- VIEW: IDENTIFY ---
            if(mode === 'identify') return (
                <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-purple-800 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md text-center anim-pop">
                        <div className="mb-6"><div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full mx-auto flex items-center justify-center"><Icons.User /></div></div>
                        <h1 className="text-2xl font-black text-gray-800 mb-2">Student Login</h1>
                        <p className="text-gray-500 mb-6">Enter your School ID to continue</p>
                        <form onSubmit={checkIdentity}>
                            <input required value={student.school_id} onChange={e=>setStudent({...student, school_id:e.target.value})} className="w-full bg-gray-100 rounded-xl px-4 py-3 font-bold text-center text-xl text-gray-800 outline-none focus:ring-2 ring-purple-500 mb-4" placeholder="ID Number" />
                            <button className="w-full bg-purple-600 text-white font-black py-4 rounded-xl hover:bg-purple-700 transition">NEXT →</button>
                        </form>
                    </div>
                </div>
            );

            // --- VIEW: REGISTER (If New) ---
            if(mode === 'register') return (
                <div className="min-h-screen bg-indigo-900 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-3xl w-full max-w-md anim-pop">
                        <h2 className="text-2xl font-bold mb-4">Hello! 👋</h2>
                        <p className="text-gray-500 mb-6">It looks like you're new here. Please complete your profile.</p>
                        <form onSubmit={(e)=>{e.preventDefault(); setMode('lobby');}} className="space-y-4">
                            <input required value={student.name} onChange={e=>setStudent({...student, name:e.target.value})} className="w-full bg-gray-100 p-3 rounded-lg font-bold" placeholder="Full Name" />
                            <input required value={student.roll} onChange={e=>setStudent({...student, roll:e.target.value})} className="w-full bg-gray-100 p-3 rounded-lg font-bold" placeholder="Roll Number" />
                            <button className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg">Save & Continue</button>
                        </form>
                    </div>
                </div>
            );

            // --- VIEW: LOBBY ---
            if(mode === 'lobby') return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md text-center anim-pop relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-blue-500"></div>
                        <h2 className="text-3xl font-black text-gray-900 mb-1">Welcome, {student.name.split(' ')[0]}!</h2>
                        <p className="text-gray-400 mb-8 font-medium">Ready to crush this exam?</p>

                        {/* Student Progress Mini-Dash */}
                        {history && (
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                                    <div className="text-2xl font-black text-indigo-600">{history.total_exams}</div>
                                    <div className="text-xs font-bold text-gray-500 uppercase">Exams Taken</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                                    <div className="text-2xl font-black text-green-600">{Math.round(history.avg_score || 0)}%</div>
                                    <div className="text-xs font-bold text-gray-500 uppercase">Avg Score</div>
                                </div>
                            </div>
                        )}

                        <div className="bg-gray-900 text-white p-6 rounded-2xl mb-6">
                            <div className="text-gray-400 text-xs font-bold uppercase mb-1">Current Exam</div>
                            <div className="text-xl font-bold">{exam.exam.title}</div>
                            <div className="text-sm mt-2 opacity-75">{exam.questions.length} Questions • {settings.timerMode === 'question' ? 'Fast Paced' : 'Standard Timer'}</div>
                        </div>

                        <button onClick={startGame} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-xl py-4 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition">START EXAM 🚀</button>
                    </div>
                </div>
            );

            // --- VIEW: GAME ---
            if(mode === 'game') return (
                <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4">
                     <div className="w-full max-w-4xl flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-2xl border border-slate-700">
                        <div><span className="text-gray-400 text-xs font-bold uppercase">Question</span><div className="text-2xl font-black">{qIdx+1}/{exam.questions.length}</div></div>
                        <div className={\`text-3xl font-mono font-bold \${(settings.timerMode==='question'?qTime:totalTime)<10?'text-red-500 animate-pulse':'text-green-400'}\`}>
                            {settings.timerMode === 'question' ? qTime : Math.floor(totalTime/60) + ':' + (totalTime%60).toString().padStart(2,'0')}
                        </div>
                    </div>
                    <div className="w-full max-w-3xl flex-1 flex flex-col justify-center text-center">
                        <div className="bg-white text-gray-900 rounded-3xl p-8 mb-6 shadow-2xl">
                             {exam.questions[qIdx].image_key && <img src={\`/img/\${exam.questions[qIdx].image_key}\`} className="max-h-60 mx-auto mb-6 rounded-xl object-contain" />}
                             <h2 className="text-2xl md:text-3xl font-bold">{exam.questions[qIdx].text}</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {JSON.parse(exam.questions[qIdx].choices).map((c, i) => (
                                <button key={c.id} onClick={() => handleAnswer(c.id)} className={\`bg-gray-800 hover:bg-gray-700 p-6 rounded-2xl border border-gray-700 flex items-center gap-4 text-left transition transform hover:scale-105 \${answers[exam.questions[qIdx].id]===c.id?'ring-2 ring-indigo-500 bg-indigo-900':''}\`}>
                                    <div className="bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">{String.fromCharCode(65+i)}</div>
                                    <span className="text-lg font-bold">{c.text}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-between mt-8">
                            {settings.allowBack && <button onClick={()=>setQIdx(Math.max(0, qIdx-1))} disabled={qIdx===0} className="px-6 py-3 rounded-xl bg-gray-700 font-bold disabled:opacity-50">Back</button>}
                            {settings.timerMode === 'total' && <button onClick={qIdx===exam.questions.length-1?finish:()=>setQIdx(qIdx+1)} className="px-8 py-3 rounded-xl bg-white text-gray-900 font-bold">{qIdx===exam.questions.length-1?'Submit':'Next'}</button>}
                        </div>
                    </div>
                </div>
            );

            // --- VIEW: SUMMARY & REVIEW ---
            if(mode === 'summary' || mode === 'review') {
                const perc = score / exam.questions.length;
                return (
                    <div className="min-h-screen bg-gray-900 overflow-y-auto p-4 flex flex-col items-center">
                        <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl text-center max-w-2xl w-full border border-gray-700 mb-8 mt-10">
                            <h2 className="text-3xl font-bold text-white mb-2">Exam Completed!</h2>
                            <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 my-6">{score} / {exam.questions.length}</div>
                            
                            {settings.showCorrect && mode !== 'review' && (
                                <button onClick={()=>setMode('review')} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-xl transition mb-4">Review Answers</button>
                            )}
                            <button onClick={()=>window.location.href='/'} className="block w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-500 transition">Return Home</button>
                        </div>

                        {mode === 'review' && (
                            <div className="w-full max-w-2xl space-y-4 pb-12 anim-enter">
                                <h3 className="text-gray-400 font-bold uppercase tracking-widest mb-4">Detailed Review</h3>
                                {exam.questions.map((q, i) => {
                                    const userAnsId = answers[q.id];
                                    const choices = JSON.parse(q.choices);
                                    const correctId = choices.find(c=>c.isCorrect).id;
                                    const isCorrect = userAnsId === correctId;
                                    
                                    return (
                                        <div key={q.id} className={\`bg-white p-6 rounded-2xl border-l-8 \${isCorrect ? 'border-green-500' : 'border-red-500'}\`}>
                                            <div className="font-bold text-lg mb-4 text-gray-800"><span className="text-gray-400 mr-2">{i+1}.</span>{q.text}</div>
                                            <div className="space-y-2">
                                                {choices.map(c => (
                                                    <div key={c.id} className={\`p-3 rounded-lg flex justify-between items-center \${c.id === correctId ? 'bg-green-100 text-green-800 font-bold' : (c.id === userAnsId ? 'bg-red-100 text-red-800' : 'bg-gray-50 text-gray-500')}\`}>
                                                        <span>{c.text}</span>
                                                        {c.id === correctId && <span className="text-xs uppercase">Correct</span>}
                                                        {c.id === userAnsId && c.id !== correctId && <span className="text-xs uppercase">Your Answer</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                );
            }
        }

        function App() {
            const [status, setStatus] = useState(null);
            const [user, setUser] = useState(null);
            const [toasts, setToasts] = useState([]);
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

            if(linkId) return <StudentApp linkId={linkId} />;
            if(!status) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading ExamMaster...</div>;
            
            return (
                <>
                    {!status.hasAdmin && <Setup onComplete={() => setStatus({hasAdmin:true})} addToast={addToast} />}
                    {status.hasAdmin && !user && <Login onLogin={setUser} addToast={addToast} />}
                    {user && user.role === 'super_admin' && <AdminView user={user} onLogout={()=>setUser(null)} addToast={addToast} />}
                    {user && user.role === 'teacher' && <TeacherView user={user} onLogout={()=>setUser(null)} addToast={addToast} />}
                    <ToastContainer toasts={toasts} />
                </>
            );
        }

        // --- AUTH COMPS (Reused from previous) ---
        function Setup({ onComplete, addToast }) { /* ... same as before ... */ 
             const handle = async (e) => { e.preventDefault(); const init = await fetch('/api/system/init', { method: 'POST' }); if(!init.ok) return addToast("Init Failed", 'error'); const res = await fetch('/api/auth/setup-admin', { method: 'POST', body: JSON.stringify({ name: e.target.name.value, username: e.target.username.value, password: e.target.password.value }) }); if(res.ok) onComplete(); else addToast("Failed", 'error'); };
             return (<div className="min-h-screen bg-slate-900 flex items-center justify-center"><form onSubmit={handle} className="bg-white p-8 rounded-2xl"><h2 className="font-bold text-xl mb-4">Install System</h2><input name="name" placeholder="Org Name" className="block w-full border p-2 mb-2" /><input name="username" placeholder="Admin User" className="block w-full border p-2 mb-2" /><input name="password" type="password" placeholder="Pass" className="block w-full border p-2 mb-4" /><button className="bg-blue-600 text-white px-4 py-2 rounded">Install</button></form></div>);
        }
        function Login({ onLogin, addToast }) { /* ... same as before ... */
             const handle = async (e) => { e.preventDefault(); const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: e.target.username.value, password: e.target.password.value }) }); const data = await res.json(); if(data.success) onLogin(data.user); else addToast("Login Failed", 'error'); };
             return (<div className="min-h-screen bg-gray-50 flex items-center justify-center"><form onSubmit={handle} className="bg-white p-8 rounded-2xl shadow-lg w-96"><h2 className="font-bold text-xl mb-6 text-center">Login</h2><input name="username" placeholder="Username" className="block w-full border p-3 rounded mb-4" /><input name="password" type="password" placeholder="Password" className="block w-full border p-3 rounded mb-6" /><button className="w-full bg-slate-900 text-white py-3 rounded font-bold">Sign In</button></form></div>);
        }
        function AdminView({ user, onLogout }) { return <div className="p-8">Admin View (Manage Teachers via API) <button onClick={onLogout}>Logout</button></div> }
        
        function ExamStats({ examId, onBack }) {
             const [data, setData] = useState(null);
             useEffect(() => { fetch(\`/api/analytics/exam?exam_id=\${examId}\`).then(r=>r.json()).then(setData); }, [examId]);
             if(!data) return <div>Loading...</div>;
             return (
                 <div className="anim-enter bg-white p-6 rounded-xl border">
                    <h3 className="font-bold text-xl mb-4">Results ({data.length})</h3>
                    <table className="w-full text-left">
                        <thead><tr className="border-b"><th className="p-2">Name</th><th className="p-2">Score</th><th className="p-2">Date</th></tr></thead>
                        <tbody>{data.map(r=><tr key={r.id} className="border-b"><td className="p-2">{r.name}</td><td className="p-2">{r.score}/{r.total}</td><td className="p-2 text-sm text-gray-500">{new Date(r.timestamp).toLocaleString()}</td></tr>)}</tbody>
                    </table>
                 </div>
             )
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;
}
