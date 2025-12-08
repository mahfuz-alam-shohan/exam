/**
 * Cloudflare Worker - Exam System (Kahoot-like)
 * - Frontend: React (served as HTML)
 * - Database: D1 (DB binding)
 * - Storage: R2 (BUCKET binding)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API ROUTES ---
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path);
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

// --- API HANDLER ---
async function handleApi(request, env, path) {
  const method = request.method;
  
  try {
    // 1. SYSTEM INITIALIZATION (Create Tables)
    if (path === '/api/init' && method === 'POST') {
      await env.DB.exec(`
        CREATE TABLE IF NOT EXISTS admins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          password TEXT, -- In prod, hash this!
          name TEXT
        );
        CREATE TABLE IF NOT EXISTS exams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pin TEXT UNIQUE,
          title TEXT,
          teacher_id INTEGER,
          settings TEXT, -- JSON: { timer, shuffleQuestions, showResult }
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          exam_id INTEGER,
          text TEXT,
          image_key TEXT,
          choices TEXT -- JSON: [{id, text, isCorrect}]
        );
        CREATE TABLE IF NOT EXISTS students (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id_input TEXT, -- The ID they type (e.g., Roll No)
          name TEXT,
          roll TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          exam_id INTEGER,
          student_id INTEGER,
          score INTEGER,
          total INTEGER,
          details TEXT, -- JSON: User's answers
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Check if any admin exists
      const adminCount = await env.DB.prepare("SELECT COUNT(*) as count FROM admins").first('count');
      return Response.json({ success: true, adminExists: adminCount > 0 });
    }

    // 2. AUTHENTICATION
    if (path === '/api/auth/register' && method === 'POST') {
      const { username, password, name } = await request.json();
      // Only allow if 0 admins exist OR checking generic logic (simplified for demo)
      const count = await env.DB.prepare("SELECT COUNT(*) as count FROM admins").first('count');
      if (count > 0) {
        // In a real app, you'd check JWT here to let admins add admins. 
        // For now allowing adding teachers if you have the secret or just open for this demo context
      }
      await env.DB.prepare("INSERT INTO admins (username, password, name) VALUES (?, ?, ?)")
        .bind(username, password, name).run();
      return Response.json({ success: true });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = await request.json();
      const admin = await env.DB.prepare("SELECT * FROM admins WHERE username = ? AND password = ?")
        .bind(username, password).first();
      if (!admin) return Response.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
      return Response.json({ success: true, admin });
    }

    // 3. EXAM MANAGEMENT
    if (path === '/api/exams' && method === 'GET') {
      const exams = await env.DB.prepare("SELECT * FROM exams ORDER BY created_at DESC").all();
      return Response.json(exams.results);
    }

    if (path === '/api/exams' && method === 'POST') {
      const { title, teacher_id, settings } = await request.json();
      const pin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit PIN
      const res = await env.DB.prepare("INSERT INTO exams (pin, title, teacher_id, settings) VALUES (?, ?, ?, ?)")
        .bind(pin, title, teacher_id, JSON.stringify(settings)).run();
      return Response.json({ success: true, id: res.meta.last_row_id, pin });
    }

    if (path.startsWith('/api/exam/')) {
      const id = path.split('/').pop();
      if (method === 'GET') {
        const exam = await env.DB.prepare("SELECT * FROM exams WHERE id = ? OR pin = ?").bind(id, id).first();
        if(!exam) return Response.json({error: 'Not found'}, {status:404});
        
        const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
        
        // If student is fetching (via PIN), we might hide correct answers in a real secured app
        // For simplicity, we send data and handle logic on client
        return Response.json({ exam, questions: questions.results });
      }
    }

    // 4. QUESTION MANAGEMENT (With Image Upload)
    if (path === '/api/question' && method === 'POST') {
      // Expecting FormData for file upload
      const formData = await request.formData();
      const exam_id = formData.get('exam_id');
      const text = formData.get('text');
      const choices = formData.get('choices');
      const image = formData.get('image'); // File object

      let image_key = null;
      if (image && image.size > 0) {
        image_key = crypto.randomUUID();
        await env.BUCKET.put(image_key, image);
      }

      await env.DB.prepare("INSERT INTO questions (exam_id, text, image_key, choices) VALUES (?, ?, ?, ?)")
        .bind(exam_id, text, image_key, choices).run();
      
      return Response.json({ success: true });
    }

    // 5. STUDENT & ATTEMPTS
    if (path === '/api/submit' && method === 'POST') {
      const { pin, student, answers, score, total } = await request.json();
      
      // Find Exam
      const exam = await env.DB.prepare("SELECT id FROM exams WHERE pin = ?").bind(pin).first();
      if(!exam) return Response.json({error: "Exam not found"});

      // Find or Create Student
      let studentRecord = await env.DB.prepare("SELECT id FROM students WHERE student_id_input = ?").bind(student.id).first();
      
      if (!studentRecord) {
        const res = await env.DB.prepare("INSERT INTO students (student_id_input, name, roll) VALUES (?, ?, ?)")
          .bind(student.id, student.name, student.roll).run();
        studentRecord = { id: res.meta.last_row_id };
      } else {
          // Update name/roll just in case
           await env.DB.prepare("UPDATE students SET name = ?, roll = ? WHERE id = ?")
          .bind(student.name, student.roll, studentRecord.id).run();
      }

      // Record Attempt
      await env.DB.prepare("INSERT INTO attempts (exam_id, student_id, score, total, details) VALUES (?, ?, ?, ?, ?)")
        .bind(exam.id, studentRecord.id, score, total, JSON.stringify(answers)).run();

      return Response.json({ success: true });
    }

    // 6. STATISTICS
    if (path.startsWith('/api/stats/')) {
       const examId = path.split('/').pop();
       
       // Get all attempts for this exam
       const attempts = await env.DB.prepare(`
         SELECT a.*, s.name, s.student_id_input, s.roll 
         FROM attempts a 
         JOIN students s ON a.student_id = s.id 
         WHERE a.exam_id = ? 
         ORDER BY a.timestamp DESC
       `).bind(examId).all();

       return Response.json({ attempts: attempts.results });
    }
    
    // 7. Global Student Stats (Attendance etc)
    if (path === '/api/students/all') {
        const students = await env.DB.prepare("SELECT * FROM students").all();
        // Get attempt counts
        const attemptCounts = await env.DB.prepare("SELECT student_id, COUNT(*) as count FROM attempts GROUP BY student_id").all();
        
        const data = students.results.map(s => {
            const count = attemptCounts.results.find(a => a.student_id === s.id)?.count || 0;
            return { ...s, exams_taken: count };
        });
        return Response.json(data);
    }


  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  return new Response('Not found', { status: 404 });
}


// --- HTML TEMPLATE ---
function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exam Master</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- React & ReactDOM -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <!-- Babel -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <!-- Chart.js for Pie Charts -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    
    <style>
      body { background-color: #f3f4f6; font-family: 'Inter', sans-serif; }
      .fade-in { animation: fadeIn 0.3s ease-in; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    </style>
</head>
<body>
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

        // --- ICONS (SVG Helpers) ---
        const Icons = {
            Plus: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>,
            Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>,
            User: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
            Chart: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/></svg>,
            Check: () => <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>,
            X: () => <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>,
        };

        // --- COMPONENTS ---

        // 1. DASHBOARD COMPONENT
        function Dashboard({ user, onLogout }) {
            const [view, setView] = useState('exams'); // exams, students, create
            const [exams, setExams] = useState([]);
            const [students, setStudents] = useState([]);

            useEffect(() => {
                fetchExams();
                fetchStudents();
            }, []);

            const fetchExams = async () => {
                const res = await fetch('/api/exams');
                const data = await res.json();
                setExams(data);
            };

            const fetchStudents = async () => {
                const res = await fetch('/api/students/all');
                const data = await res.json();
                setStudents(data);
            };

            return (
                <div className="min-h-screen flex flex-col">
                    <header className="bg-white shadow p-4 flex justify-between items-center">
                        <h1 className="text-xl font-bold text-indigo-600">ExamMaster Admin</h1>
                        <div className="flex items-center gap-4">
                            <span className="text-gray-600">Welcome, {user.name}</span>
                            <button onClick={onLogout} className="text-sm text-red-500 hover:underline">Logout</button>
                        </div>
                    </header>
                    <div className="flex flex-1">
                        <aside className="w-64 bg-gray-800 text-white p-4 hidden md:block">
                            <nav className="space-y-2">
                                <button onClick={() => setView('exams')} className={\`w-full text-left p-2 rounded \${view === 'exams' ? 'bg-indigo-600' : 'hover:bg-gray-700'}\`}>My Exams</button>
                                <button onClick={() => setView('students')} className={\`w-full text-left p-2 rounded \${view === 'students' ? 'bg-indigo-600' : 'hover:bg-gray-700'}\`}>Students & Attendance</button>
                                <button onClick={() => setView('create')} className={\`w-full text-left p-2 rounded \${view === 'create' ? 'bg-indigo-600' : 'hover:bg-gray-700'}\`}>+ Create New Exam</button>
                            </nav>
                        </aside>
                        <main className="flex-1 p-6 overflow-y-auto">
                            {view === 'exams' && <ExamsList exams={exams} />}
                            {view === 'students' && <StudentList students={students} />}
                            {view === 'create' && <CreateExam user={user} onSuccess={() => { setView('exams'); fetchExams(); }} />}
                            {view.startsWith('stats-') && <ExamStats examId={view.split('-')[1]} onBack={() => setView('exams')} />}
                        </main>
                    </div>
                    {/* Mobile Nav */}
                    <div className="md:hidden bg-gray-800 p-2 flex justify-around text-white">
                         <button onClick={() => setView('exams')}>Exams</button>
                         <button onClick={() => setView('students')}>Students</button>
                         <button onClick={() => setView('create')}>New</button>
                    </div>
                </div>
            );
        }

        // 2. EXAM CREATION
        function CreateExam({ user, onSuccess }) {
            const [title, setTitle] = useState('');
            const [timer, setTimer] = useState(30); // seconds per question default
            const [questions, setQuestions] = useState([]);
            const [currentQ, setCurrentQ] = useState({ text: '', choices: [{id: 1, text: '', isCorrect: false}, {id: 2, text: '', isCorrect: false}], image: null });

            const addChoice = () => {
                setCurrentQ({...currentQ, choices: [...currentQ.choices, {id: Date.now(), text: '', isCorrect: false}]});
            };

            const updateChoice = (id, field, val) => {
                const newChoices = currentQ.choices.map(c => c.id === id ? { ...c, [field]: val } : c);
                // If setting correct, unset others for single choice logic (or keep multi if needed, assuming single for now)
                if(field === 'isCorrect' && val === true) {
                     newChoices.forEach(c => { if(c.id !== id) c.isCorrect = false; });
                }
                setCurrentQ({...currentQ, choices: newChoices});
            };

            const saveQuestion = () => {
                setQuestions([...questions, { ...currentQ, id: Date.now() }]);
                setCurrentQ({ text: '', choices: [{id: Date.now()+1, text: '', isCorrect: false}, {id: Date.now()+2, text: '', isCorrect: false}], image: null });
            };

            const handleImage = (e) => {
                if(e.target.files[0]) setCurrentQ({...currentQ, image: e.target.files[0]});
            };

            const submitExam = async () => {
                // 1. Create Exam
                const res = await fetch('/api/exams', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ title, teacher_id: user.id, settings: { timer } })
                });
                const data = await res.json();
                
                // 2. Add Questions
                if(data.success) {
                    for(let q of questions) {
                        const fd = new FormData();
                        fd.append('exam_id', data.id);
                        fd.append('text', q.text);
                        fd.append('choices', JSON.stringify(q.choices));
                        if(q.image) fd.append('image', q.image);
                        
                        await fetch('/api/question', { method: 'POST', body: fd });
                    }
                    alert(\`Exam Created! Share PIN: \${data.pin}\`);
                    onSuccess();
                }
            };

            return (
                <div className="bg-white p-6 rounded shadow max-w-3xl mx-auto">
                    <h2 className="text-2xl font-bold mb-4">Create New Exam</h2>
                    <input className="w-full border p-2 mb-2 rounded" placeholder="Exam Title (e.g., Biology 101)" value={title} onChange={e => setTitle(e.target.value)} />
                    <div className="mb-6">
                        <label>Timer per question (seconds): </label>
                        <input type="number" value={timer} onChange={e => setTimer(e.target.value)} className="border p-1 rounded w-20" />
                    </div>

                    <div className="bg-gray-50 p-4 rounded border mb-4">
                        <h3 className="font-semibold mb-2">Add Question {questions.length + 1}</h3>
                        <input className="w-full border p-2 mb-2 rounded" placeholder="Question Text" value={currentQ.text} onChange={e => setCurrentQ({...currentQ, text: e.target.value})} />
                        <input type="file" accept="image/*" onChange={handleImage} className="mb-2 text-sm" />
                        
                        <div className="space-y-2">
                            {currentQ.choices.map((c, idx) => (
                                <div key={c.id} className="flex items-center gap-2">
                                    <input type="radio" name="correct" checked={c.isCorrect} onChange={() => updateChoice(c.id, 'isCorrect', true)} />
                                    <input className="border p-1 flex-1 rounded" placeholder={\`Option \${idx+1}\`} value={c.text} onChange={e => updateChoice(c.id, 'text', e.target.value)} />
                                    {currentQ.choices.length > 2 && <button onClick={() => setCurrentQ({...currentQ, choices: currentQ.choices.filter(x => x.id !== c.id)})} className="text-red-500"><Icons.Trash/></button>}
                                </div>
                            ))}
                        </div>
                        <button onClick={addChoice} className="text-sm text-indigo-600 mt-2 flex items-center gap-1"><Icons.Plus/> Add Option</button>
                        
                        <button onClick={saveQuestion} disabled={!currentQ.text} className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded w-full disabled:opacity-50">Add Question to Exam</button>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-bold mb-2">Questions Added: {questions.length}</h4>
                        <ul className="mb-4 text-sm text-gray-600 list-disc pl-5">
                            {questions.map(q => <li key={q.id}>{q.text}</li>)}
                        </ul>
                        <button onClick={submitExam} disabled={questions.length === 0 || !title} className="bg-green-600 text-white px-6 py-3 rounded w-full text-lg font-bold hover:bg-green-700">🚀 Launch Exam</button>
                    </div>
                </div>
            );
        }

        // 3. EXAM TAKING (STUDENT)
        function StudentApp() {
            const [step, setStep] = useState('login'); // login, exam, result
            const [student, setStudent] = useState({ name: '', id: '', roll: '' });
            const [pin, setPin] = useState('');
            const [examData, setExamData] = useState(null);
            
            // Exam State
            const [currentQIdx, setCurrentQIdx] = useState(0);
            const [answers, setAnswers] = useState({}); // { qId: choiceId }
            const [timeLeft, setTimeLeft] = useState(0);
            const [isSubmitting, setIsSubmitting] = useState(false);
            const [result, setResult] = useState(null);

            const handleLogin = async () => {
                if(!pin || !student.name || !student.id) return alert("Fill all fields");
                const res = await fetch(\`/api/exam/\${pin}\`);
                if(res.status === 404) return alert("Invalid PIN");
                const data = await res.json();
                
                // Shuffle questions if needed
                let qs = data.questions;
                // Simple shuffle
                qs = qs.sort(() => Math.random() - 0.5);
                // Parse settings
                const settings = JSON.parse(data.exam.settings || '{}');

                setExamData({ ...data.exam, questions: qs, settings });
                setStep('exam');
                setTimeLeft(settings.timer || 60);
            };

            useEffect(() => {
                if(step === 'exam' && timeLeft > 0) {
                    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
                    return () => clearInterval(timer);
                } else if (step === 'exam' && timeLeft === 0) {
                    // Auto next or submit logic can go here. For now, we just stay at 0.
                }
            }, [step, timeLeft, currentQIdx]);

            // Reset timer on question change? Or global timer?
            // "Timer for tests" usually implies per question in Kahoot style, or global.
            // Let's implement PER QUESTION timer for Kahoot vibe.
            useEffect(() => {
                if(step === 'exam' && examData) {
                    setTimeLeft(examData.settings.timer || 30);
                }
            }, [currentQIdx, examData]);

            const handleSelect = (qId, cId) => {
                setAnswers({ ...answers, [qId]: cId });
            };

            const next = () => {
                if(currentQIdx < examData.questions.length - 1) {
                    setCurrentQIdx(prev => prev + 1);
                } else {
                    submit();
                }
            };

            const prev = () => {
                if(currentQIdx > 0) setCurrentQIdx(prev => prev - 1);
            };

            const submit = async () => {
                setIsSubmitting(true);
                // Calculate Score Locally for instant feedback (or server side)
                let score = 0;
                const detailedAnswers = examData.questions.map(q => {
                    const selected = answers[q.id];
                    const choices = JSON.parse(q.choices);
                    const correctChoice = choices.find(c => c.isCorrect);
                    const isCorrect = correctChoice && correctChoice.id == selected;
                    if(isCorrect) score++;
                    return { questionId: q.id, selected, isCorrect, correctId: correctChoice?.id };
                });

                await fetch('/api/submit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        pin,
                        student,
                        answers: detailedAnswers,
                        score,
                        total: examData.questions.length
                    })
                });

                setResult({ score, total: examData.questions.length, details: detailedAnswers });
                setStep('result');
                setIsSubmitting(false);
            };

            if(step === 'login') return (
                <div className="flex items-center justify-center min-h-screen bg-indigo-500">
                    <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md fade-in">
                        <h1 className="text-3xl font-extrabold text-center mb-6 text-indigo-700">Student Entry</h1>
                        <input className="block w-full p-3 mb-3 border rounded bg-gray-50" placeholder="Game PIN" value={pin} onChange={e => setPin(e.target.value)} />
                        <input className="block w-full p-3 mb-3 border rounded bg-gray-50" placeholder="Full Name" value={student.name} onChange={e => setStudent({...student, name: e.target.value})} />
                        <input className="block w-full p-3 mb-3 border rounded bg-gray-50" placeholder="Student ID" value={student.id} onChange={e => setStudent({...student, id: e.target.value})} />
                        <input className="block w-full p-3 mb-6 border rounded bg-gray-50" placeholder="Roll Number" value={student.roll} onChange={e => setStudent({...student, roll: e.target.value})} />
                        <button onClick={handleLogin} className="w-full bg-black text-white py-3 rounded font-bold text-lg hover:bg-gray-800 transition">Enter Exam</button>
                    </div>
                </div>
            );

            if(step === 'exam') {
                const q = examData.questions[currentQIdx];
                const choices = JSON.parse(q.choices);
                // Shuffle choices logic if desired
                
                return (
                    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
                        <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg overflow-hidden fade-in">
                            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                                <span className="font-bold">Q {currentQIdx + 1} / {examData.questions.length}</span>
                                <span className="bg-white text-indigo-600 px-3 py-1 rounded-full font-mono font-bold">{timeLeft}s</span>
                            </div>
                            <div className="p-6">
                                {q.image_key && <img src={\`/img/\${q.image_key}\`} className="w-full h-48 object-contain mb-4 bg-black rounded" />}
                                <h2 className="text-xl font-bold mb-6">{q.text}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {choices.map(c => (
                                        <button 
                                            key={c.id} 
                                            onClick={() => handleSelect(q.id, c.id)}
                                            className={\`p-4 rounded-lg text-left border-2 transition \${answers[q.id] == c.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}\`}
                                        >
                                            {c.text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 flex justify-between">
                                <button onClick={prev} disabled={currentQIdx===0} className="px-4 py-2 text-gray-600 disabled:opacity-50">Back</button>
                                <button onClick={next} className="bg-indigo-600 text-white px-6 py-2 rounded font-bold hover:bg-indigo-700">
                                    {currentQIdx === examData.questions.length - 1 ? 'Submit' : 'Next'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            }

            if(step === 'result') {
                // Generate Pie Chart Data
                const correct = result.score;
                const wrong = result.total - result.score;
                
                return (
                    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
                        <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-2xl text-center fade-in">
                            <h2 className="text-3xl font-bold text-gray-800 mb-2">Exam Completed!</h2>
                            <p className="text-gray-600 mb-6">Great job, {student.name}.</p>
                            
                            <div className="flex justify-center mb-8">
                                <div className="w-48 h-48 relative rounded-full" 
                                     style={{background: \`conic-gradient(#4ade80 \${(correct/result.total)*100}%, #f87171 0)\`}}>
                                     <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
                                        <span className="text-3xl font-bold">{Math.round((correct/result.total)*100)}%</span>
                                        <span className="text-xs text-gray-500">Score</span>
                                     </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-green-100 p-4 rounded">
                                    <div className="text-2xl font-bold text-green-700">{correct}</div>
                                    <div className="text-sm text-green-600">Correct</div>
                                </div>
                                <div className="bg-red-100 p-4 rounded">
                                    <div className="text-2xl font-bold text-red-700">{wrong}</div>
                                    <div className="text-sm text-red-600">Wrong</div>
                                </div>
                            </div>

                            <div className="text-left bg-gray-50 p-4 rounded max-h-60 overflow-y-auto mb-6">
                                <h3 className="font-bold mb-2">Review</h3>
                                {result.details.map((d, i) => (
                                    <div key={i} className={\`flex items-center gap-2 mb-2 \${d.isCorrect ? 'text-green-600' : 'text-red-500'}\`}>
                                        {d.isCorrect ? <Icons.Check/> : <Icons.X/>}
                                        <span>Question {i+1}</span>
                                    </div>
                                ))}
                            </div>

                            <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-6 py-3 rounded shadow hover:bg-indigo-700">Take Another Exam</button>
                        </div>
                    </div>
                );
            }
        }

        // 4. STATS VIEW (TEACHER)
        function ExamStats({ examId, onBack }) {
            const [stats, setStats] = useState(null);

            useEffect(() => {
                fetch(\`/api/stats/\${examId}\`).then(r => r.json()).then(data => setStats(data.attempts));
            }, [examId]);

            if(!stats) return <div className="p-8">Loading stats...</div>;

            // Simple Analysis
            const totalAttempts = stats.length;
            const avgScore = totalAttempts ? (stats.reduce((acc, curr) => acc + curr.score, 0) / totalAttempts).toFixed(1) : 0;
            const maxScore = stats[0]?.total || 0;

            return (
                <div className="fade-in">
                    <button onClick={onBack} className="mb-4 text-indigo-600 underline">← Back to Exams</button>
                    <h2 className="text-2xl font-bold mb-4">Exam Performance Report</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="bg-white p-4 rounded shadow">
                            <h3 className="text-gray-500 text-sm">Total Attempts</h3>
                            <p className="text-3xl font-bold">{totalAttempts}</p>
                        </div>
                        <div className="bg-white p-4 rounded shadow">
                            <h3 className="text-gray-500 text-sm">Average Score</h3>
                            <p className="text-3xl font-bold">{avgScore} / {maxScore}</p>
                        </div>
                    </div>

                    <div className="bg-white shadow rounded overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-100 border-b">
                                <tr>
                                    <th className="p-3">Student Name</th>
                                    <th className="p-3">ID</th>
                                    <th className="p-3">Roll</th>
                                    <th className="p-3">Score</th>
                                    <th className="p-3">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map(att => (
                                    <tr key={att.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-medium">{att.name}</td>
                                        <td className="p-3 text-gray-500">{att.student_id_input}</td>
                                        <td className="p-3 text-gray-500">{att.roll}</td>
                                        <td className="p-3 font-bold text-indigo-600">{att.score} / {att.total}</td>
                                        <td className="p-3 text-sm text-gray-400">{new Date(att.timestamp).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {stats.length === 0 && <tr><td colSpan="5" className="p-4 text-center text-gray-500">No attempts yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        function ExamsList({ exams }) {
            const [parentView, setParentView] = useState(null); // Hacky way to switch view in parent, ideally lift state
            if(parentView) return parentView;

            return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 fade-in">
                    {exams.map(exam => (
                        <div key={exam.id} className="bg-white rounded-lg shadow hover:shadow-md transition p-6 border-l-4 border-indigo-500">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-xl font-bold">{exam.title}</h3>
                                <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded font-mono">PIN: {exam.pin}</span>
                            </div>
                            <p className="text-gray-500 text-sm mb-4">Created: {new Date(exam.created_at).toLocaleDateString()}</p>
                            <div className="flex gap-2">
                                <button onClick={() => document.getElementById('root').dispatchEvent(new CustomEvent('nav-stats', {detail: exam.id}))} 
                                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 rounded text-sm font-semibold">
                                    View Stats
                                </button>
                                {/* In a full app, Edit button would go here */}
                            </div>
                        </div>
                    ))}
                    {exams.length === 0 && <div className="col-span-3 text-center text-gray-500 py-10">No exams created yet. Click "Create New Exam" to start.</div>}
                </div>
            );
        }

        function StudentList({ students }) {
            return (
                <div className="bg-white shadow rounded overflow-hidden fade-in">
                    <div className="p-4 border-b">
                        <h2 className="text-xl font-bold">Student Directory</h2>
                        <p className="text-sm text-gray-500">Overview of all students who have participated.</p>
                    </div>
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                <th className="p-3">Name</th>
                                <th className="p-3">Student ID</th>
                                <th className="p-3">Roll</th>
                                <th className="p-3">Exams Taken</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map(s => (
                                <tr key={s.id} className="border-b hover:bg-gray-50">
                                    <td className="p-3 font-medium">{s.name}</td>
                                    <td className="p-3">{s.student_id_input}</td>
                                    <td className="p-3">{s.roll}</td>
                                    <td className="p-3">
                                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-bold">{s.exams_taken} Tests</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // 5. MAIN APP ENTRY
        function App() {
            const [user, setUser] = useState(null); // Admin User
            const [mode, setMode] = useState('landing'); // landing, admin-login, student-app

            // Listen for custom nav events from child components (simple event bus)
            useEffect(() => {
                const handler = (e) => setMode('stats-' + e.detail);
                // Need to wire this up better in a real app, utilizing props drilling for now in Dashboard
            }, []);

            // Check URL hash for mode
            useEffect(() => {
                const checkHash = () => {
                    if(window.location.hash === '#admin') setMode('admin-login');
                    else if(window.location.hash === '#student') setMode('student-app');
                }
                checkHash();
                window.addEventListener('hashchange', checkHash);
                return () => window.removeEventListener('hashchange', checkHash);
            }, []);

            const initDB = async () => {
                 const res = await fetch('/api/init', { method: 'POST' });
                 const data = await res.json();
                 alert(data.success ? "System Initialized! You can now login/register." : "Error initializing");
            };

            const handleAdminLogin = async (e) => {
                e.preventDefault();
                const username = e.target.username.value;
                const password = e.target.password.value;
                // Try login
                let res = await fetch('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({username, password})
                });
                if(res.ok) {
                    const data = await res.json();
                    setUser(data.admin);
                    setMode('admin-dash');
                } else {
                    // Try register if failed (Simplistic "First Time Admin" flow for demo)
                    // In real app, check distinct endpoint
                     if(confirm("Login failed. If this is the first time, click OK to Register as this user.")) {
                         await fetch('/api/auth/register', { method: 'POST', body: JSON.stringify({username, password, name: 'Admin'}) });
                         alert("Registered! Please login again.");
                     }
                }
            };

            if(user && mode === 'admin-dash') return <Dashboard user={user} onLogout={() => setUser(null)} />;
            if(mode.startsWith('stats-')) return <Dashboard user={user} />; // Re-render dash but it needs to handle view prop. 
            // Simplified: Dashboard handles its own views. If we want deep linking stats, we'd pass props.
            // Let's stick to simple dashboard for now.

            if(mode === 'student-app') return <StudentApp />;

            if(mode === 'admin-login') return (
                <div className="min-h-screen flex items-center justify-center bg-gray-200">
                    <form onSubmit={handleAdminLogin} className="bg-white p-8 rounded shadow-md w-96 fade-in">
                        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Teacher Login</h2>
                        <input name="username" className="w-full border p-2 mb-4 rounded" placeholder="Username" required />
                        <input name="password" type="password" className="w-full border p-2 mb-6 rounded" placeholder="Password" required />
                        <button className="w-full bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700">Login / Register</button>
                        <button type="button" onClick={initDB} className="mt-4 text-xs text-gray-500 underline w-full text-center">Initialize System (First Run)</button>
                    </form>
                </div>
            );

            // Landing
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-4">
                    <h1 className="text-5xl font-extrabold mb-4 animate-bounce">ExamMaster</h1>
                    <p className="mb-8 text-xl opacity-90">The ultimate classroom quiz platform.</p>
                    <div className="flex gap-4">
                        <button onClick={() => setMode('student-app')} className="bg-white text-indigo-600 px-8 py-4 rounded-full font-bold text-xl shadow-lg hover:scale-105 transition transform">
                            I am a Student
                        </button>
                        <button onClick={() => setMode('admin-login')} className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-full font-bold text-xl hover:bg-white hover:text-indigo-600 transition">
                            I am a Teacher
                        </button>
                    </div>
                </div>
            );
        }

        // Bridge Dashboard view switching for the stats hack
        const OriginalDashboard = Dashboard;
        Dashboard = function(props) {
           // We intercept to check if we need to show stats based on parent state if we were doing complex routing
           // But since Dashboard handles its own state, we just render it.
           return <OriginalDashboard {...props} />
        }
        
        // Render
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;
}
