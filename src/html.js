export function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>My Class</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Quicksand:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Quicksand', sans-serif; background-color: #fff7ed; -webkit-tap-highlight-color: transparent; }
      h1, h2, h3, button, .font-kiddy { font-family: 'Fredoka', sans-serif; }
      .anim-enter { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
      .anim-pop { animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
      @keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .animate-spin-slow { animation: spin 2s linear infinite; }
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    </style>
</head>
<body class="text-slate-800 antialiased selection:bg-orange-200">
    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect, useMemo, Component, useRef } = React;

        // --- AUTH HELPER ---
        const apiFetch = async (url, options = {}) => {
            const user = JSON.parse(localStorage.getItem('mc_user') || '{}');
            
            // FIX: Default to JSON, but allow browser to override for FormData
            const headers = { 
                'Content-Type': 'application/json',
                ...(user.token ? { 'Authorization': 'Bearer ' + user.token } : {}),
                ...options.headers 
            };

            // FIX: If sending files/form-data, remove Content-Type so browser sets boundary correctly
            if (options.body instanceof FormData) {
                delete headers['Content-Type'];
            }

            const res = await fetch(url, { ...options, headers });
            
            if (res.status === 401) {
                localStorage.removeItem('mc_user');
                window.location.reload();
            }
            return res;
        };

        // --- ERROR BOUNDARY ---
        class ErrorBoundary extends Component {
            constructor(props) { super(props); this.state = { hasError: false, error: null }; }
            static getDerivedStateFromError(error) { return { hasError: true, error }; }
            render() {
                if (this.state.hasError) {
                    return (
                        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-red-50 text-red-900 text-center">
                            <h1 className="text-3xl font-bold mb-4">Oops! 🐞</h1>
                            <p className="mb-4">Something went wrong.</p>
                            <pre className="bg-white p-2 rounded text-xs text-left overflow-auto max-w-sm border border-red-200">{this.state.error?.toString()}</pre>
                            <button onClick={() => window.location.reload()} className="mt-6 bg-red-600 text-white px-6 py-3 rounded-xl font-bold">Reload App</button>
                        </div>
                    );
                }
                return this.props.children;
            }
        }

        const Icons = {
            Logo: () => <svg className="w-8 h-8 text-orange-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>,
            Home: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
            Logout: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
            Refresh: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
            Exam: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
            Users: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
            Setting: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
            Back: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>,
            Edit: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
            Trash: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
            Image: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
            Plus: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
            Chart: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
            Check: () => <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>,
            X: () => <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
            Trophy: () => <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/></svg>,
            Upload: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
            Download: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
            Loading: () => <svg className="w-5 h-5 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
            School: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
        };

        const ToastContainer = ({ toasts }) => (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-xs px-4">
                {toasts.map(t => (
                    <div key={t.id} className={\`p-3 rounded-2xl shadow-xl text-center text-sm font-bold flex items-center justify-center gap-2 anim-pop border-2 \${t.type==='error'?'bg-red-50 border-red-200 text-red-600':'bg-white border-green-200 text-green-600'}\`}>
                        {t.msg}
                    </div>
                ))}
            </div>
        );

        const Toggle = ({ checked, onChange }) => (
            <button onClick={() => onChange(!checked)} className={\`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none \${checked ? 'bg-green-400' : 'bg-gray-200'}\`}>
                <span className={\`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform \${checked ? 'translate-x-6' : 'translate-x-1'}\`} />
            </button>
        );

        // --- COMPONENTS ---
        
        // FIX: Reordered Component (StudentPortal defined before StudentExamApp)
        function StudentPortal({ onBack }) {
             const [id, setId] = useState('');
             const [data, setData] = useState(null);
             const [selectedExam, setSelectedExam] = useState(null); 
             const [viewDetail, setViewDetail] = useState(null); 
             
             const refreshData = async () => {
                 if(!localStorage.getItem('student_id')) return;
                 const res = await fetch('/api/student/portal-history', { method: 'POST', body: JSON.stringify({ school_id: localStorage.getItem('student_id') }) }).then(r => r.json()); 
                 if(res.found) setData(res);
             };

             const login = async (e) => { 
                 e.preventDefault(); 
                 const res = await fetch('/api/student/portal-history', { method: 'POST', body: JSON.stringify({ school_id: id }) }).then(r => r.json()); 
                 if(res.found) { setData(res); localStorage.setItem('student_id', id); } 
                 else alert("ID not found!"); 
            };
             
             useEffect(() => { 
                 const saved = localStorage.getItem('student_id'); 
                 if(saved && !data) {
                     fetch('/api/student/portal-history', { method: 'POST', body: JSON.stringify({ school_id: saved }) }).then(r => r.json()).then(r => r.found && setData(r)); 
                 }
            }, []);

             if(!data) return (
                <div className="min-h-screen bg-orange-50 flex items-center justify-center p-6">
                    <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-xl text-center anim-pop relative">
                        <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 font-bold text-sm">Back</button>
                        <div className="mb-6 mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-500"><Icons.Logo /></div>
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">Student Hub</h1>
                        <form onSubmit={login}>
                            <input value={id} onChange={e=>setId(e.target.value)} className="w-full bg-gray-100 p-4 rounded-2xl font-bold text-center text-lg outline-none focus:ring-2 focus:ring-orange-400 mb-4" placeholder="Enter School ID" />
                            <button className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl btn-bounce shadow-lg shadow-orange-200">Enter</button>
                        </form>
                    </div>
                </div>
            );

             if(viewDetail) return <ResultDetailView result={{...viewDetail, name: data.student.name, roll: data.student.roll}} onClose={()=>setViewDetail(null)} />;

             const examGroups = data ? Object.values(data.history.reduce((acc, curr) => {
                 if(!acc[curr.exam_id]) acc[curr.exam_id] = { ...curr, attempts: [] };
                 acc[curr.exam_id].attempts.push(curr);
                 return acc;
             }, {})) : [];

             if(selectedExam) {
                 return (
                    <div className="min-h-screen bg-orange-50 pb-safe p-4">
                        <div className="max-w-lg mx-auto">
                            <button onClick={()=>setSelectedExam(null)} className="flex items-center gap-2 text-gray-500 font-bold mb-4"><Icons.Back/> Back to Dashboard</button>
                            <h2 className="text-2xl font-bold text-slate-800 mb-2">{selectedExam.title}</h2>
                            <p className="text-gray-500 text-sm font-bold mb-6">Your Performance History</p>
                            
                            <div className="space-y-3">
                                {selectedExam.attempts.map((h, i) => (
                                    <div key={h.id} onClick={()=>setViewDetail(h)} className="bg-white p-5 rounded-2xl shadow-sm border border-orange-50 flex justify-between items-center cursor-pointer active:scale-95 transition">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">Attempt #{selectedExam.attempts.length - i}</h4>
                                            <p className="text-xs text-gray-400 font-bold">{new Date(h.timestamp).toLocaleString()}</p>
                                        </div>
                                        <div className={\`text-lg font-black \${ (h.score/h.total)>0.7 ? 'text-green-500':'text-orange-400' }\`}>{h.score}/{h.total}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                 );
             }

             return (
                <div className="min-h-screen bg-orange-50 pb-safe">
                    <div className="bg-orange-500 p-8 pb-16 rounded-b-[40px] text-white shadow-lg relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex gap-2">
                                    <button onClick={()=>{localStorage.removeItem('student_id'); setData(null);}} className="bg-white/20 p-2 rounded-xl backdrop-blur-sm text-sm font-bold flex items-center gap-2 hover:bg-white/30 transition"><Icons.Logout/> Logout</button>
                                    <button onClick={refreshData} className="bg-white/20 p-2 rounded-xl backdrop-blur-sm text-white hover:bg-white/30 transition"><Icons.Refresh/></button>
                                </div>
                                <span className="font-bold opacity-70">My Class</span>
                            </div>
                            <h1 className="text-3xl font-bold mb-1 truncate">Hi, {data.student.name.split(' ')[0]}!</h1>
                            <p className="opacity-80 font-bold text-sm tracking-wide">{data.student.school_id} • Class {data.student.class || 'N/A'}</p>
                        </div>
                    </div>
                    <div className="px-6 -mt-10 relative z-20 max-w-lg mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-3xl shadow-lg flex justify-around text-center">
                            <div>
                                <div className="text-3xl font-black text-slate-800">{data.history.length}</div>
                                <div className="text-xs font-bold text-gray-400 uppercase">Exams Taken</div>
                            </div>
                            <div className="w-px bg-gray-100"></div>
                            <div>
                                <div className="text-3xl font-black text-green-500">{Math.round(data.history.reduce((a,b)=>a+(b.score/b.total),0)/data.history.length * 100 || 0)}%</div>
                                <div className="text-xs font-bold text-gray-400 uppercase">Avg Score</div>
                            </div>
                        </div>
                        <div className="space-y-4 pb-10">
                            <div className="flex justify-between items-center px-2">
                                <h3 className="font-bold text-slate-400 text-xs uppercase">Your Exams</h3>
                                <button onClick={refreshData} className="text-orange-500 text-xs font-bold">Refresh</button>
                            </div>
                            {examGroups.map(group => (
                                <div key={group.exam_id} onClick={()=>setSelectedExam(group)} className="bg-white p-5 rounded-2xl shadow-sm border border-orange-50 flex justify-between items-center cursor-pointer active:scale-95 transition">
                                    <div>
                                        <h4 className="font-bold text-slate-800">{group.title}</h4>
                                        <p className="text-xs text-indigo-500 font-bold">{group.attempts.length} Attempts</p>
                                    </div>
                                    <Icons.Back className="rotate-180 text-gray-300 w-5 h-5"/>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        function ResultDetailView({ result, onClose }) {
            return (
                <div className="fixed inset-0 bg-white z-[60] overflow-y-auto anim-enter">
                    <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-orange-100 p-4 flex justify-between items-center shadow-sm">
                        <button onClick={onClose} className="flex items-center gap-2 text-gray-500 font-bold"><Icons.Back/> Back</button>
                        <span className="font-bold text-lg truncate max-w-[50%]">{result.title || result.name}</span>
                    </div>
                    <div className="p-4 max-w-2xl mx-auto pb-20">
                        <h3 className="font-bold text-2xl mb-1 text-center">{result.name}</h3>
                        <p className="text-center text-gray-400 mb-6 font-bold">{result.roll ? \`Roll: \${result.roll}\` : ''} {result.timestamp && \` • \${new Date(result.timestamp).toLocaleString()}\`}</p>
                        
                        <div className="flex justify-center gap-4 mb-8">
                            <div className="bg-green-50 text-green-600 px-4 py-2 rounded-xl font-bold border border-green-100">Score: {result.score}/{result.total}</div>
                            <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold border border-blue-100">{Math.round((result.score/result.total)*100)}%</div>
                        </div>

                        <div className="space-y-4">
                            {JSON.parse(result.details || '[]').map((d,i)=>(
                                <div key={i} className={\`p-4 rounded-2xl border \${d.isCorrect?'bg-green-50/50 border-green-200':'bg-red-50/50 border-red-200'}\`}>
                                    <div className="font-bold text-gray-800 mb-2">Q{i+1}: {d.qText}</div>
                                    <div className="text-sm space-y-1">
                                        <div className="flex items-start gap-2">
                                            <span className="font-bold min-w-[60px] text-gray-500">Student:</span> 
                                            <span className={\`font-bold \${d.isCorrect ? 'text-green-500' : 'text-red-500'}\`}>{d.selectedText}</span>
                                        </div>
                                        {!d.isCorrect && (
                                            <div className="flex items-start gap-2">
                                                <span className="font-bold min-w-[60px] text-gray-500">Correct:</span> 
                                                <span className="font-bold text-gray-800">{d.correctText}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        // ... [Setup, Login, DashboardLayout, SchoolConfigView, AdminView, TeacherView, StudentList, ExamStats, ExamEditor components remain below as they were] ...

        function Setup({ onComplete, addToast }) { 
             const handle = async (e) => { 
                 e.preventDefault(); 
                 await apiFetch('/api/system/init', { method: 'POST' }); 
                 const res = await apiFetch('/api/auth/setup-admin', { method: 'POST', body: JSON.stringify({ name: e.target.name.value, username: e.target.username.value, password: e.target.password.value }) }); 
                 if(res.ok) onComplete(); 
                 else addToast("Failed", 'error'); 
            };
             return (
                <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
                    <form onSubmit={handle} className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-xl">
                        <h2 className="font-bold text-xl mb-4">Setup School</h2>
                        <input name="name" placeholder="School Name" className="w-full bg-gray-50 p-3 rounded-xl mb-3 font-bold" />
                        <input name="username" placeholder="Admin User" className="w-full bg-gray-50 p-3 rounded-xl mb-3 font-bold" />
                        <input name="password" type="password" placeholder="Password" className="w-full bg-gray-50 p-3 rounded-xl mb-4 font-bold" />
                        <button className="w-full bg-orange-500 text-white p-3 rounded-xl font-bold">Start</button>
                    </form>
                </div>
            );
        }

        function Login({ onLogin, addToast, onBack }) { 
             const handle = async (e) => { 
                 e.preventDefault(); 
                 const res = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: e.target.username.value, password: e.target.password.value }) }); 
                 const data = await res.json(); 
                 if(data.success) {
                     onLogin({ ...data.user, token: data.token }); 
                 }
                 else addToast("Wrong Password!", 'error'); 
            };
             return (
                <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
                    <form onSubmit={handle} className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-xl relative">
                        <button type="button" onClick={onBack} className="absolute top-6 left-6 font-bold text-gray-400">Back</button>
                        <h2 className="font-bold text-2xl mb-6 text-center">Teacher Login</h2>
                        <input name="username" placeholder="Username" className="w-full bg-gray-50 p-4 rounded-xl mb-4 font-bold outline-none focus:ring-2 focus:ring-orange-200" />
                        <input name="password" type="password" placeholder="Password" className="w-full bg-gray-50 p-4 rounded-xl mb-6 font-bold outline-none focus:ring-2 focus:ring-orange-200" />
                        <button className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold shadow-lg btn-bounce">Sign In</button>
                    </form>
                </div>
            );
        }

        function DashboardLayout({ user, onLogout, title, action, children, activeTab, onTabChange, onRefresh }) {
            const safeUser = user || { name: 'User', role: 'teacher' };
            const initial = (safeUser.name && safeUser.name[0]) ? safeUser.name[0] : 'U';
            
            const tabs = [
                { id: 'exams', icon: <Icons.Exam />, label: 'Exams' },
                ...(safeUser.role === 'teacher' ? [{ id: 'students', icon: <Icons.Users />, label: 'Students' }] : []),
                ...(safeUser.role === 'super_admin' ? [
                    { id: 'users', icon: <Icons.Users />, label: 'Users' },
                    { id: 'exams', icon: <Icons.Exam />, label: 'All Exams' }, 
                    { id: 'school', icon: <Icons.School />, label: 'School Data' },
                    { id: 'settings', icon: <Icons.Setting />, label: 'Settings' }
                ] : []),
            ];

            return (
                <div className="min-h-[100dvh] pb-24 md:pb-0 md:pl-20 lg:pl-64 bg-[#fff7ed]">
                    <aside className="fixed left-0 top-0 h-screen w-20 lg:w-64 bg-white border-r border-orange-100 hidden md:flex flex-col z-30">
                        <div className="p-6 flex items-center gap-3">
                            <Icons.Logo />
                            <span className="hidden lg:block text-xl font-bold text-orange-600">My Class</span>
                        </div>
                        <nav className="flex-1 px-4 space-y-2 mt-4">
                            {tabs.map(t => (
                                <button key={t.id} onClick={() => onTabChange(t.id)} className={\`w-full flex items-center gap-4 p-3 rounded-2xl transition-all btn-bounce \${activeTab === t.id ? 'bg-orange-100 text-orange-600 shadow-sm' : 'text-gray-400 hover:bg-gray-50'}\`}>
                                    {t.icon}
                                    <span className="hidden lg:block font-bold text-sm">{t.label}</span>
                                </button>
                            ))}
                        </nav>
                        <div className="p-4 border-t border-orange-50">
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-800/50 rounded-xl mb-2">
                                <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-sm font-bold text-white">{initial}</div>
                                <div className="flex-1 min-w-0 hidden lg:block">
                                    <p className="text-sm font-medium text-white truncate">{safeUser.name}</p>
                                </div>
                            </div>
                            <button onClick={onLogout} className="w-full flex items-center gap-4 p-3 rounded-2xl text-red-400 hover:bg-red-50 transition">
                                <Icons.Logout /> <span className="hidden lg:block font-bold text-sm">Logout</span>
                            </button>
                        </div>
                    </aside>
                    
                    <header className="md:hidden sticky top-0 bg-white/90 backdrop-blur-md border-b border-orange-100 p-4 flex justify-between items-center z-40">
                        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
                        <div className="flex items-center gap-2">
                            {onRefresh && <button onClick={onRefresh} className="bg-gray-100 p-2 rounded-full text-gray-600 hover:bg-gray-200"><Icons.Refresh/></button>}
                            {action}
                            <button onClick={onLogout} className="bg-red-50 p-2 rounded-full text-red-500"><Icons.Logout/></button>
                        </div>
                    </header>

                    <header className="hidden md:flex sticky top-0 bg-white/90 backdrop-blur-md border-b border-orange-100 px-8 py-4 justify-between items-center z-40">
                        <div className="flex items-center gap-4">
                            <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                            {onRefresh && <button onClick={onRefresh} className="bg-gray-50 p-2 rounded-xl text-gray-500 hover:text-orange-500 transition" title="Refresh Data"><Icons.Refresh/></button>}
                        </div>
                        {action}
                    </header>

                    <main className="p-4 md:p-8 max-w-7xl mx-auto min-h-[80vh]">
                        {children}
                    </main>

                    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-orange-100 flex justify-around p-2 z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                        {tabs.map(t => (
                            <button key={t.id} onClick={() => onTabChange(t.id)} className={\`flex flex-col items-center p-2 rounded-xl transition w-full \${activeTab === t.id ? 'text-orange-500 bg-orange-50' : 'text-gray-400'}\`}>
                                {t.icon}
                                <span className="text-[10px] font-bold mt-1">{t.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>
            );
        }

        function SchoolConfigView({ addToast }) {
            const [config, setConfig] = useState([]);
            const [type, setType] = useState('class');
            const [val, setVal] = useState('');

            useEffect(() => { load(); }, []);
            const load = () => apiFetch('/api/config/get').then(r=>r.json()).then(d => { if(Array.isArray(d)) setConfig(d); });

            const add = async (e) => {
                e.preventDefault();
                await apiFetch('/api/config/add', {method:'POST', body:JSON.stringify({type, value: val})});
                setVal(''); load();
                addToast(\`Added \${type}\`);
            };

            const del = async (id) => {
                if(!confirm('Delete?')) return;
                await apiFetch('/api/config/delete', {method:'POST', body:JSON.stringify({id})});
                load();
            };

            return (
                <div className="grid md:grid-cols-2 gap-8 anim-enter">
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <h3 className="font-bold text-lg mb-4">Add Class/Section</h3>
                        <form onSubmit={add} className="flex gap-2 mb-6">
                            <select value={type} onChange={e=>setType(e.target.value)} className="bg-gray-50 rounded-xl px-3 font-bold text-sm">
                                <option value="class">Class</option>
                                <option value="section">Section</option>
                            </select>
                            <input value={val} onChange={e=>setVal(e.target.value)} className="flex-1 bg-gray-50 p-3 rounded-xl font-bold text-sm outline-none" placeholder="Value (e.g. 10 or A)" required />
                            <button className="bg-orange-500 text-white px-4 rounded-xl font-bold">Add</button>
                        </form>
                        <div className="space-y-2">
                            {config.map(c => (
                                <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                                    <span className="font-bold text-sm text-gray-600 capitalize">{c.type}: <span className="text-slate-900">{c.value}</span></span>
                                    <button onClick={()=>del(c.id)} className="text-red-400 hover:text-red-600"><Icons.Trash/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        function AdminView({ user, onLogout, addToast }) {
            const [activeTab, setActiveTab] = useState('users');
            const [userType, setUserType] = useState('teachers'); 
            const [list, setList] = useState([]);
            const [examList, setExamList] = useState([]); 
            const [viewStatsId, setViewStatsId] = useState(null); 
            const [loading, setLoading] = useState(false);

            useEffect(() => {
                if(activeTab === 'users') fetchList();
                if(activeTab === 'exams') fetchExams(); 
            }, [activeTab, userType]);

            const fetchList = () => {
                setLoading(true);
                const endpoint = userType === 'teachers' ? '/api/admin/teachers' : '/api/students/list';
                apiFetch(endpoint).then(r=>r.json()).then(d => {
                    setList(Array.isArray(d) ? d : []);
                    setLoading(false);
                }).catch(() => setLoading(false));
            }

            const fetchExams = () => {
                setLoading(true);
                apiFetch('/api/admin/exams').then(r=>r.json()).then(d => {
                    setExamList(Array.isArray(d) ? d : []);
                    setLoading(false);
                }).catch(() => setLoading(false));
            }

            const deleteUser = async (id, name) => {
                if(!confirm(\`Delete \${name}?\`)) return;
                const endpoint = userType === 'teachers' ? '/api/admin/teacher/delete' : '/api/admin/student/delete';
                await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({id}) });
                addToast(\`\${name} Deleted\`);
                fetchList();
            };

            const handleReset = async () => {
                if(!confirm("⚠️ FACTORY RESET: Delete EVERYTHING?")) return;
                await apiFetch('/api/system/reset', { method: 'POST' });
                addToast("System Reset");
                setTimeout(() => {
                    localStorage.removeItem('mc_user');
                    window.location.reload();
                }, 1000);
            };

            const addTeacher = async (e) => {
                e.preventDefault();
                const res = await apiFetch('/api/admin/teachers', { method: 'POST', body: JSON.stringify({ name: e.target.name.value, username: e.target.username.value, password: e.target.password.value }) });
                if(res.ok) { addToast("Teacher Added"); e.target.reset(); fetchList(); }
                else addToast("Failed", 'error');
            };

            if (viewStatsId) {
                 return (
                    <DashboardLayout user={user} onLogout={onLogout} title="Exam Analytics" activeTab={activeTab} onTabChange={(t) => { setViewStatsId(null); setActiveTab(t); }} action={<button onClick={()=>setViewStatsId(null)} className="text-gray-500 font-bold">← Back</button>}>
                        <ExamStats examId={viewStatsId} />
                    </DashboardLayout>
                 );
            }

            return (
                <DashboardLayout user={user} onLogout={onLogout} title="Admin" activeTab={activeTab} onTabChange={setActiveTab} onRefresh={activeTab === 'exams' ? fetchExams : fetchList}>
                    {activeTab === 'users' && (
                        <div className="anim-enter space-y-6">
                            <div className="flex bg-white p-1 rounded-xl w-fit border border-gray-100 shadow-sm">
                                <button onClick={()=>setUserType('teachers')} className={\`px-6 py-2 rounded-lg text-sm font-bold transition \${userType==='teachers'?'bg-indigo-50 text-indigo-600':'text-gray-400 hover:bg-gray-50'}\`}>Teachers</button>
                                <button onClick={()=>setUserType('students')} className={\`px-6 py-2 rounded-lg text-sm font-bold transition \${userType==='students'?'bg-orange-50 text-orange-600':'text-gray-400 hover:bg-gray-50'}\`}>Students</button>
                            </div>
                            {userType === 'teachers' && (
                                <form onSubmit={addTeacher} className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                    <input name="name" placeholder="Name" className="border p-3 rounded-xl font-bold text-sm flex-1 bg-gray-50 outline-none" required />
                                    <input name="username" placeholder="Username" className="border p-3 rounded-xl font-bold text-sm flex-1 bg-gray-50 outline-none" required />
                                    <input name="password" placeholder="Password" className="border p-3 rounded-xl font-bold text-sm flex-1 bg-gray-50 outline-none" required />
                                    <button className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold">Add</button>
                                </form>
                            )}
                            <div className="space-y-3">
                                {loading ? <div className="text-center"><Icons.Loading/></div> : list.map(u => (
                                    <div key={u.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className={\`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white \${userType==='teachers'?'bg-indigo-400':'bg-orange-400'}\`}>{u.name[0]}</div>
                                            <div>
                                                <div className="font-bold text-slate-800">{u.name}</div>
                                                <div className="text-xs text-gray-400 font-mono">{u.username || u.school_id}</div>
                                                {u.class && <div className="text-xs text-gray-500 font-bold mt-1">Class: {u.class} - {u.section}</div>}
                                            </div>
                                        </div>
                                        <button onClick={()=>deleteUser(u.id, u.name)} className="text-gray-300 hover:text-red-500"><Icons.Trash /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'exams' && (
                        <div className="anim-enter space-y-4">
                             {loading && <div className="text-center py-10 text-gray-400 font-bold animate-pulse">Loading Exams...</div>}
                             {!loading && examList.length === 0 && <div className="text-center py-10 text-gray-400 font-bold">No exams found in the system.</div>}
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                 {examList.map(e => (
                                     <div key={e.id} onClick={()=>setViewStatsId(e.id)} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition active:scale-95 group">
                                         <div className="flex justify-between items-start mb-2">
                                             <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{e.title}</h3>
                                             <div className={\`w-2 h-2 rounded-full \${e.is_active ? 'bg-green-500' : 'bg-red-300'}\`}></div>
                                         </div>
                                         <div className="text-xs text-gray-500 font-bold mb-4">
                                             Created by: <span className="text-indigo-600">{e.teacher_name || 'Unknown Teacher'}</span>
                                         </div>
                                         <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                                             <span className="text-[10px] text-gray-400 font-bold">{new Date(e.created_at).toLocaleDateString()}</span>
                                             <button className="bg-blue-50 text-blue-600 p-2 rounded-xl group-hover:bg-blue-100 transition"><Icons.Chart /></button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    )}

                    {activeTab === 'school' && <SchoolConfigView addToast={addToast} />}
                    {activeTab === 'settings' && <div className="anim-enter bg-red-50 p-8 rounded-xl"><button onClick={handleReset} className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold">Factory Reset</button></div>}
                </DashboardLayout>
            );
        }

        function TeacherView({ user, onLogout, addToast }) {
            const [tab, setTab] = useState('exams');
            const [mode, setMode] = useState('list');
            const [exams, setExams] = useState([]);
            const [loading, setLoading] = useState(false); 
            const [editId, setEditId] = useState(null);
            const [statId, setStatId] = useState(null);

            useEffect(() => { loadExams(); }, []);
            
            const loadExams = () => {
                setLoading(true);
                apiFetch(\`/api/teacher/exams?teacher_id=\${user.id}\`)
                    .then(r=>r.json())
                    .then(d=>{
                        setExams(Array.isArray(d)?d:[]);
                        setLoading(false);
                    })
                    .catch(() => setLoading(false));
            };

            useEffect(() => {
                const handlePop = () => {
                    setMode('list'); setEditId(null); setStatId(null);
                };
                window.addEventListener('popstate', handlePop);
                return () => window.removeEventListener('popstate', handlePop);
            }, []);

            const navigateTo = (newMode, id=null) => {
                window.history.pushState({ mode: newMode }, '');
                if(newMode === 'create') setEditId(id);
                if(newMode === 'stats') setStatId(id);
                setMode(newMode);
            };

            const handleTabChange = (newTab) => {
                setTab(newTab);
                if(mode !== 'list') setMode('list');
            };

            const toggle = async (id, isActive) => { await apiFetch('/api/exam/toggle', {method:'POST', body:JSON.stringify({id, is_active:!isActive})}); loadExams(); };
            const del = async (id) => { if(!confirm("Delete?")) return; await apiFetch('/api/exam/delete', {method:'POST', body:JSON.stringify({id})}); loadExams(); };

            if (mode === 'create') return <ExamEditor user={user} examId={editId} onCancel={() => window.history.back()} onFinish={() => { window.history.back(); loadExams(); addToast("Exam Saved!"); }} addToast={addToast} />;
            
            if (mode === 'stats') return <DashboardLayout user={user} onLogout={onLogout} title="Analytics" activeTab={tab} onTabChange={handleTabChange} action={<button onClick={()=>window.history.back()} className="text-gray-500 font-bold">← Back</button>} onRefresh={loadExams}><ExamStats examId={statId} /></DashboardLayout>;

            return (
                <DashboardLayout user={user} onLogout={onLogout} title={tab==='exams'?'My Exams':'Students'} activeTab={tab} onTabChange={handleTabChange} onRefresh={loadExams}
                    action={tab === 'exams' && <button onClick={() => navigateTo('create')} className="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg shadow-orange-200 btn-bounce flex items-center gap-2"><Icons.Plus /> <span className="hidden sm:inline">New Exam</span></button>}
                >
                    {tab === 'exams' && (
                        <>
                            {loading && <div className="text-center py-10 text-gray-400 font-bold animate-pulse">Loading Exams...</div>}
                            {!loading && exams.length === 0 && <div className="text-center py-10 text-gray-400 font-bold">No exams created yet. Tap "New Exam" to start!</div>}
                            
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 w-full anim-enter pb-20">
                                {exams.map(e => (
                                    <div key={e.id} className="bg-white p-5 rounded-3xl shadow-sm border border-orange-100 relative group overflow-hidden">
                                        <div className={\`absolute top-0 left-0 w-2 h-full \${e.is_active ? 'bg-green-400' : 'bg-gray-300'}\`}></div>
                                        <div className="pl-4">
                                            <div className="flex justify-between items-start mb-2"><h3 className="font-bold text-lg text-slate-800 line-clamp-1">{e.title}</h3><button onClick={()=>del(e.id)} className="text-gray-300 hover:text-red-500"><Icons.Trash/></button></div>
                                            <div className="flex justify-between items-center mt-4"><Toggle checked={!!e.is_active} onChange={()=>toggle(e.id, e.is_active)} /><div className="flex gap-2"><button onClick={() => navigateTo('create', e.id)} className="bg-orange-50 text-orange-600 p-2 rounded-xl"><Icons.Edit /></button><button onClick={() => navigateTo('stats', e.id)} className="bg-blue-50 text-blue-600 p-2 rounded-xl"><Icons.Chart /></button></div></div>
                                            <button onClick={() => { navigator.clipboard.writeText(\`\${window.location.origin}/?exam=\${e.link_id}\`); addToast("Link Copied!"); }} className="w-full mt-4 bg-gray-50 text-gray-600 text-xs font-bold py-2 rounded-xl hover:bg-gray-100">Copy Link</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {tab === 'students' && <StudentList />}
                </DashboardLayout>
            );
        }

        function StudentList() {
            const [list, setList] = useState([]);
            const [config, setConfig] = useState([]);
            const [filterClass, setFilterClass] = useState('');
            const [filterSec, setFilterSec] = useState('');
            const [search, setSearch] = useState('');

            useEffect(() => { 
                apiFetch('/api/students/list').then(r=>r.json()).then(d=>setList(Array.isArray(d)?d:[]));
                apiFetch('/api/config/get').then(r=>r.json()).then(d => { if(Array.isArray(d)) setConfig(d); });
            }, []);

            const classes = Array.isArray(config) ? [...new Set(config.filter(c=>c.type==='class').map(c=>c.value))] : [];
            const sections = Array.isArray(config) ? [...new Set(config.filter(c=>c.type==='section').map(c=>c.value))] : [];

            const filtered = list.filter(s => {
                const sName = s.name || "";
                const sId = s.school_id || "";
                
                if(filterClass && s.class !== filterClass) return false;
                if(filterSec && s.section !== filterSec) return false;
                if(search && !sName.toLowerCase().includes(search.toLowerCase()) && !sId.includes(search)) return false;
                return true;
            });

            return (
                <div className="space-y-4 pb-20">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Name or ID..." className="bg-gray-50 p-3 rounded-xl font-bold text-sm flex-1 outline-none focus:ring-2 focus:ring-indigo-100" />
                        <div className="flex gap-2">
                            <select value={filterClass} onChange={e=>setFilterClass(e.target.value)} className="bg-gray-50 p-3 rounded-xl font-bold text-sm outline-none"><option value="">All Classes</option>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select>
                            <select value={filterSec} onChange={e=>setFilterSec(e.target.value)} className="bg-gray-50 p-3 rounded-xl font-bold text-sm outline-none"><option value="">All Sections</option>{sections.map(s=><option key={s} value={s}>{s}</option>)}</select>
                        </div>
                    </div>
                    <div className="grid gap-3">
                        {filtered.map(s=><div key={s.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                            <div>
                                <div className="font-bold">{s.name}</div><div className="text-xs text-gray-400">{s.school_id}</div><div className="text-xs font-bold text-indigo-500 mt-1">{s.class ? \`Class \${s.class}\` : 'No Class'} {s.section && \` - \${s.section}\`}</div></div>
                            <div className="font-bold text-green-500">{Math.round(s.avg_score||0)}%</div>
                        </div>)}
                        {filtered.length === 0 && <div className="text-center text-gray-400 py-10">No students found</div>}
                    </div>
                </div>
            );
        }

        function ExamStats({ examId }) {
            const [data, setData] = useState([]);
            const [selectedStudent, setSelectedStudent] = useState(null); 
            const [viewDetail, setViewDetail] = useState(null); 
            const [loading, setLoading] = useState(true);
            
            useEffect(() => { 
                apiFetch(\`/api/analytics/exam?exam_id=\${examId}\`)
                    .then(r=>r.json())
                    .then(d=>{ setData(Array.isArray(d)?d:[]); setLoading(false); })
                    .catch(()=>setLoading(false));
            }, [examId]);

            const studentGroups = useMemo(() => {
                const groups = {};
                data.forEach(r => {
                    if (!groups[r.student_db_id]) {
                        groups[r.student_db_id] = {
                            id: r.student_db_id,
                            name: r.name,
                            roll: r.roll,
                            class: r.class,
                            section: r.section,
                            attempts: []
                        };
                    }
                    groups[r.student_db_id].attempts.push(r);
                });
                return Object.values(groups);
            }, [data]);

            if(viewDetail) return <ResultDetailView result={viewDetail} onClose={()=>setViewDetail(null)} />;

            if(loading) return <div className="text-center py-10 text-gray-400 font-bold"><Icons.Loading/> Loading results...</div>;

            if(selectedStudent) {
                return (
                    <div className="space-y-4 pb-24 anim-enter">
                        <button onClick={()=>setSelectedStudent(null)} className="flex items-center gap-2 text-gray-500 font-bold mb-2"><Icons.Back/> Back to All Students</button>
                        
                        <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 mb-4">
                            <h3 className="font-bold text-lg text-indigo-900">{selectedStudent.name}</h3>
                            <p className="text-xs text-indigo-600 font-bold">Roll: {selectedStudent.roll || 'N/A'} • {selectedStudent.attempts.length} Attempts</p>
                        </div>

                        <div className="space-y-3">
                            {selectedStudent.attempts.map((r, i) => (
                                <div key={r.id} onClick={()=>setViewDetail(r)} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center cursor-pointer active:scale-95 transition hover:shadow-md">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-gray-500">#{selectedStudent.attempts.length - i}</div>
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{new Date(r.timestamp).toLocaleString()}</div>
                                            <div className="text-xs text-gray-400">Score: {r.score}/{r.total}</div>
                                        </div>
                                    </div>
                                    <div className={\`px-3 py-1 rounded-lg font-bold text-sm \${ (r.score/r.total) >= 0.6 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600' }\`}>
                                        {Math.round((r.score/r.total)*100)}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            }

            return (
                <div className="space-y-3 pb-24">
                    {studentGroups.length === 0 && <div className="text-center py-10 text-gray-400">No attempts yet.</div>}
                    {studentGroups.map(group=>(
                        <div key={group.id} onClick={()=>setSelectedStudent(group)} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center cursor-pointer active:scale-95 transition hover:shadow-sm">
                            <div>
                                <div className="font-bold text-slate-800">{group.name} {group.roll && <span className="text-gray-400 font-normal text-xs ml-1">(Roll: {group.roll})</span>}</div>
                                <div className="text-xs text-gray-500 mt-1">{group.class && \`Class \${group.class}\`} {group.section && \`- \${group.section}\`} • <span className="text-indigo-500 font-bold">{group.attempts.length} Tries</span></div>
                            </div>
                            <Icons.Back className="rotate-180 w-5 h-5 text-gray-300" />
                        </div>
                    ))}
                </div>
            );
        }

        function ExamEditor({ user, examId, onCancel, onFinish, addToast }) {
            const [meta, setMeta] = useState({ title: '', timerMode: 'question', timerValue: 30, allowBack: false, allowRetakes: false });
            const [qs, setQs] = useState([]);
            const [activeQ, setActiveQ] = useState(null); 
            const [submitting, setSubmitting] = useState(false);

            useEffect(() => {
                if (examId) apiFetch(\`/api/teacher/exam-details?id=\${examId}\`).then(r => r.json()).then(data => {
                    setMeta({ ...meta, ...JSON.parse(data.exam.settings || '{}'), title: data.exam.title });
                    // FIX: Assign unique tempId to loaded questions to prevent "update all" bug
                    setQs(data.questions.map((q, i) => ({ 
                        ...q, 
                        choices: JSON.parse(q.choices),
                        tempId: Date.now() + i 
                    })));
                });
            }, [examId]);

            const saveQ = (q) => {
                if (!q.text || !q.choices.some(c => c.isCorrect)) return addToast("Incomplete Question", 'error');
                setQs(prev => {
                    const exists = prev.find(x => x.tempId === q.tempId);
                    if(exists) return prev.map(x => x.tempId === q.tempId ? q : x);
                    return [...prev, { ...q, tempId: Date.now() }];
                });
                setActiveQ(null);
            };

            const publish = async () => {
                if (submitting) return; 
                if (!meta.title || qs.length === 0) return addToast("Needs title & questions", 'error');
                setSubmitting(true);
                try {
                    const res = await apiFetch('/api/exam/save', { method: 'POST', body: JSON.stringify({ id: examId, title: meta.title, teacher_id: user.id, settings: meta }) });
                    const data = await res.json();
                    for (let q of qs) {
                        const fd = new FormData();
                        fd.append('exam_id', data.id);
                        fd.append('text', q.text);
                        fd.append('choices', JSON.stringify(q.choices));
                        
                        if (q.image === null && q.image_key === null) {
                        } else if (q.image instanceof File) {
                           fd.append('image', q.image);
                        } else if (q.image_key) {
                           fd.append('existing_image_key', q.image_key);
                        }

                        await apiFetch('/api/question/add', { method: 'POST', body: fd });
                    }
                    onFinish();
                } catch(e) { addToast("Error Saving", 'error'); } 
                finally { setSubmitting(false); }
            };

            const downloadTemplate = () => {
                const example = [
                    { 
                        "text": "What is the capital of France?", 
                        "choices": [ 
                            {"text": "Berlin", "isCorrect": false}, 
                            {"text": "Madrid", "isCorrect": false},
                            {"text": "Paris", "isCorrect": true},
                            {"text": "Rome", "isCorrect": false}
                        ] 
                    },
                    {
                        "text": "What is 2 + 2?",
                        "choices": [
                            {"text": "3", "isCorrect": false},
                            {"text": "4", "isCorrect": true},
                            {"text": "5", "isCorrect": false},
                            {"text": "6", "isCorrect": false}
                        ]
                    }
                ];
                const blob = new Blob([JSON.stringify(example, null, 2)], {type: "application/json"});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = "exam_example.json";
                a.click();
            };

            const handleJsonImport = (e) => {
                 const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        if (!Array.isArray(json)) throw new Error("Root must be an array");
                        const newQs = json.map(q => ({
                            text: q.text || "Untitled Question",
                            choices: Array.isArray(q.choices) ? q.choices.map((c, i) => ({ id: Date.now() + Math.random() + i, text: c.text || "", isCorrect: !!c.isCorrect })) : [],
                            tempId: Date.now() + Math.random()
                        }));
                        setQs(prev => [...prev, ...newQs]);
                        addToast(\`Imported \${newQs.length} questions\`);
                    } catch (err) { addToast("Invalid JSON Format", 'error'); }
                };
                reader.readAsText(file);
                e.target.value = null;
            };

            return (
                <div className="min-h-screen bg-white md:bg-gray-50 flex flex-col">
                    <div className="sticky top-0 bg-white border-b border-orange-100 p-4 flex justify-between items-center z-40">
                        <button onClick={onCancel} disabled={submitting} className="text-gray-400 font-bold"><Icons.Back /></button>
                        <h2 className="font-bold text-lg">{examId ? 'Edit Exam' : 'New Class Exam'}</h2>
                        <button onClick={publish} disabled={submitting} className="text-orange-600 font-bold text-sm flex items-center gap-2">{submitting && <Icons.Loading />}{submitting ? 'Saving...' : 'Save'}</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
                        <div className="bg-white md:rounded-3xl md:p-6 md:shadow-sm space-y-6">
                            <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Title</label><input value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} className="w-full text-2xl font-bold border-b-2 border-gray-100 focus:border-orange-400 outline-none placeholder-gray-200" placeholder="e.g. Science Quiz" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 p-3 rounded-2xl"><label className="text-xs font-bold text-gray-400 uppercase">Timer</label><div className="flex gap-2 mt-1"><select value={meta.timerMode} onChange={e => setMeta({ ...meta, timerMode: e.target.value })} className="bg-transparent font-bold text-sm outline-none"><option value="question">Per Q</option><option value="total">Total</option></select><input type="number" value={meta.timerValue} onChange={e => setMeta({ ...meta, timerValue: e.target.value })} className="w-12 bg-white rounded-lg text-center font-bold text-sm" /></div></div>
                                <div className="bg-gray-50 p-3 rounded-2xl flex items-center justify-between"><span className="text-xs font-bold text-gray-400 uppercase">Back Nav</span><Toggle checked={meta.allowBack} onChange={v => setMeta({ ...meta, allowBack: v })} /></div>
                            </div>
                            <div>
                                <div className="flex gap-2 mb-4"><label className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer hover:bg-indigo-100 transition"><Icons.Upload /> Import JSON<input type="file" className="hidden" accept=".json" onChange={handleJsonImport} /></label><button onClick={downloadTemplate} className="flex items-center gap-2 bg-gray-50 text-gray-500 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-100 transition"><Icons.Download /> Example</button></div>
                                <div className="space-y-3 mb-20">{qs.map((q, i) => (<div key={i} onClick={() => setActiveQ(q)} className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm flex items-center gap-4 active:scale-95 transition cursor-pointer"><span className="font-bold text-orange-400 bg-orange-50 w-8 h-8 flex items-center justify-center rounded-full text-xs">{i + 1}</span>{/* FIX: Show icon if existing key OR new file exists */}{(q.image_key || q.image) && <Icons.Image />}<div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{q.text}</p><p className="text-xs text-gray-400">{q.choices.length} options</p></div><button onClick={(e) => { e.stopPropagation(); setQs(qs.filter(x => x !== q)); }} className="text-red-300"><Icons.Trash /></button></div>))}
                                    <button onClick={() => setActiveQ({ text: '', choices: [{ id: 1, text: '', isCorrect: false }, { id: 2, text: '', isCorrect: false }], tempId: Date.now() })} className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold text-sm hover:border-orange-300 hover:text-orange-500 transition">+ Add Question</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    {activeQ && (
                        <div className="fixed inset-0 bg-white z-50 flex flex-col anim-enter">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50"><button onClick={() => setActiveQ(null)} className="font-bold text-gray-500">Cancel</button><span className="font-bold">Edit Question</span><button onClick={() => saveQ(activeQ)} className="font-bold text-green-600 bg-green-50 px-4 py-1 rounded-lg">Done</button></div>
                            <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
                                <textarea value={activeQ.text} onChange={e => setActiveQ({ ...activeQ, text: e.target.value })} className="w-full text-xl font-bold outline-none resize-none placeholder-gray-300 mb-6" placeholder="Type question here..." rows="3" autoFocus />
                                <div className="mb-6"><label className="block w-full"><div className="w-full h-40 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-100 relative overflow-hidden">{activeQ.image ? (activeQ.image instanceof File ? <img src={URL.createObjectURL(activeQ.image)} className="h-full w-full object-contain" /> : <div className="text-center"><img src="https://placehold.co/100x100?text=Existing" className="h-20 w-auto opacity-50 mx-auto" /><span className="text-xs font-bold text-green-500 block mt-2">Image Attached</span></div>) : activeQ.image_key ? (<div className="text-center"><img src={\`/img/\${activeQ.image_key}\`} className="h-32 object-contain mx-auto" /></div>) : (<><Icons.Image /><span className="text-xs font-bold mt-2">Add Photo</span></>)}
                                {activeQ.image instanceof File && (<div className="absolute bottom-0 left-0 w-full bg-black/50 text-white text-xs p-2 text-center backdrop-blur-sm">{activeQ.image.name} ({(activeQ.image.size/1024).toFixed(1)} KB)</div>)}</div><input type="file" className="hidden" accept="image/*" onChange={e => {if(e.target.files[0]) { setActiveQ({ ...activeQ, image: e.target.files[0] }); }}} /></label>{(activeQ.image || activeQ.image_key) && (<button onClick={()=>setActiveQ({...activeQ, image: null, image_key: null})} className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1 justify-center"><Icons.Trash/> Remove Image</button>)}</div>
                                <div className="space-y-3">{activeQ.choices.map((c, i) => (<div key={c.id} className="flex items-center gap-3"><div onClick={() => setActiveQ({ ...activeQ, choices: activeQ.choices.map(x => ({ ...x, isCorrect: x.id === c.id })) })} className={\`w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-pointer transition \${c.isCorrect ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}\`}>{c.isCorrect && <span className="font-bold text-sm">✓</span>}</div><input value={c.text} onChange={e => setActiveQ({ ...activeQ, choices: activeQ.choices.map(x => x.id === c.id ? { ...x, text: e.target.value } : x) })} className="flex-1 bg-gray-50 p-3 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-200" placeholder={\`Option \${i + 1}\`} /><button onClick={() => setActiveQ({ ...activeQ, choices: activeQ.choices.filter(x => x.id !== c.id) })} className="text-gray-300 px-2">×</button></div>))}<button onClick={() => setActiveQ({ ...activeQ, choices: [...activeQ.choices, { id: Date.now(), text: '', isCorrect: false }] })} className="text-sm font-bold text-blue-500 mt-2 ml-11">+ Add Option</button></div>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // 5. STUDENT EXAM APP (With Dropdowns & Validation)
        function StudentExamApp({ linkId }) {
            const [mode, setMode] = useState('identify');
            const [student, setStudent] = useState({ name: '', school_id: '', roll: '', class: '', section: '' });
            const [exam, setExam] = useState(null);
            const [config, setConfig] = useState({ classes: [], sections: [] });
            
            // Game State
            const [qIdx, setQIdx] = useState(0); 
            const [score, setScore] = useState(0); 
            const [answers, setAnswers] = useState({});
            const [resultDetails, setResultDetails] = useState([]);
            const [examHistory, setExamHistory] = useState([]);
            const [qTime, setQTime] = useState(0);
            const [totalTime, setTotalTime] = useState(0);
            const [showReview, setShowReview] = useState(false); // New state for review toggle
            const hasSubmittedRef = useRef(false);
            const [isSubmitting, setIsSubmitting] = useState(false);

            const normalizeStudent = (data) => ({
                school_id: (data.school_id || '').trim(),
                name: (data.name || '').trim(),
                roll: (data.roll || '').trim(),
                class: (data.class || '').trim(),
                section: (data.section || '').trim(),
            });

            const isProfileComplete = (data) =>
                data.school_id && data.name && data.roll && data.class && data.section;

            useEffect(() => { 
                // FIX: Escaped backticks for fetching exams to prevent build error
                fetch(\`/api/exam/get?link_id=\${linkId}\`).then(r=>r.json()).then(d => {
                    if(!d.exam?.is_active) return alert("Exam Closed");
                    setExam(d);
                    const classes = [...new Set(d.config.filter(c=>c.type==='class').map(c=>c.value))];
                    const sections = [...new Set(d.config.filter(c=>c.type==='section').map(c=>c.value))];
                    setConfig({ classes, sections });
                }); 
            }, [linkId]);

            // Timer Tick
            useEffect(() => {
                if(mode !== 'game' || !exam) return;
                const settings = JSON.parse(exam.exam.settings || '{}');
                const int = setInterval(() => {
                    if(settings.timerMode === 'question') {
                        if(qTime > 0) setQTime(t => t - 1);
                        else next(); 
                    } else if(settings.timerMode === 'total') {
                        if(totalTime > 0) setTotalTime(t => t - 1);
                        else finish(); 
                    }
                }, 1000);
                return () => clearInterval(int);
            }, [mode, qTime, totalTime, exam]);

            const next = () => { 
                if(qIdx < exam.questions.length - 1) { 
                    setQIdx(qIdx+1); 
                    const s = JSON.parse(exam.exam.settings || '{}');
                    if(s.timerMode === 'question') setQTime(s.timerValue || 30);
                } else finish(); 
            };

            const finish = async () => {
                if (hasSubmittedRef.current || isSubmitting) return;

                const normalizedStudent = normalizeStudent(student);
                setStudent(normalizedStudent);

                if (!isProfileComplete(normalizedStudent)) {
                    alert("Please complete your name, roll, class, and section before submitting.");
                    setMode('register');
                    return;
                }

                hasSubmittedRef.current = true;
                setIsSubmitting(true);

                const finalAnswers = {};
                exam.questions.forEach(q => {
                    finalAnswers[q.id] = answers[q.id];
                });

                localStorage.setItem('student_id', normalizedStudent.school_id);

                // Security: Send raw answers to backend, let backend calculate score
                const res = await fetch('/api/submit', {
                    method: 'POST',
                    body: JSON.stringify({
                        link_id: linkId,
                        student: normalizedStudent,
                        answers: finalAnswers // Only sending IDs of selected choices
                    })
                });

                if(!res.ok) {
                    hasSubmittedRef.current = false;
                    setIsSubmitting(false);
                    return alert("Error Saving Result! Please try again or contact teacher.");
                }

                const data = await res.json();

                // Update local state with server results
                setScore(data.score);
                setResultDetails(data.details);

                if (typeof confetti === 'function') {
                    const celebratoryCount = (data.score/data.total) > 0.6 ? 160 : 90;
                    confetti({ particleCount: celebratoryCount, spread: 70, origin: { y: 0.6 } });
                }

                const histRes = await fetch('/api/student/portal-history', { method: 'POST', body: JSON.stringify({ school_id: normalizedStudent.school_id }) }).then(r => r.json());
                if (histRes.found) setExamHistory(histRes.history.filter(h => h.exam_id === exam.exam.id));
                setMode('summary');
                setIsSubmitting(false);
            };

            const startGame = (profile) => {
                 // FIX: Prevent crash if exam has no questions
                 if (!exam.questions || exam.questions.length === 0) {
                     return alert("This exam has no questions added yet. Please contact the teacher.");
                 }

                 const normalizedStudent = normalizeStudent(profile || student);
                 setStudent(normalizedStudent);
                 if (!isProfileComplete(normalizedStudent)) {
                     setMode('register');
                     return alert("Please complete your name, roll number, class, and section to start.");
                 }

                 hasSubmittedRef.current = false;
                 setIsSubmitting(false);
                 setMode('game');
                 const settings = JSON.parse(exam.exam.settings || '{}');
                 if(settings.timerMode==='total') setTotalTime((settings.timerValue||10)*60);
                 if(settings.timerMode==='question') setQTime(settings.timerValue||30);
            };

            if(!exam) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-400">Loading Exam...</div>;
            const settings = JSON.parse(exam.exam.settings || '{}');

            if(mode === 'dashboard') return <StudentPortal onBack={() => setMode('identify')} />;

            if(mode === 'identify') return (
                <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 flex items-center justify-center p-6 overflow-hidden relative">
                    <div className="absolute -left-16 -top-10 w-48 h-48 bg-orange-100 rounded-full blur-3xl opacity-70"></div>
                    <div className="absolute -right-10 bottom-0 w-40 h-40 bg-indigo-100 rounded-full blur-3xl opacity-70"></div>
                    <div className="bg-white/90 backdrop-blur-xl w-full max-w-sm p-8 rounded-3xl text-center anim-pop shadow-2xl border border-orange-50 relative z-10">
                        <p className="text-xs font-bold text-orange-500 mb-3">Step 1 of 2: Enter your School ID</p>
                        <input className="w-full bg-gray-100 p-4 rounded-xl font-bold mb-3 outline-none focus:ring-2 focus:ring-orange-300" placeholder="School ID" value={student.school_id} onChange={e=>setStudent({...student, school_id:e.target.value})} />
                            <button onClick={async()=>{
                                const trimmedId = (student.school_id || '').trim();
                                if(!trimmedId) return alert("Enter ID");
                                const r = await fetch('/api/student/identify', {method:'POST', body:JSON.stringify({school_id:trimmedId})}).then(x=>x.json());
                                const merged = normalizeStudent({ ...student, school_id: trimmedId, ...(r.found ? r.student : {}) });
                                setStudent(merged);
                                if (isProfileComplete(merged)) {
                                    startGame(merged);
                                } else {
                                    setMode('register');
                                }
                        }} className="w-full bg-gradient-to-r from-orange-500 to-indigo-500 text-white p-4 rounded-xl font-bold shadow-lg shadow-orange-200">Continue</button>

                        {/* FIX: Added Dashboard Login Option */}
                        <div className="mt-6 border-t border-gray-100 pt-4">
                            <p className="text-xs text-gray-400 font-bold mb-2">Want to check results?</p>
                            <button onClick={() => setMode('dashboard')} className="text-indigo-500 font-bold text-sm hover:underline">Login to Student Dashboard</button>
                        </div>
                    </div>
                </div>
            );

            if(mode === 'register' || mode === 'update_profile') return (
                <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 flex items-center justify-center p-6 overflow-hidden relative">
                    <div className="absolute -left-10 top-10 w-36 h-36 bg-orange-100 rounded-full blur-3xl opacity-70"></div>
                    <div className="absolute right-0 -bottom-10 w-48 h-48 bg-indigo-100 rounded-full blur-3xl opacity-70"></div>
                    <div className="bg-white/90 backdrop-blur-xl w-full max-w-sm p-8 rounded-3xl anim-pop shadow-2xl border border-orange-50 relative z-10">
                        <h1 className="text-xl font-bold mb-4 text-slate-800">Step 2: Confirm your info</h1>
                        <p className="text-xs text-gray-500 mb-4 font-bold">We pre-filled what we could. Complete any missing fields to start.</p>

                        <div className="bg-orange-50 p-3 rounded-xl font-bold text-sm text-orange-700 mb-3 flex items-center justify-between">
                            <span>School ID</span>
                            <span className="bg-white text-orange-600 px-3 py-1 rounded-lg shadow-sm">{student.school_id}</span>
                        </div>

                        <input className="w-full bg-gray-100 p-3 rounded-xl font-bold mb-3 outline-none focus:ring-2 focus:ring-orange-300" placeholder="Full Name" value={student.name || ''} onChange={e=>setStudent({...student, name:e.target.value})} />
                        <input className="w-full bg-gray-100 p-3 rounded-xl font-bold mb-3 outline-none focus:ring-2 focus:ring-orange-300" placeholder="Roll No" value={student.roll || ''} onChange={e=>setStudent({...student, roll:e.target.value})} />

                        <div className="flex gap-2 mb-4">
                            <select value={student.class || ''} onChange={e=>setStudent({...student, class:e.target.value})} className="w-full bg-gray-100 p-3 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-300">
                                <option value="">Select Class</option>
                                {config.classes.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                            <select value={student.section || ''} onChange={e=>setStudent({...student, section:e.target.value})} className="w-full bg-gray-100 p-3 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-300">
                                <option value="">Section</option>
                                {config.sections.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <button onClick={()=>{
                            const normalizedStudent = normalizeStudent(student);
                            setStudent(normalizedStudent);
                            if(!isProfileComplete(normalizedStudent)) {
                                return alert("Please fill all fields");
                            }
                            startGame();
                        }} className="w-full bg-gradient-to-r from-orange-500 to-indigo-500 text-white p-3 rounded-xl font-bold shadow-lg shadow-orange-200">Start Exam</button>
                    </div>
                </div>
            );

            if(mode === 'game') {
                // FIX: Add safety check to ensure question exists before rendering
                const currentQuestion = exam.questions[qIdx];
                if (!currentQuestion) {
                    return (
                        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
                            <div>
                                <h1 className="text-xl font-bold text-red-400 mb-2">Error Loading Question</h1>
                                <p className="text-gray-400 mb-4">The question data seems to be missing or invalid.</p>
                                <button onClick={() => window.location.reload()} className="bg-white text-slate-900 px-6 py-2 rounded-xl font-bold">Refresh Page</button>
                            </div>
                        </div>
                    );
                }

                const progress = Math.round(((qIdx + 1) / exam.questions.length) * 100);
                const timeValue = settings.timerMode === 'question' ? qTime : Math.floor(totalTime/60) + ':' + (totalTime%60).toString().padStart(2,'0');
                const isTimerLow = (settings.timerMode==='question'?qTime:totalTime) < 10;
                const choices = JSON.parse(currentQuestion.choices);

                return (
                    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 text-slate-900 flex flex-col p-6 relative overflow-hidden">
                        <div className="absolute -left-10 top-10 w-56 h-56 bg-orange-100 rounded-full blur-3xl opacity-60"></div>
                        <div className="absolute right-0 -top-16 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-60"></div>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,182,119,0.12),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(120,202,255,0.12),transparent_35%)]"></div>

                        <div className="relative z-10 max-w-4xl w-full mx-auto space-y-6 flex-1">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-2xl bg-white shadow-lg shadow-orange-100 flex items-center justify-center text-orange-500"><Icons.Exam /></div>
                                    <div>
                                        <p className="text-xs uppercase font-bold text-orange-500">Question {qIdx+1} of {exam.questions.length}</p>
                                        <p className="text-xl font-black text-slate-800">{exam.exam.title}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="bg-white/80 backdrop-blur-md px-4 py-3 rounded-2xl shadow-md border border-orange-50 text-right">
                                        <p className="text-[10px] uppercase text-gray-400 font-bold">Progress</p>
                                        <p className="text-lg font-black text-slate-800">{progress}%</p>
                                    </div>
                                    <div className={\`\${isTimerLow ? 'bg-red-50 border-red-100 text-red-600 animate-pulse' : 'bg-white/80 border-indigo-50 text-indigo-600'} px-4 py-3 rounded-2xl shadow-md border font-black font-mono\`}>{timeValue}</div>
                                </div>
                            </div>

                            <div className="w-full h-2 bg-white/70 rounded-full shadow-inner overflow-hidden border border-orange-50">
                                <div style={{ width: \`\${progress}%\` }} className="h-full bg-gradient-to-r from-orange-400 via-pink-400 to-indigo-400 rounded-full transition-all"></div>
                            </div>

                            <div className="bg-white/90 backdrop-blur-xl border border-orange-50 rounded-3xl p-6 shadow-xl flex flex-col gap-4">
                                <div className="flex flex-col md:flex-row md:items-center md:gap-6">
                                    {currentQuestion.image_key && (
                                        <div className="md:w-48 md:flex-shrink-0 mb-4 md:mb-0">
                                            <div className="bg-orange-50 rounded-2xl p-3 shadow-inner">
                                                <img src={\`/img/\${currentQuestion.image_key}\`} className="h-40 w-full object-contain rounded-xl" />
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <p className="text-xs uppercase font-bold text-gray-400 mb-1">Question</p>
                                        <h2 className="text-2xl font-black leading-tight text-slate-800">{currentQuestion.text}</h2>
                                        <p className="text-sm text-gray-500 mt-2">Pick the best answer. You can change before moving forward.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {choices.map(c => {
                                        const isActive = answers[currentQuestion.id]===c.id;
                                        return (
                                <button key={c.id} onClick={()=>{ setAnswers({...answers, [currentQuestion.id]:c.id}); if(settings.timerMode==='question') setTimeout(next, 250); }} className={\`\${isActive ? 'bg-gradient-to-r from-orange-100 to-indigo-100 border-orange-200 text-slate-900 shadow-lg shadow-orange-100' : 'bg-white border-gray-100 text-slate-700 hover:-translate-y-1 hover:shadow-md'} p-5 rounded-2xl font-bold text-left transition transform active:scale-95 border shadow-sm\`}>
                                                <div className="flex items-center gap-3">
                                                    <span className={\`\${isActive ? 'bg-white text-orange-500 shadow' : 'bg-gray-100 text-gray-500'} h-8 w-8 rounded-full flex items-center justify-center text-sm font-black\`}>{isActive ? '✓' : String.fromCharCode(65 + choices.findIndex(x => x.id === c.id))}</span>
                                                    <span className="flex-1">{c.text}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {settings.timerMode === 'total' && (
                                    <div className="mt-4 flex justify-end">
                                        <button onClick={next} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:-translate-y-0.5 transition">Next Question</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }

            if(mode === 'summary') return (
                <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 text-slate-900 p-6 overflow-y-auto relative">
                    <div className="absolute -left-10 top-0 w-48 h-48 bg-orange-100 rounded-full blur-3xl opacity-60"></div>
                    <div className="absolute right-0 -bottom-10 w-56 h-56 bg-indigo-100 rounded-full blur-3xl opacity-60"></div>
                    <div className="max-w-3xl mx-auto space-y-6 pb-20 relative z-10">
                        {/* Score Card */}
                        <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl text-center border border-orange-50 shadow-2xl">
                            <h2 className="text-3xl font-black mb-2 text-slate-800">Exam Complete!</h2>
                            <p className="text-gray-500 font-bold mb-6">Great effort, {student.name || 'Scholar'}! Here is your performance snapshot.</p>
                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-6">
                                <div className="bg-green-50 p-4 rounded-2xl border border-green-100 shadow-sm">
                                    <div className="text-3xl font-black text-green-600">{score}</div>
                                    <div className="text-xs font-bold uppercase text-green-500">Correct</div>
                                </div>
                                <div className="bg-red-50 p-4 rounded-2xl border border-red-100 shadow-sm">
                                    <div className="text-3xl font-black text-red-500">{exam.questions.length - score}</div>
                                    <div className="text-xs font-bold uppercase text-red-500">Wrong</div>
                                </div>
                                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 shadow-sm">
                                    <div className="text-3xl font-black text-indigo-600">{Math.round((score/exam.questions.length)*100)}%</div>
                                    <div className="text-xs font-bold uppercase text-indigo-500">Score</div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                             <button onClick={() => setShowReview(!showReview)} className="w-full bg-white/90 backdrop-blur-xl border border-orange-50 p-4 rounded-2xl font-bold flex justify-between items-center shadow-sm hover:shadow-md transition">
                                <span className="text-slate-800">See Correct Answers</span>
                                  <span className={\`\${showReview ? 'rotate-180' : ''} transform transition\`}>▼</span>
                            </button>

                            {/* FIX: Direct switch to Dashboard Mode */}
                            <button onClick={() => setMode('dashboard')} className="w-full bg-gradient-to-r from-orange-500 to-indigo-500 text-white p-4 rounded-2xl font-bold shadow-lg shadow-orange-200 btn-bounce flex items-center justify-center gap-2">
                                <Icons.Users /> See Past Results
                            </button>
                        </div>

                        {/* Detailed Review (Collapsible) */}
                        {showReview && (
                            <div className="space-y-4 anim-enter bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-orange-50 shadow-sm">
                                <h3 className="font-bold text-xl mb-4 text-center">Detailed Review</h3>
                                {resultDetails.map((d, i) => (
                                    <div key={i} className={\`\${d.isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} p-5 rounded-2xl border\`}> 
                                        <div className="font-bold text-lg mb-3 text-slate-800">Q{i+1}. {d.qText}</div>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex items-start gap-2">
                                                <span className="font-bold min-w-[70px] text-gray-500">You picked</span>
                                                <span className={\`\${d.isCorrect ? 'text-green-600' : 'text-red-600'} font-bold\`}>{d.selectedText}</span>
                                            </div>
                                            {!d.isCorrect && (
                                                <div className="flex items-start gap-2">
                                                    <span className="font-bold min-w-[70px] text-gray-500">Correct</span>
                                                    <span className="font-bold text-slate-800">{d.correctText}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {settings.allowRetakes && (<div className="w-full text-center mt-8"><button onClick={() => window.location.reload()} className="text-indigo-600 font-bold hover:text-indigo-500">Retake Exam</button></div>)}
                    </div>
                </div>
            );

        // --- APP ROOT ---
        function App() {
            const [status, setStatus] = useState(null);
            const [user, setUser] = useState(null);
            const [route, setRoute] = useState('landing');
            const [toasts, setToasts] = useState([]);
            const linkId = new URLSearchParams(window.location.search).get('exam');

            // Routing
            useEffect(() => { 
                const checkHash = () => { 
                    const h = window.location.hash.slice(1); 
                    if(h === 'teacher' && user) setRoute('teacher'); 
                    else if(h === 'student') setRoute('student'); 
                    else if(h === 'admin' && user?.role === 'super_admin') setRoute('admin'); 
                    else if(!linkId) setRoute('landing'); 
                }; 
                window.addEventListener('hashchange', checkHash); 
                return () => window.removeEventListener('hashchange', checkHash); 
            }, [user]);

            // Persist User
            useEffect(() => { 
                try { 
                    const u = localStorage.getItem('mc_user'); 
                    if(u) setUser(JSON.parse(u)); 
                } catch(e) {} 
                apiFetch('/api/system/status').then(r=>r.json()).then(setStatus).catch(e=>setStatus({installed:false, hasAdmin:false})); 
            }, []);

            const loginUser = (u) => { setUser(u); localStorage.setItem('mc_user', JSON.stringify(u)); window.location.hash = u.role === 'super_admin' ? 'admin' : 'teacher'; };
            const logoutUser = () => { setUser(null); localStorage.removeItem('mc_user'); window.location.hash = ''; setRoute('landing'); };
            const addToast = (msg, type='success') => { const id = Date.now(); setToasts(p => [...p, {id, msg, type}]); setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000); };

            if(linkId) return <ErrorBoundary><StudentExamApp linkId={linkId} /></ErrorBoundary>;
            if(!status) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-400 animate-pulse">Loading My Class...</div>;
            if(!status.hasAdmin) return <ErrorBoundary><><Setup onComplete={() => setStatus({hasAdmin:true})} addToast={addToast} /><ToastContainer toasts={toasts}/></></ErrorBoundary>;
            if(route === 'student') return <ErrorBoundary><StudentPortal onBack={()=>window.location.hash=''} /></ErrorBoundary>;
            
            if(user) { 
                if(user.role === 'super_admin') return <ErrorBoundary><><AdminView user={user} onLogout={logoutUser} addToast={addToast} /><ToastContainer toasts={toasts}/></></ErrorBoundary>; 
                return <ErrorBoundary><><TeacherView user={user} onLogout={logoutUser} addToast={addToast} /><ToastContainer toasts={toasts}/></></ErrorBoundary>; 
            }
            
            if(route === 'login') return <ErrorBoundary><><Login onLogin={loginUser} addToast={addToast} onBack={()=>setRoute('landing')} /><ToastContainer toasts={toasts}/></></ErrorBoundary>;
            
            return ( 
                <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-6 text-center"> 
                    <div className="w-24 h-24 bg-white rounded-[30px] shadow-xl flex items-center justify-center text-orange-500 mb-6 anim-pop"><Icons.Logo /></div> 
                    <h1 className="text-4xl font-black text-slate-800 mb-2">My Class</h1> 
                    <p className="text-gray-500 font-bold mb-10">Fun Learning & Testing Platform</p> 
                    <div className="w-full max-w-xs space-y-4"> 
                        <button onClick={()=>{window.location.hash='student'; setRoute('student')}} className="w-full bg-indigo-500 text-white p-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 btn-bounce">Student Hub</button> 
                        <button onClick={()=>setRoute('login')} className="w-full bg-white text-slate-700 p-4 rounded-2xl font-bold shadow-sm border border-gray-100 btn-bounce">Teacher Login</button> 
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
