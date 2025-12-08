/**
 * Cloudflare Worker - Exam System (Advanced)
 * - Roles: 'super_admin' (Owner), 'teacher' (Creators), 'student' (Takers)
 * - Persistent Student History based on School ID.
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
    // 1. SYSTEM CHECK & INIT
    // Checks if the system is installed and if a super admin exists
    if (path === '/api/system/status' && method === 'GET') {
      try {
        const count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count');
        return Response.json({ installed: true, hasAdmin: count > 0 });
      } catch (e) {
        return Response.json({ installed: false, hasAdmin: false });
      }
    }

    if (path === '/api/system/init' && method === 'POST') {
      await env.DB.exec(`
        -- Users Table (Admins and Teachers)
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          password TEXT,
          name TEXT,
          role TEXT DEFAULT 'teacher', -- 'super_admin' or 'teacher'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Students Table (Persistent Data)
        CREATE TABLE IF NOT EXISTS students (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          school_id TEXT UNIQUE, -- The permanent ID (e.g., Roll No / Registration No)
          name TEXT,
          roll TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Exams Table
        CREATE TABLE IF NOT EXISTS exams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          link_id TEXT UNIQUE, -- UUID for the direct link
          title TEXT,
          teacher_id INTEGER,
          settings TEXT, -- JSON: { timer, shuffle }
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Questions Table
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          exam_id INTEGER,
          text TEXT,
          image_key TEXT,
          choices TEXT -- JSON
        );

        -- Attempts/Submissions Table
        CREATE TABLE IF NOT EXISTS attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          exam_id INTEGER,
          student_db_id INTEGER, -- Links to students.id
          score INTEGER,
          total INTEGER,
          details TEXT, -- JSON answer details
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_db_id) REFERENCES students(id)
        );
      `);
      return Response.json({ success: true });
    }

    // 2. AUTHENTICATION & USER MANAGEMENT
    if (path === '/api/auth/setup-admin' && method === 'POST') {
      // Only allows creation if 0 users exist
      const count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count');
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
      // Add a teacher (In real app, check auth token here)
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

    // 3. EXAM MANAGEMENT (Teacher Side)
    if (path === '/api/exam/create' && method === 'POST') {
      const { title, teacher_id, settings } = await request.json();
      const link_id = crypto.randomUUID();
      const res = await env.DB.prepare("INSERT INTO exams (link_id, title, teacher_id, settings) VALUES (?, ?, ?, ?)")
        .bind(link_id, title, teacher_id, JSON.stringify(settings)).run();
      return Response.json({ success: true, id: res.meta.last_row_id, link_id });
    }
    
    // Add Question
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

    // 4. STUDENT ENTRY & EXAM DATA
    if (path === '/api/exam/get' && method === 'GET') {
      const link_id = url.searchParams.get('link_id');
      const exam = await env.DB.prepare("SELECT * FROM exams WHERE link_id = ?").bind(link_id).first();
      if(!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
      
      const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
      return Response.json({ exam, questions: questions.results });
    }

    // 5. SUBMISSION & STUDENT PERSISTENCE
    if (path === '/api/submit' && method === 'POST') {
      const { link_id, student, answers, score, total } = await request.json();
      
      // Get Exam ID
      const exam = await env.DB.prepare("SELECT id FROM exams WHERE link_id = ?").bind(link_id).first();
      if(!exam) return Response.json({error: "Invalid Exam"});

      // HANDLE STUDENT PERSISTENCE
      // 1. Try to find student by school_id
      let studentRecord = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(student.school_id).first();
      
      if (!studentRecord) {
        // Create new student
        const res = await env.DB.prepare("INSERT INTO students (school_id, name, roll) VALUES (?, ?, ?)")
          .bind(student.school_id, student.name, student.roll).run();
        studentRecord = { id: res.meta.last_row_id };
      } else {
        // Update existing student details (in case name changed)
        await env.DB.prepare("UPDATE students SET name = ?, roll = ? WHERE id = ?")
          .bind(student.name, student.roll, studentRecord.id).run();
      }

      // Save Attempt
      await env.DB.prepare("INSERT INTO attempts (exam_id, student_db_id, score, total, details) VALUES (?, ?, ?, ?, ?)")
        .bind(exam.id, studentRecord.id, score, total, JSON.stringify(answers)).run();

      return Response.json({ success: true });
    }

    // 6. ANALYTICS
    if (path === '/api/analytics/exam' && method === 'GET') {
      const examId = url.searchParams.get('exam_id');
      // Join attempts with students table to get names/ids
      const results = await env.DB.prepare(`
        SELECT a.*, s.name, s.school_id, s.roll 
        FROM attempts a 
        JOIN students s ON a.student_db_id = s.id 
        WHERE a.exam_id = ? 
        ORDER BY a.timestamp DESC
      `).bind(examId).all();
      
      return Response.json(results.results);
    }
    
    // Global Student Search (For Admin/Teacher to see history)
    if (path === '/api/student/history' && method === 'GET') {
        const schoolId = url.searchParams.get('school_id');
        const student = await env.DB.prepare("SELECT * FROM students WHERE school_id = ?").bind(schoolId).first();
        if(!student) return Response.json({ found: false });
        
        const attempts = await env.DB.prepare(`
            SELECT a.*, e.title as exam_title, e.created_at as exam_date 
            FROM attempts a 
            JOIN exams e ON a.exam_id = e.id 
            WHERE a.student_db_id = ?
        `).bind(student.id).all();
        
        return Response.json({ found: true, student, attempts: attempts.results });
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
    <title>Exam Master</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>body { background: #f8fafc; font-family: sans-serif; }</style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect } = React;

        // --- COMPONENTS ---

        // 1. SYSTEM SETUP (First Run)
        function SetupAdmin({ onComplete }) {
            const handleSubmit = async (e) => {
                e.preventDefault();
                const data = {
                    name: e.target.name.value,
                    username: e.target.username.value,
                    password: e.target.password.value
                };
                
                // Initialize DB first
                await fetch('/api/system/init', { method: 'POST' });
                
                // Create Admin
                const res = await fetch('/api/auth/setup-admin', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                
                if(res.ok) {
                    alert("Super Admin Created! Please Login.");
                    onComplete();
                } else {
                    alert("Error creating admin.");
                }
            };

            return (
                <div className="min-h-screen flex items-center justify-center bg-blue-900">
                    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-xl w-96">
                        <h1 className="text-2xl font-bold mb-2 text-blue-900">Welcome to ExamMaster</h1>
                        <p className="text-gray-500 mb-6 text-sm">System Setup: Create the Owner Account.</p>
                        
                        <label className="block text-sm font-bold mb-1">Full Name</label>
                        <input name="name" className="w-full border p-2 rounded mb-3" required />
                        
                        <label className="block text-sm font-bold mb-1">Username</label>
                        <input name="username" className="w-full border p-2 rounded mb-3" required />
                        
                        <label className="block text-sm font-bold mb-1">Password</label>
                        <input name="password" type="password" className="w-full border p-2 rounded mb-6" required />
                        
                        <button className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700">Initialize System</button>
                    </form>
                </div>
            );
        }

        // 2. LOGIN (Universal)
        function Login({ onLogin }) {
            const [error, setError] = useState('');
            
            const handleSubmit = async (e) => {
                e.preventDefault();
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: e.target.username.value,
                        password: e.target.password.value
                    })
                });
                const data = await res.json();
                if(data.success) {
                    onLogin(data.user);
                } else {
                    setError(data.error);
                }
            };

            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-100">
                    <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow w-96">
                        <h2 className="text-2xl font-bold mb-6 text-center">Teacher & Admin Login</h2>
                        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm">{error}</div>}
                        <input name="username" className="w-full border p-2 mb-4 rounded" placeholder="Username" required />
                        <input name="password" type="password" className="w-full border p-2 mb-6 rounded" placeholder="Password" required />
                        <button className="w-full bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700">Login</button>
                    </form>
                </div>
            );
        }

        // 3. ADMIN DASHBOARD (Manage Teachers)
        function AdminDashboard({ user, onLogout }) {
            const [teachers, setTeachers] = useState([]);
            const [view, setView] = useState('list'); // list, add

            useEffect(() => {
                loadTeachers();
            }, []);

            const loadTeachers = async () => {
                const res = await fetch('/api/admin/teachers');
                const data = await res.json();
                setTeachers(data);
            };

            const addTeacher = async (e) => {
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
                    setView('list');
                    loadTeachers();
                } else {
                    alert("Failed to add teacher. Username might be taken.");
                }
            };

            return (
                <div className="min-h-screen flex flex-col">
                    <header className="bg-gray-900 text-white p-4 flex justify-between">
                        <h1 className="font-bold">Super Admin Panel</h1>
                        <button onClick={onLogout} className="text-red-400">Logout</button>
                    </header>
                    <main className="p-8 max-w-4xl mx-auto w-full">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">Manage Teachers</h2>
                            <button onClick={() => setView('add')} className="bg-green-600 text-white px-4 py-2 rounded">+ Add Teacher</button>
                        </div>

                        {view === 'add' && (
                            <div className="bg-white p-6 rounded shadow mb-6 border">
                                <h3 className="font-bold mb-4">Add New Teacher</h3>
                                <form onSubmit={addTeacher} className="flex gap-2">
                                    <input name="name" placeholder="Full Name" className="border p-2 rounded flex-1" required />
                                    <input name="username" placeholder="Username" className="border p-2 rounded flex-1" required />
                                    <input name="password" placeholder="Password" className="border p-2 rounded flex-1" required />
                                    <button className="bg-blue-600 text-white px-4 rounded">Save</button>
                                    <button type="button" onClick={() => setView('list')} className="text-gray-500 px-4">Cancel</button>
                                </form>
                            </div>
                        )}

                        <div className="bg-white rounded shadow overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-100 border-b">
                                    <tr>
                                        <th className="p-3">Name</th>
                                        <th className="p-3">Username</th>
                                        <th className="p-3">Created At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {teachers.map(t => (
                                        <tr key={t.id} className="border-b">
                                            <td className="p-3">{t.name}</td>
                                            <td className="p-3">{t.username}</td>
                                            <td className="p-3 text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </main>
                </div>
            );
        }

        // 4. TEACHER DASHBOARD
        function TeacherDashboard({ user, onLogout }) {
            const [view, setView] = useState('list'); // list, create, results
            const [exams, setExams] = useState([]);
            const [selectedExamId, setSelectedExamId] = useState(null);

            useEffect(() => {
                loadExams();
            }, []);

            const loadExams = async () => {
                const res = await fetch(\`/api/teacher/exams?teacher_id=\${user.id}\`);
                const data = await res.json();
                setExams(data);
            };

            return (
                <div className="min-h-screen bg-gray-50 flex flex-col">
                    <header className="bg-indigo-700 text-white p-4 flex justify-between items-center shadow-lg">
                        <div className="flex items-center gap-4">
                            <h1 className="font-bold text-xl">ExamMaster</h1>
                            <span className="text-indigo-200 text-sm">| {user.name}</span>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setView('list')} className="hover:text-white text-indigo-100">My Exams</button>
                            <button onClick={onLogout} className="text-red-300 hover:text-red-100">Logout</button>
                        </div>
                    </header>

                    <main className="p-6 max-w-6xl mx-auto w-full flex-1">
                        {view === 'list' && (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-2xl font-bold text-gray-800">My Exams</h2>
                                    <button onClick={() => setView('create')} className="bg-indigo-600 text-white px-6 py-2 rounded shadow hover:bg-indigo-700 transition">
                                        + Create New Exam
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {exams.map(exam => (
                                        <div key={exam.id} className="bg-white p-6 rounded-lg shadow border-t-4 border-indigo-500 hover:shadow-lg transition">
                                            <h3 className="font-bold text-lg mb-2">{exam.title}</h3>
                                            <p className="text-xs text-gray-500 mb-4">Created: {new Date(exam.created_at).toLocaleDateString()}</p>
                                            
                                            <div className="bg-gray-100 p-2 rounded mb-4 text-xs break-all font-mono">
                                                {window.location.origin}/?exam={exam.link_id}
                                            </div>

                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(\`\${window.location.origin}/?exam=\${exam.link_id}\`);
                                                        alert("Link Copied!");
                                                    }}
                                                    className="flex-1 bg-gray-200 py-2 rounded text-sm hover:bg-gray-300"
                                                >
                                                    Copy Link
                                                </button>
                                                <button 
                                                    onClick={() => { setSelectedExamId(exam.id); setView('results'); }}
                                                    className="flex-1 bg-indigo-100 text-indigo-700 py-2 rounded text-sm hover:bg-indigo-200"
                                                >
                                                    Analytics
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {exams.length === 0 && <div className="col-span-3 text-center text-gray-500 py-10">You haven't created any exams yet.</div>}
                                </div>
                            </div>
                        )}

                        {view === 'create' && (
                            <ExamCreator user={user} onFinish={() => { setView('list'); loadExams(); }} onCancel={() => setView('list')} />
                        )}

                        {view === 'results' && (
                            <ExamResults examId={selectedExamId} onBack={() => setView('list')} />
                        )}
                    </main>
                </div>
            );
        }

        function ExamCreator({ user, onFinish, onCancel }) {
            const [title, setTitle] = useState('');
            const [timer, setTimer] = useState(0); // 0 = no timer
            const [questions, setQuestions] = useState([]);
            
            // Current Question State
            const [qText, setQText] = useState('');
            const [qImage, setQImage] = useState(null);
            const [choices, setChoices] = useState([{id: 1, text:'', isCorrect: false}, {id:2, text:'', isCorrect: false}]);

            const addQuestion = () => {
                setQuestions([...questions, { text: qText, image: qImage, choices, id: Date.now() }]);
                setQText(''); setQImage(null);
                setChoices([{id: Date.now()+1, text:'', isCorrect: false}, {id:Date.now()+2, text:'', isCorrect: false}]);
            };

            const publish = async () => {
                if(!title || questions.length === 0) return alert("Add title and at least 1 question");
                
                // 1. Create Exam
                const res = await fetch('/api/exam/create', {
                    method: 'POST',
                    body: JSON.stringify({ title, teacher_id: user.id, settings: { timer } })
                });
                const data = await res.json();

                // 2. Upload Questions
                for(let q of questions) {
                    const fd = new FormData();
                    fd.append('exam_id', data.id);
                    fd.append('text', q.text);
                    fd.append('choices', JSON.stringify(q.choices));
                    if(q.image) fd.append('image', q.image);
                    await fetch('/api/question/add', { method: 'POST', body: fd });
                }

                alert("Exam Published! Link generated.");
                onFinish();
            };

            return (
                <div className="bg-white rounded shadow p-6">
                    <div className="flex justify-between mb-4 border-b pb-2">
                        <h2 className="text-xl font-bold">Create New Exam</h2>
                        <button onClick={onCancel} className="text-gray-500">Cancel</button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-bold">Exam Title</label>
                            <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full border p-2 rounded" placeholder="e.g., Math Finals" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold">Timer (Seconds per Q)</label>
                            <input type="number" value={timer} onChange={e=>setTimer(e.target.value)} className="w-full border p-2 rounded" placeholder="0 for no timer" />
                            <span className="text-xs text-gray-500">Set 0 for no timer</span>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded border mb-6">
                        <h3 className="font-bold mb-2">Compose Question {questions.length + 1}</h3>
                        <textarea value={qText} onChange={e=>setQText(e.target.value)} className="w-full border p-2 rounded mb-2" placeholder="Type question here..."></textarea>
                        <input type="file" onChange={e=>setQImage(e.target.files[0])} className="mb-4 text-sm" />
                        
                        <div className="space-y-2 mb-4">
                            {choices.map((c, idx) => (
                                <div key={c.id} className="flex gap-2 items-center">
                                    <input type="radio" name="correct" checked={c.isCorrect} onChange={() => {
                                        setChoices(choices.map(x => ({...x, isCorrect: x.id === c.id})))
                                    }} />
                                    <input value={c.text} onChange={e => {
                                        setChoices(choices.map(x => x.id === c.id ? {...x, text: e.target.value} : x))
                                    }} className="flex-1 border p-2 rounded" placeholder={\`Option \${idx+1}\`} />
                                    {choices.length > 2 && <button onClick={() => setChoices(choices.filter(x => x.id !== c.id))} className="text-red-500">×</button>}
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setChoices([...choices, {id: Date.now(), text:'', isCorrect:false}])} className="text-sm text-blue-600 mb-4">+ Add Option</button>
                        
                        <button onClick={addQuestion} disabled={!qText} className="w-full bg-indigo-100 text-indigo-700 py-2 rounded font-bold hover:bg-indigo-200">Save Question</button>
                    </div>

                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">{questions.length} questions ready</span>
                        <button onClick={publish} className="bg-green-600 text-white px-8 py-3 rounded font-bold hover:bg-green-700 shadow">🚀 Launch Exam</button>
                    </div>
                </div>
            );
        }

        function ExamResults({ examId, onBack }) {
            const [results, setResults] = useState([]);
            
            useEffect(() => {
                fetch(\`/api/analytics/exam?exam_id=\${examId}\`).then(r=>r.json()).then(setResults);
            }, [examId]);

            return (
                <div className="bg-white p-6 rounded shadow">
                    <button onClick={onBack} className="mb-4 text-indigo-600 hover:underline">← Back</button>
                    <h2 className="text-2xl font-bold mb-4">Exam Results</h2>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="p-3 border-b">Student Name</th>
                                    <th className="p-3 border-b">School ID</th>
                                    <th className="p-3 border-b">Roll</th>
                                    <th className="p-3 border-b">Score</th>
                                    <th className="p-3 border-b">Submitted At</th>
                                    <th className="p-3 border-b">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map(r => (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="p-3 border-b font-medium">{r.name}</td>
                                        <td className="p-3 border-b">{r.school_id}</td>
                                        <td className="p-3 border-b">{r.roll}</td>
                                        <td className="p-3 border-b font-bold text-green-600">{r.score} / {r.total}</td>
                                        <td className="p-3 border-b text-sm text-gray-500">{new Date(r.timestamp).toLocaleString()}</td>
                                        <td className="p-3 border-b">
                                            {/* In a real app, clicking this would show a modal with detailed Q/A breakdown */}
                                            <span className="text-xs bg-gray-200 px-2 py-1 rounded">View Answers</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {results.length === 0 && <p className="text-center p-8 text-gray-500">No submissions yet.</p>}
                    </div>
                </div>
            );
        }

        // 5. STUDENT APPLICATION (Standalone View)
        function StudentExamView({ linkId }) {
            const [phase, setPhase] = useState('register'); // register, test, result
            const [student, setStudent] = useState({ name: '', school_id: '', roll: '' });
            const [examData, setExamData] = useState(null);
            
            // Exam State
            const [currentIdx, setCurrentIdx] = useState(0);
            const [answers, setAnswers] = useState({});
            const [score, setScore] = useState(0);
            const [timer, setTimer] = useState(0); // per question

            useEffect(() => {
                // Fetch Exam Metadata immediately to ensure valid link
                fetch(\`/api/exam/get?link_id=\${linkId}\`).then(r => {
                   if(r.ok) return r.json();
                   throw new Error("Invalid Link");
                }).then(data => {
                    setExamData(data);
                }).catch(err => {
                    alert("Exam link is invalid or expired.");
                    window.location.href = '/';
                });
            }, [linkId]);

            // Timer Logic
            useEffect(() => {
                if(phase === 'test' && examData?.exam.settings) {
                    const settings = JSON.parse(examData.exam.settings);
                    if(settings.timer > 0) {
                        setTimer(settings.timer);
                        const interval = setInterval(() => {
                            setTimer(t => {
                                if(t <= 1) {
                                    handleNext(); // Auto next
                                    return settings.timer;
                                }
                                return t - 1;
                            });
                        }, 1000);
                        return () => clearInterval(interval);
                    }
                }
            }, [phase, currentIdx]);

            const handleRegister = (e) => {
                e.preventDefault();
                setPhase('test');
            };

            const handleNext = () => {
                // If last question, submit
                if(currentIdx >= examData.questions.length - 1) {
                    finishExam();
                } else {
                    setCurrentIdx(prev => prev + 1);
                    // Reset timer if needed handled by effect
                }
            };

            const finishExam = async () => {
                // Calculate Score
                let finalScore = 0;
                const detailedAnswers = examData.questions.map(q => {
                    const selected = answers[q.id];
                    const choices = JSON.parse(q.choices);
                    const correct = choices.find(c => c.isCorrect)?.id;
                    const isCorrect = selected == correct;
                    if(isCorrect) finalScore++;
                    return { qId: q.id, selected, correct, isCorrect };
                });
                
                setScore(finalScore);
                setPhase('result');

                // Submit to Backend
                await fetch('/api/submit', {
                    method: 'POST',
                    body: JSON.stringify({
                        link_id: linkId,
                        student: student,
                        answers: detailedAnswers,
                        score: finalScore,
                        total: examData.questions.length
                    })
                });
            };

            if(!examData) return <div className="p-8 text-center">Loading Exam...</div>;

            if(phase === 'register') return (
                <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4">
                    <form onSubmit={handleRegister} className="bg-white p-8 rounded shadow-xl w-full max-w-md">
                        <h1 className="text-2xl font-bold mb-2 text-indigo-700">{examData.exam.title}</h1>
                        <p className="text-gray-500 mb-6">Enter your details to start the exam.</p>
                        
                        <label className="block text-sm font-bold mb-1">Full Name</label>
                        <input className="w-full border p-3 rounded mb-3 bg-gray-50" required 
                            value={student.name} onChange={e=>setStudent({...student, name: e.target.value})} />
                        
                        <label className="block text-sm font-bold mb-1">Student ID (School ID)</label>
                        <input className="w-full border p-3 rounded mb-3 bg-gray-50" required placeholder="Permanent ID"
                            value={student.school_id} onChange={e=>setStudent({...student, school_id: e.target.value})} />
                        
                        <label className="block text-sm font-bold mb-1">Roll / Class No</label>
                        <input className="w-full border p-3 rounded mb-6 bg-gray-50" required 
                            value={student.roll} onChange={e=>setStudent({...student, roll: e.target.value})} />
                        
                        <button className="w-full bg-indigo-600 text-white font-bold py-3 rounded hover:bg-indigo-700">Start Exam</button>
                    </form>
                </div>
            );

            if(phase === 'test') {
                const q = examData.questions[currentIdx];
                const choices = JSON.parse(q.choices);
                const hasTimer = JSON.parse(examData.exam.settings).timer > 0;

                return (
                    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
                        <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg overflow-hidden">
                            <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
                                <span>Question {currentIdx + 1} of {examData.questions.length}</span>
                                {hasTimer && <span className="font-mono bg-red-500 px-2 py-1 rounded text-sm font-bold">{timer}s</span>}
                            </div>
                            
                            <div className="p-6">
                                {q.image_key && <img src={\`/img/\${q.image_key}\`} className="w-full h-48 object-contain mb-6 bg-black rounded" />}
                                <h2 className="text-xl font-bold mb-6">{q.text}</h2>
                                
                                <div className="grid grid-cols-1 gap-3">
                                    {choices.map(c => (
                                        <button key={c.id} 
                                            onClick={() => setAnswers({...answers, [q.id]: c.id})}
                                            className={\`p-4 rounded border text-left hover:bg-indigo-50 transition \${answers[q.id] === c.id ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200' : 'border-gray-200'}\`}
                                        >
                                            {c.text}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 flex justify-end">
                                <button onClick={handleNext} className="bg-indigo-600 text-white px-6 py-2 rounded font-bold">
                                    {currentIdx === examData.questions.length - 1 ? 'Submit Exam' : 'Next Question'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            }

            if(phase === 'result') return (
                <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded shadow text-center w-full max-w-md">
                        <div className="text-6xl mb-4">🎉</div>
                        <h2 className="text-2xl font-bold mb-2">Exam Submitted!</h2>
                        <p className="text-gray-600 mb-6">You scored {score} out of {examData.questions.length}</p>
                        
                        <div className="w-full bg-gray-200 rounded-full h-4 mb-6">
                            <div className="bg-green-500 h-4 rounded-full" style={{width: \`\${(score/examData.questions.length)*100}%\`}}></div>
                        </div>

                        <p className="text-sm text-gray-400">Your results have been sent to your teacher.</p>
                    </div>
                </div>
            );
        }

        // 6. MAIN APP ROUTER
        function App() {
            const [sysStatus, setSysStatus] = useState(null);
            const [user, setUser] = useState(null);
            
            // Check for student link in URL
            const urlParams = new URLSearchParams(window.location.search);
            const linkId = urlParams.get('exam');

            useEffect(() => {
                if(!linkId) {
                    fetch('/api/system/status').then(r=>r.json()).then(setSysStatus);
                }
            }, []);

            // ROUTING LOGIC

            // 1. Student Link View (Priority)
            if(linkId) {
                return <StudentExamView linkId={linkId} />;
            }

            // 2. Loading...
            if(!sysStatus) return <div className="flex h-screen items-center justify-center">Loading System...</div>;

            // 3. First Time Setup
            if(sysStatus.installed === false || sysStatus.hasAdmin === false) {
                return <SetupAdmin onComplete={() => setSysStatus({installed:true, hasAdmin:true})} />;
            }

            // 4. Logged In Views
            if(user) {
                if(user.role === 'super_admin') return <AdminDashboard user={user} onLogout={()=>setUser(null)} />;
                return <TeacherDashboard user={user} onLogout={()=>setUser(null)} />;
            }

            // 5. Login View (Default for teachers/admin)
            return <Login onLogin={setUser} />;
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;
}
