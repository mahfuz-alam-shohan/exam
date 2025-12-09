/**
 * Exam System - "Old School" Edition
 * Focus: Stability, Data Integrity, and Linear User Flows.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API GATEWAY ---
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path, url);
    }

    // --- IMAGE SERVING ---
    if (path.startsWith('/img/')) {
      return handleImages(request, env, path);
    }

    // --- FRONTEND SERVING ---
    return new Response(getHtml(), {
      headers: { 'Content-Type': 'text/html' },
    });
  },
};

// --- IMAGE HANDLER ---
async function handleImages(request, env, path) {
    const key = path.split('/img/')[1];
    if (!key) return new Response('Missing ID', { status: 400 });
    try {
        const object = await env.BUCKET.get(key);
        if (!object) return new Response('Not found', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        return new Response(object.body, { headers });
    } catch (e) {
        return new Response('Error', { status: 500 });
    }
}

// --- API LOGIC (THE BASEMENT) ---
async function handleApi(request, env, path, url) {
  const method = request.method;

  try {
    // 1. SYSTEM HEALTH & INIT
    if (path === '/api/system/status') {
      try {
        const count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first('count');
        return Response.json({ installed: true, hasAdmin: count > 0 });
      } catch (e) {
        return Response.json({ installed: false, hasAdmin: false });
      }
    }

    if (path === '/api/system/init' && method === 'POST') {
      // STRICT TABLE DEFINITIONS
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            username TEXT UNIQUE, 
            password TEXT, 
            name TEXT, 
            role TEXT DEFAULT 'teacher', 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            school_id TEXT UNIQUE, 
            name TEXT, 
            roll TEXT, 
            class TEXT, 
            section TEXT, 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            link_id TEXT UNIQUE, 
            title TEXT, 
            teacher_id INTEGER, 
            settings TEXT, 
            is_active BOOLEAN DEFAULT 1, 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            exam_id INTEGER, 
            text TEXT, 
            image_key TEXT, 
            choices TEXT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            exam_id INTEGER, 
            student_db_id INTEGER, 
            score INTEGER, 
            total INTEGER, 
            details TEXT, 
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS school_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            type TEXT, 
            value TEXT
        )`)
      ]);
      return Response.json({ success: true });
    }

    // 2. AUTHENTICATION
    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = await request.json();
      const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?").bind(username, password).first();
      if (!user) return Response.json({ error: "Invalid Login" }, { status: 401 });
      return Response.json({ success: true, user });
    }

    if (path === '/api/auth/setup-admin' && method === 'POST') {
        const { username, password, name } = await request.json();
        // Check if admin exists first to prevent hacks
        const count = await env.DB.prepare("SELECT COUNT(*) as c FROM users").first('c');
        if(count > 0) return Response.json({error: "Admin exists"}, {status: 403});
        
        await env.DB.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'super_admin')")
            .bind(username, password, name).run();
        return Response.json({ success: true });
    }

    // 3. STUDENT REGISTRATION (THE FIX)
    // This separates registration from exam taking. Critical for data integrity.
    if (path === '/api/student/register' && method === 'POST') {
        const { school_id, name, roll, class_val, section } = await request.json();
        
        if (!school_id || !name || !class_val || !roll) {
            return Response.json({ error: "All fields are required" }, { status: 400 });
        }

        // Check if exists
        const existing = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(school_id).first();

        if (existing) {
            // STRICT UPDATE
            await env.DB.prepare("UPDATE students SET name = ?, roll = ?, class = ?, section = ? WHERE id = ?")
                .bind(name, roll, class_val, section, existing.id).run();
            return Response.json({ success: true, id: existing.id });
        } else {
            // STRICT INSERT
            const res = await env.DB.prepare("INSERT INTO students (school_id, name, roll, class, section) VALUES (?, ?, ?, ?, ?)")
                .bind(school_id, name, roll, class_val, section).run();
            return Response.json({ success: true, id: res.meta.last_row_id });
        }
    }

    if (path === '/api/student/check' && method === 'POST') {
        const { school_id } = await request.json();
        const student = await env.DB.prepare("SELECT * FROM students WHERE school_id = ?").bind(school_id).first();
        return Response.json({ found: !!student, student });
    }

    // 4. EXAM DATA
    if (path === '/api/exam/get' && method === 'GET') {
        const link_id = url.searchParams.get('link_id');
        const exam = await env.DB.prepare("SELECT * FROM exams WHERE link_id = ?").bind(link_id).first();
        if(!exam) return Response.json({ error: "Not Found" }, { status: 404 });
        
        const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(exam.id).all();
        const config = await env.DB.prepare("SELECT * FROM school_config").all(); // Get class/section lists
        
        return Response.json({ exam, questions: questions.results, config: config.results });
    }

    if (path === '/api/submit' && method === 'POST') {
        const { link_id, student_school_id, answers, score, total } = await request.json();
        
        const exam = await env.DB.prepare("SELECT id FROM exams WHERE link_id = ?").bind(link_id).first();
        const student = await env.DB.prepare("SELECT id FROM students WHERE school_id = ?").bind(student_school_id).first();
        
        if(!exam || !student) return Response.json({ error: "Data Error" }, { status: 400 });

        await env.DB.prepare("INSERT INTO attempts (exam_id, student_db_id, score, total, details) VALUES (?, ?, ?, ?, ?)")
            .bind(exam.id, student.id, score, total, JSON.stringify(answers)).run();
        
        return Response.json({ success: true });
    }

    // 5. TEACHER TOOLS
    if (path === '/api/teacher/exams' && method === 'GET') {
        const tid = url.searchParams.get('teacher_id');
        const exams = await env.DB.prepare("SELECT * FROM exams WHERE teacher_id = ? ORDER BY created_at DESC").bind(tid).all();
        return Response.json(exams.results);
    }

    if (path === '/api/exam/save' && method === 'POST') {
        const { id, title, teacher_id, settings } = await request.json();
        let examId = id;
        let link_id = null;

        if(examId) {
            await env.DB.prepare("UPDATE exams SET title = ?, settings = ? WHERE id = ?").bind(title, JSON.stringify(settings), examId).run();
            await env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(examId).run(); // Reset qs
        } else {
            link_id = crypto.randomUUID();
            const res = await env.DB.prepare("INSERT INTO exams (link_id, title, teacher_id, settings) VALUES (?, ?, ?, ?)").bind(link_id, title, teacher_id, JSON.stringify(settings)).run();
            examId = res.meta.last_row_id;
        }
        return Response.json({ success: true, id: examId });
    }

    if (path === '/api/question/add' && method === 'POST') {
        const fd = await request.formData();
        const exam_id = fd.get('exam_id');
        const text = fd.get('text');
        const choices = fd.get('choices');
        const image = fd.get('image');
        const existing_key = fd.get('existing_image_key');
        
        let key = null;
        if(image && image.size > 0) {
            key = crypto.randomUUID();
            await env.BUCKET.put(key, image);
        } else if (existing_key && existing_key !== 'null') {
            key = existing_key;
        }

        await env.DB.prepare("INSERT INTO questions (exam_id, text, image_key, choices) VALUES (?, ?, ?, ?)").bind(exam_id, text, key, choices).run();
        return Response.json({ success: true });
    }

    if (path === '/api/exam/toggle' && method === 'POST') {
        const { id, is_active } = await request.json();
        await env.DB.prepare("UPDATE exams SET is_active = ? WHERE id = ?").bind(is_active?1:0, id).run();
        return Response.json({ success: true });
    }

    if (path === '/api/exam/delete' && method === 'POST') {
        const { id } = await request.json();
        await env.DB.batch([
            env.DB.prepare("DELETE FROM exams WHERE id = ?").bind(id),
            env.DB.prepare("DELETE FROM questions WHERE exam_id = ?").bind(id),
            env.DB.prepare("DELETE FROM attempts WHERE exam_id = ?").bind(id)
        ]);
        return Response.json({ success: true });
    }

    if (path === '/api/teacher/exam-details' && method === 'GET') {
        const id = url.searchParams.get('id');
        const exam = await env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first();
        const questions = await env.DB.prepare("SELECT * FROM questions WHERE exam_id = ?").bind(id).all();
        return Response.json({ exam, questions: questions.results });
    }

    if (path === '/api/analytics/exam' && method === 'GET') {
        const id = url.searchParams.get('id');
        const results = await env.DB.prepare(`
            SELECT a.*, s.name, s.roll, s.school_id, s.class, s.section 
            FROM attempts a 
            JOIN students s ON a.student_db_id = s.id 
            WHERE a.exam_id = ? 
            ORDER BY a.score DESC
        `).bind(id).all();
        return Response.json(results.results);
    }
    
    // 6. CONFIG
    if (path === '/api/config/get') return Response.json((await env.DB.prepare("SELECT * FROM school_config ORDER BY value ASC").all()).results);
    
    if (path === '/api/config/add' && method === 'POST') {
        const { type, value } = await request.json();
        await env.DB.prepare("INSERT INTO school_config (type, value) VALUES (?, ?)").bind(type, value).run();
        return Response.json({ success: true });
    }

  } catch(e) {
      return Response.json({ error: e.message }, { status: 500 });
  }
}

// --- FRONTEND (HTML/REACT) ---
function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exam System</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
    <style>
        body { font-family: 'Verdana', sans-serif; background: #e0e0e0; color: #333; }
        
        /* OLD SCHOOL BASEMENT STYLES */
        .panel { background: white; border: 2px solid #555; padding: 20px; box-shadow: 4px 4px 0px #888; margin-bottom: 20px; }
        .input-group { margin-bottom: 15px; }
        .input-group label { display: block; font-weight: bold; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; color: #444; }
        .std-input { width: 100%; padding: 10px; border: 2px solid #ccc; font-family: monospace; font-size: 14px; }
        .std-input:focus { border-color: #000; outline: none; background: #fffadc; }
        
        .btn { padding: 10px 20px; border: 2px solid #000; font-weight: bold; cursor: pointer; text-transform: uppercase; font-size: 12px; background: #eee; transition: all 0.1s; }
        .btn:hover { background: #ddd; }
        .btn:active { transform: translate(2px, 2px); box-shadow: none; }
        .btn-primary { background: #000; color: white; border-color: #000; }
        .btn-primary:hover { background: #333; }
        
        table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        th { background: #000; color: white; padding: 10px; text-align: left; text-transform: uppercase; font-size: 12px; }
        td { border: 1px solid #ccc; padding: 8px; font-size: 13px; }
        tr:nth-child(even) { background: #f9f9f9; }
        
        .status-badge { padding: 2px 6px; border: 1px solid #333; font-size: 10px; font-weight: bold; text-transform: uppercase; }
        .status-active { background: #aaffaa; }
        .status-closed { background: #ffaaaa; }

        /* Loader */
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #333; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect } = React;

        // --- COMPONENTS ---

        // 1. STUDENT EXAM APPLICATION (Robust & Linear)
        function StudentApp({ linkId }) {
            const [step, setStep] = useState('init'); // init, check, register, ready, exam, finish
            const [config, setConfig] = useState({ classes: [], sections: [] });
            const [examData, setExamData] = useState(null);
            
            // Student Data
            const [student, setStudent] = useState({ school_id: '', name: '', roll: '', class_val: '', section: '' });
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState('');

            // Exam State
            const [questions, setQuestions] = useState([]);
            const [qIndex, setQIndex] = useState(0);
            const [answers, setAnswers] = useState({}); // { qId: choiceId }
            const [timer, setTimer] = useState(0);

            // Fetch Exam Meta on Load
            useEffect(() => {
                fetch(\`/api/exam/get?link_id=\${linkId}\`)
                    .then(r => r.json())
                    .then(data => {
                        if(data.error) return setStep('error');
                        setExamData(data.exam);
                        setQuestions(data.questions);
                        
                        // Parse Config
                        const classes = [...new Set(data.config.filter(c=>c.type==='class').map(c=>c.value))];
                        const sections = [...new Set(data.config.filter(c=>c.type==='section').map(c=>c.value))];
                        setConfig({ classes, sections });
                        setStep('check');
                    })
                    .catch(() => setStep('error'));
            }, [linkId]);

            // STEP 1: CHECK ID
            const checkId = async (e) => {
                e.preventDefault();
                if(!student.school_id) return setError("Please enter your ID");
                setLoading(true);
                setError('');
                
                try {
                    const res = await fetch('/api/student/check', { method: 'POST', body: JSON.stringify({ school_id: student.school_id }) }).then(r=>r.json());
                    setLoading(false);
                    if(res.found) {
                        // Found student, pre-fill data
                        setStudent({
                            ...student, 
                            name: res.student.name, 
                            roll: res.student.roll, 
                            class_val: res.student.class || '', 
                            section: res.student.section || ''
                        });
                        // Send to registration to CONFIRM details (always confirm to fix the "not saving" bug)
                        setStep('register');
                    } else {
                        // New student
                        setStep('register');
                    }
                } catch(err) {
                    setLoading(false);
                    setError("Connection Error");
                }
            };

            // STEP 2: REGISTER / UPDATE (The Basement Fix)
            const saveStudent = async (e) => {
                e.preventDefault();
                // Validation
                if(!student.name || !student.roll || !student.class_val || !student.section) {
                    return setError("All fields (Name, Class, Section, Roll) are required.");
                }
                
                setLoading(true);
                setError('');
                
                try {
                    const res = await fetch('/api/student/register', { 
                        method: 'POST', 
                        body: JSON.stringify(student) 
                    }).then(r=>r.json());
                    
                    setLoading(false);
                    if(res.success) {
                        setStep('ready'); // Only proceed if backend confirmed save
                    } else {
                        setError("Could not save profile. Try again.");
                    }
                } catch(err) {
                    setLoading(false);
                    setError("Network Error. Data not saved.");
                }
            };

            // STEP 3: EXAM LOGIC
            const startExam = () => {
                const s = JSON.parse(examData.settings || '{}');
                setTimer(s.timerMode === 'question' ? parseInt(s.timerValue||30) : parseInt(s.timerValue||10)*60);
                setStep('exam');
            };

            useEffect(() => {
                if(step !== 'exam') return;
                const int = setInterval(() => {
                    setTimer(t => {
                        if(t <= 1) { handleNext(); return 0; }
                        return t - 1;
                    });
                }, 1000);
                return () => clearInterval(int);
            }, [step, qIndex]); // Reset on q change if needed

            const handleNext = async () => {
                const isLast = qIndex === questions.length - 1;
                const s = JSON.parse(examData.settings || '{}');
                
                if(isLast) {
                    // SUBMIT
                    let score = 0;
                    const finalAnswers = questions.map(q => {
                        const sel = answers[q.id];
                        const choices = JSON.parse(q.choices);
                        const correct = choices.find(c => c.isCorrect);
                        const isCorrect = correct && correct.id === sel;
                        if(isCorrect) score++;
                        return { qId: q.id, selected: sel, isCorrect };
                    });

                    if((score/questions.length) > 0.6) confetti();
                    
                    await fetch('/api/submit', {
                        method: 'POST',
                        body: JSON.stringify({ 
                            link_id: linkId, 
                            student_school_id: student.school_id, 
                            answers: finalAnswers, 
                            score, 
                            total: questions.length 
                        })
                    });
                    
                    setStep('finish');
                } else {
                    setQIndex(qIndex + 1);
                    if(s.timerMode === 'question') setTimer(parseInt(s.timerValue||30));
                }
            };

            // --- RENDER VIEWS ---

            if(step === 'error') return <div className="p-10 text-center font-bold text-red-600">Exam Invalid or Closed.</div>;
            
            if(step === 'check') return (
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md">
                        <h1 className="text-xl font-bold mb-4 border-b pb-2 text-center">{examData.title}</h1>
                        <p className="text-sm mb-6 text-gray-600 text-center">Enter your School ID to begin.</p>
                        <form onSubmit={checkId}>
                            <div className="input-group">
                                <label>Student ID / Admission No</label>
                                <input className="std-input text-center" value={student.school_id} onChange={e=>setStudent({...student, school_id:e.target.value})} placeholder="e.g. 1042" autoFocus />
                            </div>
                            {error && <div className="bg-red-100 text-red-600 p-2 text-xs font-bold mb-4 border border-red-200">{error}</div>}
                            <button disabled={loading} className="btn btn-primary w-full">{loading ? <span className="loader"></span> : "CONTINUE"}</button>
                        </form>
                    </div>
                </div>
            );

            if(step === 'register') return (
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md">
                        <h2 className="text-lg font-bold mb-4 bg-yellow-100 p-2 border border-yellow-300 text-center">Confirm Your Details</h2>
                        <form onSubmit={saveStudent}>
                            <div className="input-group">
                                <label>Full Name</label>
                                <input className="std-input" value={student.name} onChange={e=>setStudent({...student, name:e.target.value})} placeholder="Full Name" />
                            </div>
                            <div className="flex gap-4">
                                <div className="input-group flex-1">
                                    <label>Roll Number</label>
                                    <input className="std-input" value={student.roll} onChange={e=>setStudent({...student, roll:e.target.value})} placeholder="Roll No" />
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="input-group flex-1">
                                    <label>Class</label>
                                    {config.classes.length > 0 ? (
                                        <select className="std-input" value={student.class_val} onChange={e=>setStudent({...student, class_val:e.target.value})}>
                                            <option value="">Select...</option>
                                            {config.classes.map(c=><option key={c} value={c}>{c}</option>)}
                                        </select>
                                    ) : (
                                        <input className="std-input" value={student.class_val} onChange={e=>setStudent({...student, class_val:e.target.value})} placeholder="Enter Class" />
                                    )}
                                </div>
                                <div className="input-group flex-1">
                                    <label>Section</label>
                                    {config.sections.length > 0 ? (
                                        <select className="std-input" value={student.section} onChange={e=>setStudent({...student, section:e.target.value})}>
                                            <option value="">Select...</option>
                                            {config.sections.map(s=><option key={s} value={s}>{s}</option>)}
                                        </select>
                                    ) : (
                                        <input className="std-input" value={student.section} onChange={e=>setStudent({...student, section:e.target.value})} placeholder="Enter Section" />
                                    )}
                                </div>
                            </div>
                            
                            {error && <div className="bg-red-100 text-red-600 p-2 text-xs font-bold mb-4 border border-red-200">{error}</div>}
                            <button disabled={loading} className="btn btn-primary w-full">{loading ? "SAVING..." : "SAVE & CONTINUE"}</button>
                            <div className="text-center mt-2"><button type="button" onClick={()=>setStep('check')} className="text-xs underline text-gray-500">Back</button></div>
                        </form>
                    </div>
                </div>
            );

            if(step === 'ready') return (
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md text-center">
                        <h2 className="text-2xl font-bold mb-2">Ready?</h2>
                        <div className="bg-gray-100 p-4 border mb-4 text-left text-sm">
                            <p><strong>Name:</strong> {student.name}</p>
                            <p><strong>ID:</strong> {student.school_id}</p>
                            <p><strong>Class:</strong> {student.class_val} - {student.section}</p>
                        </div>
                        <p className="mb-6 text-sm text-gray-500">The exam timer will start immediately.</p>
                        <button onClick={startExam} className="btn btn-primary w-full">START EXAM</button>
                    </div>
                </div>
            );

            if(step === 'exam') {
                const q = questions[qIndex];
                const choices = JSON.parse(q.choices);
                const s = JSON.parse(examData.settings || '{}');
                
                return (
                    <div className="max-w-3xl mx-auto p-4">
                        <div className="flex justify-between items-center mb-4 bg-white border-2 border-black p-3 sticky top-0 shadow-md">
                            <span className="font-bold">Q {qIndex+1} / {questions.length}</span>
                            <span className={\`font-mono font-bold text-xl \${timer<10?'text-red-600':''}\`}>
                                {s.timerMode === 'question' ? timer : Math.floor(timer/60)+':'+(timer%60).toString().padStart(2,'0')}
                            </span>
                        </div>
                        
                        <div className="panel min-h-[300px] flex flex-col justify-center">
                            {q.image_key && <img src={\`/img/\${q.image_key}\`} className="max-h-48 mx-auto mb-4 border" />}
                            <h2 className="text-xl font-bold mb-6">{q.text}</h2>
                            
                            <div className="space-y-3">
                                {choices.map(c => (
                                    <div key={c.id} 
                                        onClick={() => setAnswers({...answers, [q.id]: c.id})}
                                        className={\`p-4 border-2 cursor-pointer transition \${answers[q.id]===c.id ? 'bg-black text-white border-black' : 'bg-white border-gray-300 hover:border-black'}\`}>
                                        <span className="font-bold mr-3">{String.fromCharCode(65 + choices.indexOf(c))}.</span>
                                        {c.text}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="text-right">
                            <button onClick={()=>handleNext()} className="btn btn-primary">
                                {qIndex === questions.length - 1 ? "SUBMIT EXAM" : "NEXT QUESTION"}
                            </button>
                        </div>
                    </div>
                );
            }

            if(step === 'finish') return (
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="panel text-center">
                        <h1 className="text-3xl mb-4">Exam Submitted</h1>
                        <div className="text-green-600 font-bold text-xl mb-4">Your responses have been recorded.</div>
                        <p className="text-sm text-gray-500">You may close this window.</p>
                    </div>
                </div>
            );

            return <div>Loading...</div>;
        }


        // 2. TEACHER DASHBOARD (Classic Tables)
        function TeacherDashboard({ user, onLogout }) {
            const [view, setView] = useState('exams'); // exams, config, results
            const [data, setData] = useState([]);
            const [loading, setLoading] = useState(false);

            // Sub-components
            const [editorExamId, setEditorExamId] = useState(null);
            
            useEffect(() => { loadData(); }, [view]);

            const loadData = async () => {
                setLoading(true);
                if(view === 'exams') {
                    const res = await fetch(\`/api/teacher/exams?teacher_id=\${user.id}\`).then(r=>r.json());
                    setData(res);
                } else if (view === 'config') {
                    const res = await fetch('/api/config/get').then(r=>r.json());
                    setData(res);
                }
                setLoading(false);
            };

            const toggleExam = async (id, active) => {
                await fetch('/api/exam/toggle', {method:'POST', body:JSON.stringify({id, is_active:!active})});
                loadData();
            };

            const deleteExam = async (id) => {
                if(confirm("Delete this exam and all its results?")) {
                    await fetch('/api/exam/delete', {method:'POST', body:JSON.stringify({id})});
                    loadData();
                }
            };

            const addConfig = async (type, val) => {
                await fetch('/api/config/add', {method:'POST', body:JSON.stringify({type, value:val})});
                loadData();
            };

            if(editorExamId !== null) return <ExamEditor examId={editorExamId} user={user} onBack={()=>{setEditorExamId(null); loadData();}} />;

            return (
                <div className="max-w-5xl mx-auto p-4">
                    <div className="flex justify-between items-center mb-6 bg-white p-4 border-b-2 border-black">
                        <div>
                            <h1 className="text-xl font-bold">TEACHER PANEL</h1>
                            <div className="text-xs text-gray-500">Logged in as {user.name}</div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={()=>setView('exams')} className={\`btn \${view==='exams'?'btn-primary':''}\`}>Exams</button>
                            <button onClick={()=>setView('config')} className={\`btn \${view==='config'?'btn-primary':''}\`}>Config</button>
                            <button onClick={onLogout} className="btn">Logout</button>
                        </div>
                    </div>

                    {view === 'exams' && (
                        <div>
                            <div className="flex justify-end mb-4">
                                <button onClick={()=>setEditorExamId(0)} className="btn btn-primary">+ NEW EXAM</button>
                            </div>
                            <div className="panel overflow-x-auto">
                                <table>
                                    <thead><tr><th>Status</th><th>Title</th><th>Link</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        {data.map(e => (
                                            <tr key={e.id}>
                                                <td><span className={\`status-badge \${e.is_active?'status-active':'status-closed'}\`}>{e.is_active ? 'OPEN' : 'CLOSED'}</span></td>
                                                <td className="font-bold">{e.title}</td>
                                                <td className="font-mono text-xs cursor-pointer hover:bg-yellow-100" onClick={() => navigator.clipboard.writeText(window.location.origin + '/?exam=' + e.link_id)}>?exam={e.link_id.substring(0,8)}...</td>
                                                <td>
                                                    <div className="flex gap-1">
                                                        <button onClick={()=>toggleExam(e.id, e.is_active)} className="btn text-xs px-2 py-1">{e.is_active ? 'Close' : 'Open'}</button>
                                                        <button onClick={()=>setEditorExamId(e.id)} className="btn text-xs px-2 py-1">Edit</button>
                                                        <button onClick={()=>deleteExam(e.id)} className="btn text-xs px-2 py-1 bg-red-100 border-red-200 hover:bg-red-200">Del</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {view === 'config' && (
                        <div className="panel">
                            <h2 className="font-bold border-b pb-2 mb-4">Class & Section Configuration</h2>
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <h3 className="font-bold text-sm mb-2">Classes</h3>
                                    <form onSubmit={(e)=>{e.preventDefault(); addConfig('class', e.target.val.value); e.target.reset();}} className="flex gap-2 mb-2">
                                        <input name="val" className="std-input py-1" placeholder="e.g. 10" required />
                                        <button className="btn btn-primary">+</button>
                                    </form>
                                    <div className="bg-gray-100 p-2 border h-40 overflow-auto">
                                        {data.filter(c=>c.type==='class').map(c=><div key={c.id} className="border-b p-1 text-sm">{c.value}</div>)}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm mb-2">Sections</h3>
                                    <form onSubmit={(e)=>{e.preventDefault(); addConfig('section', e.target.val.value); e.target.reset();}} className="flex gap-2 mb-2">
                                        <input name="val" className="std-input py-1" placeholder="e.g. A" required />
                                        <button className="btn btn-primary">+</button>
                                    </form>
                                    <div className="bg-gray-100 p-2 border h-40 overflow-auto">
                                        {data.filter(c=>c.type==='section').map(c=><div key={c.id} className="border-b p-1 text-sm">{c.value}</div>)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        function ExamEditor({ examId, user, onBack }) {
            const [meta, setMeta] = useState({ title: '', timerMode: 'question', timerValue: 30 });
            const [qs, setQs] = useState([]);
            
            useEffect(() => {
                if(examId !== 0) {
                    fetch(\`/api/teacher/exam-details?id=\${examId}\`).then(r=>r.json()).then(d => {
                        setMeta({ ...meta, ...JSON.parse(d.exam.settings||'{}'), title: d.exam.title });
                        setQs(d.questions.map(q => ({...q, choices: JSON.parse(q.choices), tempId: Math.random()})));
                    });
                }
            }, [examId]);

            const save = async () => {
                if(!meta.title) return alert("Title required");
                const res = await fetch('/api/exam/save', { 
                    method: 'POST', 
                    body: JSON.stringify({ id: examId===0?null:examId, title: meta.title, teacher_id: user.id, settings: meta }) 
                }).then(r=>r.json());
                
                for(let q of qs) {
                    const fd = new FormData();
                    fd.append('exam_id', res.id);
                    fd.append('text', q.text);
                    fd.append('choices', JSON.stringify(q.choices));
                    if(q.image instanceof File) fd.append('image', q.image);
                    else if(q.image_key) fd.append('existing_image_key', q.image_key);
                    await fetch('/api/question/add', { method:'POST', body: fd });
                }
                onBack();
            };

            const addQ = () => {
                setQs([...qs, { tempId: Math.random(), text: '', choices: [{id:1, text:'', isCorrect:false}, {id:2, text:'', isCorrect:false}] }]);
            };

            const updateQ = (idx, field, val) => {
                const n = [...qs]; n[idx][field] = val; setQs(n);
            };

            return (
                <div className="max-w-4xl mx-auto p-4">
                    <button onClick={onBack} className="mb-4 text-xs underline">Back</button>
                    <div className="panel mb-4">
                        <h2 className="font-bold mb-4">Exam Settings</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="input-group">
                                <label>Exam Title</label>
                                <input className="std-input" value={meta.title} onChange={e=>setMeta({...meta, title:e.target.value})} />
                            </div>
                            <div className="input-group">
                                <label>Timer (Seconds per Question)</label>
                                <input className="std-input" type="number" value={meta.timerValue} onChange={e=>setMeta({...meta, timerValue:e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {qs.map((q, i) => (
                        <div key={q.tempId} className="panel relative">
                            <button className="absolute top-2 right-2 text-red-500 font-bold" onClick={()=>{const n=[...qs];n.splice(i,1);setQs(n);}}>X</button>
                            <div className="input-group">
                                <label>Question {i+1}</label>
                                <textarea className="std-input" value={q.text} onChange={e=>updateQ(i, 'text', e.target.value)} rows="2"></textarea>
                            </div>
                            <div className="mb-2">
                                <input type="file" onChange={e=>updateQ(i, 'image', e.target.files[0])} />
                                {(q.image || q.image_key) && <span className="text-green-600 font-bold ml-2">Image attached</span>}
                            </div>
                            <div className="pl-4 border-l-4 border-gray-200">
                                {q.choices.map((c, ci) => (
                                    <div key={c.id} className="flex gap-2 mb-2 items-center">
                                        <input type="radio" name={'rad'+q.tempId} checked={c.isCorrect} onChange={()=>{
                                            const nc = q.choices.map(x=>({...x, isCorrect: x.id===c.id}));
                                            updateQ(i, 'choices', nc);
                                        }} />
                                        <input className="std-input py-1" value={c.text} onChange={e=>{
                                            const nc = [...q.choices]; nc[ci].text = e.target.value; updateQ(i, 'choices', nc);
                                        }} placeholder="Option text" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    
                    <button onClick={addQ} className="btn w-full mb-4">+ Add Question</button>
                    <button onClick={save} className="btn btn-primary w-full">SAVE EXAM</button>
                </div>
            );
        }

        // 3. MAIN ROUTER
        function App() {
            const [user, setUser] = useState(null);
            const [view, setView] = useState('loading'); // loading, landing, login, dashboard, student_portal
            const linkId = new URLSearchParams(window.location.search).get('exam');

            useEffect(() => {
                fetch('/api/system/status').then(r=>r.json()).then(s => {
                    if(!s.installed || !s.hasAdmin) setView('setup'); // Or handle setup
                    else setView('landing');
                });
            }, []);

            const login = async (e) => {
                e.preventDefault();
                const u = e.target.username.value;
                const p = e.target.password.value;
                const res = await fetch('/api/auth/login', {method:'POST', body:JSON.stringify({username:u, password:p})}).then(r=>r.json());
                if(res.success) { setUser(res.user); setView('dashboard'); }
                else alert("Failed");
            };

            if(linkId) return <StudentApp linkId={linkId} />;

            if(view === 'landing') return (
                <div className="min-h-screen flex items-center justify-center bg-gray-200">
                    <div className="panel w-full max-w-sm text-center">
                        <h1 className="font-bold text-2xl mb-6">EXAM PORTAL</h1>
                        <button onClick={()=>setView('login')} className="btn btn-primary w-full mb-4">TEACHER LOGIN</button>
                    </div>
                </div>
            );

            if(view === 'login') return (
                <div className="min-h-screen flex items-center justify-center bg-gray-200">
                    <div className="panel w-full max-w-sm">
                        <h2 className="font-bold mb-4">STAFF LOGIN</h2>
                        <form onSubmit={login}>
                            <div className="input-group">
                                <label>Username</label>
                                <input name="username" className="std-input" />
                            </div>
                            <div className="input-group">
                                <label>Password</label>
                                <input name="password" type="password" className="std-input" />
                            </div>
                            <button className="btn btn-primary w-full">LOGIN</button>
                            <button type="button" onClick={()=>setView('landing')} className="w-full text-xs mt-2 underline">Cancel</button>
                        </form>
                    </div>
                </div>
            );

            if(view === 'dashboard' && user) return <TeacherDashboard user={user} onLogout={()=>setView('landing')} />;

            return <div className="p-10 text-center">System Loading...</div>;
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>`;
}


