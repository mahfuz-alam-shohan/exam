/**
 * Cloudflare Worker - Exam System (SaaS Edition)
 * - Roles: 'super_admin' (Owner), 'teacher' (Creators), 'student' (Takers)
 * - Design: Professional Dashboard (Admin) + Gamified UI (Student)
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

// --- API LOGIC (Stable Batch Implementation) ---
async function handleApi(request, env, path, url) {
  const method = request.method;

  try {
    // 1. SYSTEM CHECK & INIT
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
          env.DB.prepare("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, school_id TEXT UNIQUE, name TEXT, roll TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT UNIQUE, title TEXT, teacher_id INTEGER, settings TEXT, is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, text TEXT, image_key TEXT, choices TEXT)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, student_db_id INTEGER, score INTEGER, total INTEGER, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(student_db_id) REFERENCES students(id))")
        ]);
        return Response.json({ success: true });
      } catch (err) {
        return Response.json({ error: "D1 Batch Error: " + err.message }, { status: 500 });
      }
    }

    // 2. AUTHENTICATION
    if (path === '/api/auth/setup-admin' && method === 'POST') {
      let count = 0;
      try {
        count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count');
      } catch(e) {
          return Response.json({ error: "Database not initialized. Please refresh." }, { status: 500 });
      }

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
    if (path === '/api/exam/create' && method === 'POST') {
      const { title, teacher_id, settings } = await request.json();
      const link_id = crypto.randomUUID();
      const res = await env.DB.prepare("INSERT INTO exams (link_id, title, teacher_id, settings) VALUES (?, ?, ?, ?)")
        .bind(link_id, title, teacher_id, JSON.stringify(settings)).run();
      return Response.json({ success: true, id: res.meta.last_row_id, link_id });
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

    // 4. STUDENT ENTRY
    if (path === '/api/exam/get' && method === 'GET') {
      const link_id = url.searchParams.get('link_id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE link_id = ?").bind(link_id).first();
      if(!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
      
      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
      return Response.json({ exam, questions: questions.results });
    }

    // 5. SUBMISSION
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
        await env.DB.prepare("UPDATE students SET name = ?, roll = ? WHERE id = ?")
          .bind(student.name, student.roll, studentRecord.id).run();
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

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
  return new Response("Not Found", { status: 404 });
}

// --- FRONTEND (The Big Upgrade) ---
function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ExamMaster SaaS</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- React & DOM -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <!-- Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=Outfit:wght@300;500;800&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Inter', sans-serif; }
      .font-display { font-family: 'Outfit', sans-serif; }
      .glass { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); }
      .glass-dark { background: rgba(17, 24, 39, 0.95); backdrop-filter: blur(10px); }
      .anim-enter { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
      @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .gradient-text { background-clip: text; -webkit-background-clip: text; color: transparent; background-image: linear-gradient(to right, #4f46e5, #9333ea); }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 antialiased">
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

        // --- ICONS ---
        const Icons = {
            Logo: () => <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
            User: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
            Logout: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
            Plus: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
            Chart: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
            Check: () => <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>,
            X: () => <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>,
        };

        // --- TOAST NOTIFICATIONS ---
        function ToastContainer({ toasts }) {
            return (
                <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                    {toasts.map(t => (
                        <div key={t.id} className={\`p-4 rounded shadow-lg text-white text-sm font-medium flex items-center gap-2 anim-enter \${t.type === 'error' ? 'bg-red-500' : 'bg-gray-900'}\`}>
                            {t.type === 'error' ? <Icons.X /> : <Icons.Check />}
                            {t.msg}
                        </div>
                    ))}
                </div>
            );
        }

        // --- SHARED LAYOUTS ---
        
        // 1. ADMIN / TEACHER LAYOUT
        function DashboardLayout({ user, onLogout, title, action, children }) {
            return (
                <div className="min-h-screen bg-gray-50 flex">
                    {/* Sidebar */}
                    <aside className="w-64 bg-slate-900 text-white flex-col hidden md:flex sticky top-0 h-screen">
                        <div className="p-6 flex items-center gap-3 border-b border-gray-800">
                            <div className="bg-indigo-500 p-1.5 rounded-lg"><Icons.Logo /></div>
                            <span className="font-display font-bold text-lg tracking-wide">ExamMaster</span>
                        </div>
                        <nav className="flex-1 p-4 space-y-2">
                            <div className="px-4 py-2 text-xs uppercase text-gray-500 font-bold tracking-wider">Menu</div>
                            <button className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-600 rounded-lg text-sm font-medium transition hover:bg-indigo-500">
                                <Icons.Chart /> Dashboard
                            </button>
                        </nav>
                        <div className="p-4 border-t border-gray-800">
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold">{user.name[0]}</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{user.name}</p>
                                    <p className="text-xs text-gray-500 truncate capitalize">{user.role.replace('_', ' ')}</p>
                                </div>
                                <button onClick={onLogout} className="text-gray-400 hover:text-white"><Icons.Logout /></button>
                            </div>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <header className="bg-white border-b border-gray-200 p-6 flex justify-between items-center sticky top-0 z-20">
                            <h1 className="text-2xl font-display font-bold text-gray-800">{title}</h1>
                            {action}
                        </header>
                        <div className="flex-1 overflow-auto p-6 md:p-8">
                            {children}
                        </div>
                    </main>
                </div>
            );
        }

        // --- APP COMPONENTS ---

        function AdminView({ user, onLogout, addToast }) {
            const [teachers, setTeachers] = useState([]);
            const [isAdding, setIsAdding] = useState(false);

            useEffect(() => { loadTeachers(); }, []);

            const loadTeachers = async () => {
                const res = await fetch('/api/admin/teachers');
                setTeachers(await res.json());
            };

            const handleAdd = async (e) => {
                e.preventDefault();
                const res = await fetch('/api/admin/teachers', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: e.target.name.value,
                        username: e.target.username.value,
                        password: e.target.password.value
                    })
                });
                if(res.ok) {
                    addToast("Teacher added successfully");
                    setIsAdding(false);
                    loadTeachers();
                } else {
                    addToast("Failed to add teacher", 'error');
                }
            };

            return (
                <DashboardLayout user={user} onLogout={onLogout} title="Organization" 
                    action={<button onClick={() => setIsAdding(!isAdding)} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition">+ Add Teacher</button>}>
                    
                    {isAdding && (
                        <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200 anim-enter">
                            <h3 className="font-bold text-lg mb-4">New Teacher Account</h3>
                            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <label className="block">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Full Name</span>
                                    <input name="name" className="mt-1 block w-full border-gray-300 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Username</span>
                                    <input name="username" className="mt-1 block w-full border-gray-300 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Password</span>
                                    <input name="password" className="mt-1 block w-full border-gray-300 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                                </label>
                                <button className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition">Create Account</button>
                            </form>
                        </div>
                    )}

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Teacher</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Username</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Joined</th>
                                    <th className="px-6 py-3 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {teachers.map(t => (
                                    <tr key={t.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">{t.name[0]}</div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900">{t.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t.username}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <a href="#" className="text-indigo-600 hover:text-indigo-900">Edit</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {teachers.length === 0 && <div className="p-12 text-center text-gray-500">No teachers found. Add one to get started.</div>}
                    </div>
                </DashboardLayout>
            );
        }

        function TeacherView({ user, onLogout, addToast }) {
            const [view, setView] = useState('list');
            const [exams, setExams] = useState([]);
            const [activeExamId, setActiveExamId] = useState(null);

            useEffect(() => { loadExams(); }, []);
            const loadExams = async () => {
                const res = await fetch(\`/api/teacher/exams?teacher_id=\${user.id}\`);
                setExams(await res.json());
            };

            return (
                <DashboardLayout user={user} onLogout={onLogout} title={view === 'create' ? 'Exam Creator' : 'My Exams'}
                    action={view === 'list' && <button onClick={() => setView('create')} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center gap-2"><Icons.Plus /> Create Exam</button>}>
                    
                    {view === 'list' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 anim-enter">
                            {exams.map(exam => (
                                <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2 py-1 rounded uppercase tracking-wide">Published</div>
                                        <span className="text-gray-400 text-xs">{new Date(exam.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">{exam.title}</h3>
                                    <p className="text-sm text-gray-500 mb-6 flex-1">Click to view performance or share the link with your students.</p>
                                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(\`\${window.location.origin}/?exam=\${exam.link_id}\`);
                                            addToast("Exam link copied to clipboard");
                                        }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium transition">Share Link</button>
                                        <button onClick={() => { setActiveExamId(exam.id); setView('stats'); }} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 rounded-lg text-sm font-medium transition">Analytics</button>
                                    </div>
                                </div>
                            ))}
                            {exams.length === 0 && (
                                <div className="col-span-3 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                                    <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-4"><Icons.Plus /></div>
                                    <h3 className="text-lg font-medium text-gray-900">No exams created</h3>
                                    <p className="text-gray-500 mt-1">Get started by creating your first exam.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {view === 'create' && <ExamCreator user={user} onCancel={() => setView('list')} onFinish={() => { setView('list'); loadExams(); addToast("Exam published successfully"); }} addToast={addToast} />}
                    {view === 'stats' && <ExamStats examId={activeExamId} onBack={() => setView('list')} />}
                </DashboardLayout>
            );
        }

        function ExamCreator({ user, onCancel, onFinish, addToast }) {
            const [title, setTitle] = useState('');
            const [timer, setTimer] = useState(0);
            const [questions, setQuestions] = useState([]);
            
            // Current Q State
            const [currQ, setCurrQ] = useState({ text: '', choices: [{id:1, text:'', isCorrect:false}, {id:2, text:'', isCorrect:false}], image: null });

            const saveQ = () => {
                if(!currQ.text) return;
                setQuestions([...questions, { ...currQ, id: Date.now() }]);
                setCurrQ({ text: '', choices: [{id:Date.now()+1, text:'', isCorrect:false}, {id:Date.now()+2, text:'', isCorrect:false}], image: null });
                addToast("Question added to list");
            };

            const publish = async () => {
                if(!title || questions.length === 0) return addToast("Title and 1 question required", 'error');
                
                const res = await fetch('/api/exam/create', { method: 'POST', body: JSON.stringify({ title, teacher_id: user.id, settings: { timer } }) });
                const data = await res.json();

                for(let q of questions) {
                    const fd = new FormData();
                    fd.append('exam_id', data.id);
                    fd.append('text', q.text);
                    fd.append('choices', JSON.stringify(q.choices));
                    if(q.image) fd.append('image', q.image);
                    await fetch('/api/question/add', { method: 'POST', body: fd });
                }
                onFinish();
            };

            return (
                <div className="max-w-4xl mx-auto anim-enter">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Exam Title</label>
                                <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full border-gray-300 rounded-lg px-4 py-3 border focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Final Semester Physics" autoFocus />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Timer (Sec/Question)</label>
                                <input type="number" value={timer} onChange={e=>setTimer(e.target.value)} className="w-full border-gray-300 rounded-lg px-4 py-3 border focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0 = Unlimited" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-8 mb-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Icons.Logo /></div>
                        <h3 className="font-bold text-lg text-indigo-900 mb-4">Question {questions.length + 1} Editor</h3>
                        
                        <textarea value={currQ.text} onChange={e=>setCurrQ({...currQ, text:e.target.value})} className="w-full border-indigo-200 rounded-lg p-4 border focus:ring-2 focus:ring-indigo-500 outline-none mb-4" rows="2" placeholder="What is the question?"></textarea>
                        
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-indigo-400 uppercase mb-2">Image Attachment (Optional)</label>
                            <input type="file" onChange={e=>setCurrQ({...currQ, image:e.target.files[0]})} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200"/>
                        </div>

                        <div className="space-y-3 mb-6">
                            {currQ.choices.map((c, idx) => (
                                <div key={c.id} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                                    <input type="radio" name="correct" checked={c.isCorrect} onChange={() => {
                                        const newChoices = currQ.choices.map(x => ({...x, isCorrect: x.id === c.id}));
                                        setCurrQ({...currQ, choices: newChoices});
                                    }} className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                    <input value={c.text} onChange={e => {
                                        const newChoices = currQ.choices.map(x => x.id === c.id ? {...x, text: e.target.value} : x);
                                        setCurrQ({...currQ, choices: newChoices});
                                    }} className="flex-1 outline-none text-sm text-gray-700" placeholder={\`Option \${idx+1}\`} />
                                    {currQ.choices.length > 2 && <button onClick={() => setCurrQ({...currQ, choices: currQ.choices.filter(x=>x.id!==c.id)})} className="text-red-400 hover:text-red-600"><Icons.X/></button>}
                                </div>
                            ))}
                            <button onClick={()=>setCurrQ({...currQ, choices: [...currQ.choices, {id:Date.now(), text:'', isCorrect:false}]})} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">+ Add Choice</button>
                        </div>
                        
                        <button onClick={saveQ} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition">Save Question to Exam</button>
                    </div>

                    <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-200">
                        <div className="text-sm text-gray-500">
                            <span className="font-bold text-gray-900">{questions.length}</span> questions ready to publish
                        </div>
                        <div className="flex gap-4">
                            <button onClick={onCancel} className="text-gray-500 hover:text-gray-900 font-medium">Cancel</button>
                            <button onClick={publish} className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition transform hover:-translate-y-0.5">🚀 Publish Exam</button>
                        </div>
                    </div>
                </div>
            );
        }

        function ExamStats({ examId, onBack }) {
            const [data, setData] = useState(null);
            useEffect(() => { fetch(\`/api/analytics/exam?exam_id=\${examId}\`).then(r=>r.json()).then(setData); }, [examId]);

            if(!data) return <div className="p-12 text-center text-gray-400">Loading analytics...</div>;

            return (
                <div className="anim-enter">
                    <button onClick={onBack} className="mb-6 text-sm font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1">← Back to Exams</button>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800">Performance Report</h3>
                            <span className="text-sm bg-white border border-gray-200 px-3 py-1 rounded-full text-gray-500">{data.length} Submissions</span>
                        </div>
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Student</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID / Roll</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Score</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Submitted</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {data.map(r => (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{r.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.school_id} <span className="text-gray-300">|</span> {r.roll}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={\`px-3 py-1 rounded-full text-xs font-bold \${(r.score/r.total) > 0.7 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}\`}>
                                                {Math.round((r.score/r.total)*100)}% ({r.score}/{r.total})
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(r.timestamp).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {data.length === 0 && <div className="p-12 text-center text-gray-400">No students have taken this exam yet.</div>}
                    </div>
                </div>
            );
        }

        // --- STUDENT GAMIFIED UI ---
        function StudentApp({ linkId }) {
            const [mode, setMode] = useState('lobby'); // lobby, game, summary
            const [student, setStudent] = useState({ name: '', school_id: '', roll: '' });
            const [exam, setExam] = useState(null);
            
            // Game State
            const [qIdx, setQIdx] = useState(0);
            const [score, setScore] = useState(0);
            const [timeLeft, setTimeLeft] = useState(0);
            const [answers, setAnswers] = useState([]);

            useEffect(() => {
                fetch(\`/api/exam/get?link_id=\${linkId}\`).then(r => r.ok ? r.json() : null).then(data => {
                    if(!data) return alert("Invalid Link");
                    setExam(data);
                });
            }, [linkId]);

            // Timer Tick
            useEffect(() => {
                if(mode === 'game' && timeLeft > 0) {
                    const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
                    return () => clearTimeout(t);
                } else if(mode === 'game' && timeLeft === 0 && exam) {
                     // Time up auto-move
                     handleAnswer(null); 
                }
            }, [timeLeft, mode]);

            const startGame = (e) => {
                e.preventDefault();
                setMode('game');
                const settings = JSON.parse(exam.exam.settings || '{}');
                setTimeLeft(settings.timer || 0); // 0 means no timer logic needed in UI but we handle checks
            };

            const handleAnswer = (choiceId) => {
                const q = exam.questions[qIdx];
                const choices = JSON.parse(q.choices);
                const isCorrect = choices.find(c => c.id === choiceId)?.isCorrect;
                
                const newScore = isCorrect ? score + 1 : score;
                setScore(newScore);
                setAnswers([...answers, { qId: q.id, selected: choiceId }]);

                if(qIdx < exam.questions.length - 1) {
                    setQIdx(qIdx + 1);
                    const settings = JSON.parse(exam.exam.settings || '{}');
                    setTimeLeft(settings.timer || 0);
                } else {
                    finish(newScore, [...answers, { qId: q.id, selected: choiceId }]);
                }
            };

            const finish = async (finalScore, finalAnswers) => {
                setMode('summary');
                // Calculate detailed payload
                const payload = exam.questions.map(q => {
                    const ans = finalAnswers.find(a => a.qId === q.id);
                    return { ...ans, isCorrect: JSON.parse(q.choices).find(c => c.id === ans.selected)?.isCorrect };
                });

                await fetch('/api/submit', {
                    method: 'POST',
                    body: JSON.stringify({
                        link_id: linkId,
                        student,
                        score: finalScore,
                        total: exam.questions.length,
                        answers: payload
                    })
                });
            };

            if(!exam) return <div className="min-h-screen bg-purple-600 flex items-center justify-center text-white font-bold animate-pulse">Loading Game Engine...</div>;

            // 1. LOBBY (Registration)
            if(mode === 'lobby') return (
                <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md transform transition hover:scale-105 duration-300">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-black text-gray-800 mb-2">{exam.exam.title}</h1>
                            <p className="text-gray-500 font-medium">Enter your details to join the game.</p>
                        </div>
                        <form onSubmit={startGame} className="space-y-4">
                            <input required value={student.name} onChange={e=>setStudent({...student, name:e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:border-purple-500 focus:bg-white rounded-xl px-4 py-3 font-bold text-gray-800 outline-none transition" placeholder="Your Name" />
                            <input required value={student.school_id} onChange={e=>setStudent({...student, school_id:e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:border-purple-500 focus:bg-white rounded-xl px-4 py-3 font-bold text-gray-800 outline-none transition" placeholder="Student ID" />
                            <input required value={student.roll} onChange={e=>setStudent({...student, roll:e.target.value})} className="w-full bg-gray-100 border-2 border-transparent focus:border-purple-500 focus:bg-white rounded-xl px-4 py-3 font-bold text-gray-800 outline-none transition" placeholder="Roll No" />
                            <button className="w-full bg-gray-900 text-white font-black text-xl py-4 rounded-xl shadow-lg hover:shadow-xl hover:bg-black transition transform active:scale-95">START QUIZ 🚀</button>
                        </form>
                    </div>
                </div>
            );

            // 2. GAME (Question)
            if(mode === 'game') {
                const q = exam.questions[qIdx];
                const choices = JSON.parse(q.choices);
                const hasTimer = JSON.parse(exam.exam.settings).timer > 0;
                
                return (
                    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                        {/* Background Elements */}
                        <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                        
                        <div className="w-full max-w-4xl z-10">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-8 text-white">
                                <span className="bg-white/10 px-4 py-2 rounded-full font-bold backdrop-blur-md border border-white/20">
                                    Q {qIdx + 1} <span className="text-gray-400">/ {exam.questions.length}</span>
                                </span>
                                {hasTimer && (
                                    <div className="flex flex-col items-center">
                                        <span className={\`text-4xl font-black \${timeLeft < 5 ? 'text-red-500 animate-ping' : 'text-white'}\`}>{timeLeft}</span>
                                    </div>
                                )}
                            </div>

                            {/* Question Card */}
                            <div className="bg-white rounded-3xl p-8 mb-8 shadow-2xl text-center anim-enter">
                                {q.image_key && <img src={\`/img/\${q.image_key}\`} className="max-h-60 mx-auto mb-6 rounded-xl object-contain bg-gray-100" />}
                                <h2 className="text-2xl md:text-4xl font-black text-gray-800 leading-tight">{q.text}</h2>
                            </div>

                            {/* Answer Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {choices.map((c, i) => {
                                    // Kahoot Colors
                                    const colors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500'];
                                    const color = colors[i % colors.length];
                                    
                                    return (
                                        <button key={c.id} onClick={() => handleAnswer(c.id)} className={\`\${color} hover:brightness-110 text-white p-8 rounded-2xl shadow-xl transform transition hover:scale-105 active:scale-95 flex items-center gap-4 text-left group\`}>
                                            <div className="bg-black/20 w-10 h-10 rounded-full flex items-center justify-center font-black group-hover:bg-black/30 transition">{['▲', '◆', '●', '■'][i % 4]}</div>
                                            <span className="text-xl font-bold">{c.text}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            }

            // 3. SUMMARY
            if(mode === 'summary') {
                const percentage = Math.round((score / exam.questions.length) * 100);
                let message = "Good Effort!";
                if(percentage > 80) message = "Outstanding! 🏆";
                else if(percentage > 50) message = "Well Done!";

                return (
                    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
                        <div className="text-center anim-enter max-w-2xl w-full">
                            <h1 className="text-5xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">{message}</h1>
                            <p className="text-gray-400 text-xl mb-12">You finished the quiz.</p>
                            
                            <div className="bg-gray-800 rounded-3xl p-12 mb-8 border border-gray-700 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-blue-500"></div>
                                <div className="text-7xl font-black mb-4">{score}</div>
                                <div className="text-gray-400 uppercase tracking-widest text-sm font-bold">Total Score</div>
                            </div>
                            
                            <button onClick={() => window.location.reload()} className="bg-white text-gray-900 px-8 py-4 rounded-full font-bold text-lg hover:bg-gray-200 transition transform hover:-translate-y-1">Play Again</button>
                        </div>
                    </div>
                );
            }
        }

        // --- AUTH & SETUP ---
        function Setup({ onComplete, addToast }) {
            const handle = async (e) => {
                e.preventDefault();
                const init = await fetch('/api/system/init', { method: 'POST' });
                if(!init.ok) return addToast("Init Failed", 'error');

                const res = await fetch('/api/auth/setup-admin', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: e.target.name.value,
                        username: e.target.username.value,
                        password: e.target.password.value
                    })
                });
                if(res.ok) onComplete();
                else addToast("Failed to create admin", 'error');
            };

            return (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Initialize System</h2>
                        <p className="text-gray-500 mb-6">Create the super admin account.</p>
                        <form onSubmit={handle} className="space-y-4">
                            <input name="name" placeholder="Organization Name" className="w-full border p-3 rounded-lg" required />
                            <input name="username" placeholder="Admin Username" className="w-full border p-3 rounded-lg" required />
                            <input name="password" type="password" placeholder="Password" className="w-full border p-3 rounded-lg" required />
                            <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold">Install</button>
                        </form>
                    </div>
                </div>
            );
        }

        function Login({ onLogin, addToast }) {
            const handle = async (e) => {
                e.preventDefault();
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: e.target.username.value,
                        password: e.target.password.value
                    })
                });
                const data = await res.json();
                if(data.success) onLogin(data.user);
                else addToast(data.error || "Login Failed", 'error');
            };

            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">
                        <div className="p-8 w-full">
                            <div className="mb-8 text-center">
                                <div className="inline-block p-3 rounded-full bg-indigo-50 text-indigo-600 mb-4"><Icons.Logo /></div>
                                <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
                                <p className="text-sm text-gray-500">Sign in to your dashboard</p>
                            </div>
                            <form onSubmit={handle} className="space-y-4">
                                <input name="username" placeholder="Username" className="w-full border-gray-300 border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" required />
                                <input name="password" type="password" placeholder="Password" className="w-full border-gray-300 border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" required />
                                <button className="w-full bg-gray-900 text-white py-3 rounded-lg font-bold hover:bg-black transition">Sign In</button>
                            </form>
                        </div>
                    </div>
                </div>
            );
        }

        // --- ROOT ---
        function App() {
            const [status, setStatus] = useState(null);
            const [user, setUser] = useState(null);
            const [toasts, setToasts] = useState([]);
            
            // Student Link Check
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

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;
}
