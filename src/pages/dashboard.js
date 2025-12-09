export function getLandingPage() { return buildHtml('landing'); }
export function getStudentPage() { return buildHtml('student'); }
export function getAdminPage() { return buildHtml('login'); }

function getHeadContent() {
  return `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
  </head>`;
}

function buildHtml(initialRoute = 'landing') {
  return `<!DOCTYPE html>
<html lang="en">
${getHeadContent()}
<body class="text-slate-800 antialiased selection:bg-orange-200">
    <div id="root"></div>
    <script>window.__INITIAL_ROUTE__ = ${JSON.stringify(initialRoute)};</script>

    <script type="text/babel">
        const { useState, useEffect, useMemo, Component } = React;

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

        // --- ICONS ---
        const Icons = {
            Logo: () => <svg className="w-8 h-8 text-orange-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>,
            Home: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
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
                        {t.type === 'error' ? <Icons.X /> : <Icons.Check />}
                        <span>{t.msg}</span>
                    </div>
                ))}
            </div>
        );

        // Unified JSON fetch helper for consistent headers & error handling
        const apiFetch = async (url, options = {}) => {
            const opts = { ...options, headers: { ...(options.headers || {}) } };
            if (options.body && !(options.body instanceof FormData)) {
                opts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
            }

            const res = await fetch(url, opts);
            let data = null;
            try { data = await res.json(); } catch (e) {}
            if (!res.ok || (data && data.error)) {
                throw new Error(data?.error || 'Request failed (' + res.status + ')');
            }
            return data;
        };

        const Toggle = ({ checked, onChange }) => (
            <button onClick={() => onChange(!checked)} className={\`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none \${checked ? 'bg-green-400' : 'bg-gray-200'}\`}>
                <span className={\`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform \${checked ? 'translate-x-6' : 'translate-x-1'}\`} />
            </button>
        );

        // --- COMPONENTS ---

        function Setup({ onComplete, addToast }) {
             const handle = async (e) => {
                 e.preventDefault();
                 try {
                    await apiFetch('/api/system/init', { method: 'POST' });
                    await apiFetch('/api/auth/setup-admin', { method: 'POST', body: { name: e.target.name.value, username: e.target.username.value, password: e.target.password.value } });
                    addToast('Setup complete!');
                    onComplete();
                 } catch(err) {
                    addToast(err.message || 'Failed to set up', 'error');
                 }
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
                 try {
                    const data = await apiFetch('/api/auth/login', { method: 'POST', body: { username: e.target.username.value, password: e.target.password.value } });
                    if(data.success) onLogin(data.user);
                    else addToast("Invalid credentials", 'error');
                 } catch(err) {
                    addToast(err.message || 'Login failed', 'error');
                 }
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

        function DashboardLayout({ user, onLogout, title, action, children, activeTab, onTabChange }) {
            const safeUser = user || { name: 'User', role: 'teacher' };
            const initial = (safeUser.name && safeUser.name[0]) ? safeUser.name[0] : 'U';
            
            const tabs = [
                { id: 'exams', icon: <Icons.Exam />, label: 'Exams' },
                ...(safeUser.role === 'teacher' ? [{ id: 'students', icon: <Icons.Users />, label: 'Students' }] : []),
                ...(safeUser.role === 'super_admin' ? [
                    { id: 'users', icon: <Icons.Users />, label: 'Users' },
                    { id: 'school', icon: <Icons.School />, label: 'School Data' },
                    { id: 'settings', icon: <Icons.Setting />, label: 'Settings' }
                ] : []),
            ];

            return (
                <div className="min-h-screen pb-20 md:pb-0 md:pl-20 lg:pl-64">
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
                                <Icons.Home /> <span className="hidden lg:block font-bold text-sm">Logout</span>
                            </button>
                        </div>
                    </aside>
                    <header className="md:hidden sticky top-0 bg-white/90 backdrop-blur-md border-b border-orange-100 p-4 flex justify-between items-center z-20">
                        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
                        <div className="flex gap-2">
                            {action}
                            <button onClick={onLogout} className="bg-orange-100 p-2 rounded-full text-orange-600"><Icons.Home/></button>
                        </div>
                    </header>
                    <header className="hidden md:flex sticky top-0 bg-white/90 backdrop-blur-md border-b border-orange-100 px-8 py-4 justify-between items-center z-20">
                        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
                        {action}
                    </header>
                    <main className="p-4 md:p-8 max-w-7xl mx-auto">
                        {children}
                    </main>
                    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-orange-100 flex justify-around p-2 z-30 pb-safe">
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
            const load = () => apiFetch('/api/config/get').then(d => { if(Array.isArray(d)) setConfig(d); }).catch(() => addToast('Could not load config', 'error'));

            const add = async (e) => {
                e.preventDefault();
                try {
                    await apiFetch('/api/config/add', {method:'POST', body:{type, value: val}});
                    setVal(''); load();
                    addToast(\`Added \${type}\`);
                } catch(err) {
                    addToast(err.message || 'Could not add', 'error');
                }
            };

            const del = async (id) => {
                if(!confirm('Delete?')) return;
                try {
                    await apiFetch('/api/config/delete', {method:'POST', body:{id}});
                    load();
                } catch(err) {
                    addToast(err.message || 'Could not delete', 'error');
                }
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
            const [loading, setLoading] = useState(false);

            useEffect(() => {
                if(activeTab === 'users') fetchList();
            }, [activeTab, userType]);

            const fetchList = () => {
                setLoading(true);
                const endpoint = userType === 'teachers' ? '/api/admin/teachers' : '/api/students/list';
                apiFetch(endpoint)
                    .then(d => setList(Array.isArray(d) ? d : []))
                    .catch(() => addToast('Could not load data', 'error'))
                    .finally(() => setLoading(false));
            }

            const deleteUser = async (id, name) => {
                if(!confirm(\`Delete \${name}?\`)) return;
                const endpoint = userType === 'teachers' ? '/api/admin/teacher/delete' : '/api/admin/student/delete';
                try {
                    await apiFetch(endpoint, { method: 'POST', body: {id} });
                    addToast(\`\${name} Deleted\`);
                    fetchList();
                } catch(err) {
                    addToast(err.message || 'Delete failed', 'error');
                }
            };

            const handleReset = async () => {
                if(!confirm("⚠️ FACTORY RESET: Delete EVERYTHING?")) return;
                try {
                    await apiFetch('/api/system/reset', { method: 'POST' });
                    addToast("System Reset");
                } catch(err) {
                    addToast(err.message || 'Reset failed', 'error');
                }
            };

            const addTeacher = async (e) => {
                e.preventDefault();
                try {
                    await apiFetch('/api/admin/teachers', { method: 'POST', body: { name: e.target.name.value, username: e.target.username.value, password: e.target.password.value } });
                    addToast("Teacher Added");
                    e.target.reset();
                    fetchList();
                } catch(err) {
                    addToast(err.message || 'Failed', 'error');
                }
            };

            return (
                <DashboardLayout user={user} onLogout={onLogout} title="Admin" activeTab={activeTab} onTabChange={setActiveTab}>
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
                    {activeTab === 'school' && <SchoolConfigView addToast={addToast} />}
                    {activeTab === 'settings' && <div className="anim-enter bg-red-50 p-8 rounded-xl"><button onClick={handleReset} className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold">Factory Reset</button></div>}
                </DashboardLayout>
            );
        }

        function TeacherView({ user, onLogout, addToast }) {
            const [tab, setTab] = useState('exams');
            const [mode, setMode] = useState('list');
            const [exams, setExams] = useState([]);
            const [editId, setEditId] = useState(null);
            const [statId, setStatId] = useState(null);
            const [loading, setLoading] = useState(true);

            useEffect(() => {
                const params = new URLSearchParams(window.location.search);
                const initialExamId = params.get('examId');
                if (initialExamId) {
                    setEditId(initialExamId);
                    setMode('create');
                    window.history.replaceState({ mode: 'create', editId: initialExamId }, '', window.location.href);
                } else if (!window.history.state) {
                    window.history.replaceState({ mode: 'list' }, '', window.location.href);
                }

                const onPop = (evt) => {
                    const stateMode = evt.state?.mode || 'list';
                    setMode(stateMode);
                    setEditId(evt.state?.editId || null);
                    setStatId(evt.state?.statId || null);
                    if (stateMode === 'list') {
                        const params = new URLSearchParams(window.location.search);
                        if (params.has('examId')) {
                            params.delete('examId');
                            const queryString = params.toString();
                            const url = `${window.location.pathname}${queryString ? '?' + queryString : ''}${window.location.hash}`;
                            window.history.replaceState(evt.state || { mode: 'list' }, '', url);
                        }
                    }
                };

                window.addEventListener('popstate', onPop);
                return () => window.removeEventListener('popstate', onPop);
            }, []);

            useEffect(() => { loadExams(); }, []);
            const loadExams = () => {
                setLoading(true);
                fetch(\`/api/teacher/exams?teacher_id=\${user.id}\`).then(r=>r.json()).then(d=>setExams(Array.isArray(d)?d:[])).finally(() => setLoading(false));
            };

            const pushMode = (nextMode, nextEditId = null, options = {}) => {
                setMode(nextMode);
                setEditId(nextEditId);
                if (options.statId !== undefined) setStatId(options.statId);
                const params = new URLSearchParams(window.location.search);
                if (nextMode === 'create' && nextEditId) params.set('examId', nextEditId);
                else params.delete('examId');
                const queryString = params.toString();
                const url = `${window.location.pathname}${queryString ? '?' + queryString : ''}${window.location.hash}`;
                window.history.pushState({ mode: nextMode, editId: nextEditId, statId: options.statId ?? statId }, '', url);
            };

            const toggle = async (id, isActive) => { await fetch('/api/exam/toggle', {method:'POST', body:JSON.stringify({id, is_active:!isActive})}); loadExams(); };
            const del = async (id) => { if(!confirm("Delete?")) return; await fetch('/api/exam/delete', {method:'POST', body:JSON.stringify({id})}); loadExams(); };

            if (mode === 'create') return <ExamEditor user={user} examId={editId} onCancel={() => pushMode('list', null, { statId: null })} onFinish={() => { pushMode('list', null, { statId: null }); loadExams(); addToast("Exam Saved!"); }} addToast={addToast} />;
            if (mode === 'stats') return <DashboardLayout user={user} onLogout={onLogout} title="Analytics" activeTab={tab} onTabChange={setTab} action={<button onClick={()=>pushMode('list', null, { statId: null })} className="text-gray-500 font-bold">← Back</button>}><ExamStats examId={statId} /></DashboardLayout>;

            return (
                <DashboardLayout user={user} onLogout={onLogout} title={tab==='exams'?'My Exams':'Students'} activeTab={tab} onTabChange={setTab}
                    action={tab === 'exams' && <button onClick={() => { setEditId(null); pushMode('create'); }} className="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg shadow-orange-200 btn-bounce flex items-center gap-2"><Icons.Plus /> <span className="hidden sm:inline">New Exam</span></button>}
                >
                    {tab === 'exams' && <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 anim-enter pb-20">{loading ? Array.from({ length: 6 }).map((_, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-3xl shadow-sm border border-orange-50 h-40 animate-pulse">
                            <div className="h-4 bg-gray-100 rounded w-3/4 mb-4"></div>
                            <div className="space-y-2">
                                <div className="h-3 bg-gray-100 rounded"></div>
                                <div className="h-3 bg-gray-100 rounded w-2/3"></div>
                            </div>
                            <div className="h-8 bg-gray-100 rounded mt-6"></div>
                        </div>
                    )) : exams.map(e=> (
                        <div key={e.id} className="bg-white p-5 rounded-3xl shadow-sm border border-orange-100 relative group overflow-hidden">
                            <div className={\`absolute top-0 left-0 w-2 h-full \${e.is_active ? 'bg-green-400' : 'bg-gray-300'}\`}></div>
                            <div className="pl-4">
                                <div className="flex justify-between items-start mb-2"><h3 className="font-bold text-lg text-slate-800 line-clamp-1">{e.title}</h3><button onClick={()=>del(e.id)} className="text-gray-300 hover:text-red-500"><Icons.Trash/></button></div>
                                <div className="flex justify-between items-center mt-4"><Toggle checked={!!e.is_active} onChange={()=>toggle(e.id, e.is_active)} /><div className="flex gap-2"><button onClick={() => { setEditId(e.id); pushMode('create', e.id); }} className="bg-orange-50 text-orange-600 p-2 rounded-xl"><Icons.Edit /></button><button onClick={() => pushMode('stats', null, { statId: e.id })} className="bg-blue-50 text-blue-600 p-2 rounded-xl"><Icons.Chart /></button></div></div>
                                <button onClick={() => { navigator.clipboard.writeText(\`\${window.location.origin}/?exam=\${e.link_id}\`); addToast("Link Copied!"); }} className="w-full mt-4 bg-gray-50 text-gray-600 text-xs font-bold py-2 rounded-xl hover:bg-gray-100">Copy Link</button>
                            </div>
                        </div>
                    ))}</div>}
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
            const [loading, setLoading] = useState(true);

            useEffect(() => {
                setLoading(true);
                Promise.all([
                    fetch('/api/students/list').then(r=>r.json()),
                    fetch('/api/config/get').then(r=>r.json())
                ]).then(([students, cfg]) => {
                    setList(Array.isArray(students)?students:[]);
                    if(Array.isArray(cfg)) setConfig(cfg);
                }).finally(() => setLoading(false));
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

            const skeletonCards = Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-100 rounded w-1/4 mb-1"></div>
                    <div className="h-3 bg-gray-100 rounded w-1/5"></div>
                </div>
            ));

            return (
                <div className="space-y-4 pb-20">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Name or ID..." className="bg-gray-50 p-3 rounded-xl font-bold text-sm flex-1 outline-none focus:ring-2 focus:ring-indigo-100" />
                        <div className="flex gap-2">
                            <select value={filterClass} onChange={e=>setFilterClass(e.target.value)} className="bg-gray-50 p-3 rounded-xl font-bold text-sm outline-none"><option value="">All Classes</option>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select>
                            <select value={filterSec} onChange={e=>setFilterSec(e.target.value)} className="bg-gray-50 p-3 rounded-xl font-bold text-sm outline-none"><option value="">All Sections</option>{sections.map(s=><option key={s} value={s}>{s}</option>)}</select>
                        </div>
                    </div>
                    <div className="grid gap-3 md:hidden">
                        {loading ? skeletonCards : filtered.map(s=>(
                            <div key={s.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                                <div>
                                    <div className="font-bold">{s.name}</div>
                                    <div className="text-xs text-gray-400">{s.school_id}</div>
                                    <div className="text-xs font-bold text-indigo-500 mt-1">{s.class ? `Class ${s.class}` : 'No Class'} {s.section && ` - ${s.section}`}</div>
                                </div>
                                <div className="font-bold text-green-500">{Math.round(s.avg_score||0)}%</div>
                            </div>
                        ))}
                        {!loading && filtered.length === 0 && <div className="text-center text-gray-400 py-10">No students found</div>}
                    </div>
                    <div className="hidden md:block bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 font-bold uppercase text-xs">
                                        <th className="pb-2">Name</th>
                                        <th className="pb-2">School ID</th>
                                        <th className="pb-2">Class</th>
                                        <th className="pb-2 text-right">Avg Score</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="py-3"><div className="h-4 bg-gray-100 rounded w-1/2"></div></td>
                                            <td><div className="h-4 bg-gray-100 rounded w-2/3"></div></td>
                                            <td><div className="h-4 bg-gray-100 rounded w-1/4"></div></td>
                                            <td className="text-right"><div className="h-4 bg-gray-100 rounded w-1/5 ml-auto"></div></td>
                                        </tr>
                                    )) : filtered.map(s => (
                                        <tr key={s.id} className="hover:bg-gray-50">
                                            <td className="py-3 font-bold text-gray-800">{s.name}</td>
                                            <td className="text-gray-500">{s.school_id}</td>
                                            <td className="text-gray-500 font-bold">{s.class ? `Class ${s.class}` : 'No Class'} {s.section && ` - ${s.section}`}</td>
                                            <td className="text-right font-bold text-green-600">{Math.round(s.avg_score||0)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!loading && filtered.length === 0 && <div className="text-center text-gray-400 py-6">No students found</div>}
                        </div>
                    </div>
                </div>
            );
        }

        function ExamStats({ examId }) {
            const [data, setData] = useState([]);
            const [viewDetail, setViewDetail] = useState(null);
            
            useEffect(() => { fetch(\`/api/analytics/exam?exam_id=\${examId}\`).then(r=>r.json()).then(d=>setData(Array.isArray(d)?d:[])); }, [examId]);

            if(viewDetail) return (
                <div className="bg-white rounded-xl border p-6 anim-enter">
                    <button onClick={()=>setViewDetail(null)} className="mb-4 text-sm font-bold text-gray-500">← Back</button>
                    <h3 className="font-bold text-xl mb-4">{viewDetail.name} <span className="text-sm font-normal text-gray-500">({viewDetail.roll})</span></h3>
                    <div className="space-y-4">{JSON.parse(viewDetail.details || '[]').map((d,i)=><div key={i} className={\`p-4 rounded-lg border \${d.isCorrect?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}\`}><div className="font-bold text-gray-800 mb-1">Q{i+1}: {d.qText}</div><div className="text-sm"><span className="font-bold">Student:</span> {d.selectedText} {!d.isCorrect && <span className="ml-4 text-gray-600"><span className="font-bold">Correct:</span> {d.correctText}</span>}</div></div>)}</div>
                </div>
            )

            return <div className="space-y-3 pb-20">{data.map(r=><div key={r.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center"><div><div className="font-bold">{r.name}</div><div className="text-xs text-gray-500">{r.class && \`Class \${r.class}\`} {new Date(r.timestamp).toLocaleString()}</div></div><div className="flex items-center gap-3"><span className="font-bold">{r.score}/{r.total}</span><button onClick={()=>setViewDetail(r)} className="text-indigo-600 text-xs font-bold border border-indigo-200 px-2 py-1 rounded">View</button></div></div>)}</div>
        }

        function ExamEditor({ user, examId, onCancel, onFinish, addToast }) {
            const [meta, setMeta] = useState({ title: '', timerMode: 'question', timerValue: 30, allowBack: false, allowRetakes: false });
            const [qs, setQs] = useState([]);
            const [activeQ, setActiveQ] = useState(null); 
            const [submitting, setSubmitting] = useState(false);

            useEffect(() => {
                if (examId) fetch(\`/api/teacher/exam-details?id=\${examId}\`).then(r => r.json()).then(data => {
                    setMeta({ ...meta, ...JSON.parse(data.exam.settings || '{}'), title: data.exam.title });
                    setQs(data.questions.map(q => ({ ...q, choices: JSON.parse(q.choices) })));
                });
            }, [examId]);

            useEffect(() => {
                const prevOverflow = document.body.style.overflow;
                if (activeQ) document.body.style.overflow = 'hidden';
                else document.body.style.overflow = prevOverflow || 'auto';
                return () => { document.body.style.overflow = prevOverflow || 'auto'; };
            }, [activeQ]);

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
                    const res = await fetch('/api/exam/save', { method: 'POST', body: JSON.stringify({ id: examId, title: meta.title, teacher_id: user.id, settings: meta }) });
                    const data = await res.json();
                    for (let q of qs) {
                        const fd = new FormData();
                        fd.append('exam_id', data.id);
                        fd.append('text', q.text);
                        fd.append('choices', JSON.stringify(q.choices));
                        
                        // Handle Image Logic
                        if (q.image === null && q.image_key === null) {
                           // No op (Backend will store null if no existing_key sent)
                        } else if (q.image instanceof File) {
                           fd.append('image', q.image);
                        } else if (q.image_key) {
                           fd.append('existing_image_key', q.image_key);
                        }

                        await fetch('/api/question/add', { method: 'POST', body: fd });
                    }
                    onFinish();
                } catch(e) { addToast("Error Saving", 'error'); } 
                finally { setSubmitting(false); }
            };

            const downloadTemplate = () => {
                const example = [
                    { "text": "What is 2+2?", "choices": [ {"text": "3", "isCorrect": false}, {"text": "4", "isCorrect": true} ] }
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
                                <div className="space-y-3 mb-20">{qs.map((q, i) => (<div key={i} onClick={() => setActiveQ(q)} className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm flex items-center gap-4 active:scale-95 transition cursor-pointer"><span className="font-bold text-orange-400 bg-orange-50 w-8 h-8 flex items-center justify-center rounded-full text-xs">{i + 1}</span>{q.image_key && <Icons.Image />}<div className="flex-1 min-w-0"><p className="font-bold text-sm truncate">{q.text}</p><p className="text-xs text-gray-400">{q.choices.length} options</p></div><button onClick={(e) => { e.stopPropagation(); setQs(qs.filter(x => x !== q)); }} className="text-red-300"><Icons.Trash /></button></div>))}
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
            const [restored, setRestored] = useState(null);

            // Game State
            const [qIdx, setQIdx] = useState(0);
            const [score, setScore] = useState(0);
            const [answers, setAnswers] = useState({});
            const [resultDetails, setResultDetails] = useState(null);
            const [examHistory, setExamHistory] = useState([]);
            const [qTime, setQTime] = useState(0);
            const [totalTime, setTotalTime] = useState(0);
            const [submitting, setSubmitting] = useState(false);
            const [checkingId, setCheckingId] = useState(false);
            const [updatingProfile, setUpdatingProfile] = useState(false);

            const storageKey = useMemo(() => `exam_state_${linkId}`, [linkId]);

            useEffect(() => {
                try {
                    const saved = localStorage.getItem(storageKey);
                    if (saved) setRestored(JSON.parse(saved));
                } catch (e) {}
            }, [storageKey]);

            useEffect(() => {
                fetch(\`/api/exam/get?link_id=\${linkId}\`).then(r=>r.json()).then(d => {
                    if(!d.exam?.is_active) return alert("Exam Closed");
                    setExam(d);
                    const classes = [...new Set(d.config.filter(c=>c.type==='class').map(c=>c.value))];
                    const sections = [...new Set(d.config.filter(c=>c.type==='section').map(c=>c.value))];
                    setConfig({ classes, sections });
                });
            }, [linkId]);

            useEffect(() => {
                if (!exam || !restored || restored.examId !== exam.exam.id) return;
                if (restored.student) setStudent(restored.student);
                if (restored.mode) setMode(restored.mode);
                if (typeof restored.qIdx === 'number') setQIdx(restored.qIdx);
                if (restored.answers) setAnswers(restored.answers);
                if (typeof restored.qTime === 'number') setQTime(restored.qTime);
                if (typeof restored.totalTime === 'number') setTotalTime(restored.totalTime);
                if (restored.score) setScore(restored.score);
                if (restored.resultDetails) setResultDetails(restored.resultDetails);
                if (restored.examHistory) setExamHistory(restored.examHistory);
            }, [exam, restored]);

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
                if (submitting) return;
                setSubmitting(true);
                try {
                    let fs = 0;
                    const det = exam.questions.map(q => {
                        const s = answers[q.id];
                        const choices = JSON.parse(q.choices);
                        const correctChoice = choices.find(x => x.isCorrect);
                        const c = correctChoice?.id;
                        const isCorrect = s === c;
                        if(isCorrect) fs++;
                        return { qId: q.id, qText: q.text, choices: choices, selected: s, selectedText: choices.find(x => x.id === s)?.text || "Skipped", correct: c, correctText: correctChoice?.text, isCorrect };
                    });

                    setScore(fs); setResultDetails(det);
                    if((fs/exam.questions.length) > 0.6) confetti();
                    await fetch('/api/submit', { method: 'POST', body: JSON.stringify({ link_id: linkId, student, score: fs, total: exam.questions.length, answers: det }) });
                    const histRes = await fetch('/api/student/portal-history', { method: 'POST', body: JSON.stringify({ school_id: student.school_id }) }).then(r => r.json());
                    if (histRes.found) setExamHistory(histRes.history.filter(h => h.exam_id === exam.exam.id));
                    setMode('summary');
                } finally {
                    setSubmitting(false);
                }
            };

            const startGame = () => {
                 setMode('game');
                 setAnswers({});
                 setQIdx(0);
                 setScore(0);
                 setResultDetails(null);
                 setExamHistory([]);
                 const settings = JSON.parse(exam.exam.settings || '{}');
                 if(settings.timerMode==='total') setTotalTime((settings.timerValue||10)*60);
                 if(settings.timerMode==='question') setQTime(settings.timerValue||30);
            };

            useEffect(() => {
                if (!exam) return;
                const payload = { examId: exam.exam.id, mode, student, qIdx, answers, qTime, totalTime, score, resultDetails, examHistory };
                localStorage.setItem(storageKey, JSON.stringify(payload));
            }, [exam, mode, student, qIdx, answers, qTime, totalTime, score, resultDetails, examHistory, storageKey]);

            if(!exam) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-400">Loading Exam...</div>;
            const settings = JSON.parse(exam.exam.settings || '{}');

            if(mode === 'identify') return (
                <div className="min-h-screen bg-indigo-500 flex items-center justify-center p-6">
                    <div className="bg-white w-full max-w-sm p-8 rounded-3xl text-center anim-pop shadow-2xl">
                        <h1 className="text-2xl font-bold mb-4">Join Class</h1>
                        <input className="w-full bg-gray-100 p-4 rounded-xl font-bold mb-3 outline-none" placeholder="School ID" value={student.school_id} onChange={e=>setStudent({...student, school_id:e.target.value})} />
                        <button
                            onClick={async()=>{
                                if(checkingId) return;
                                if(!student.school_id) return alert("Enter ID");
                                setCheckingId(true);
                                const r = await fetch('/api/student/identify', {method:'POST', body:JSON.stringify({school_id:student.school_id})}).then(x=>x.json());
                                if(r.found) {
                                    // Check if profile incomplete
                                    if(!r.student.class || !r.student.section) {
                                        setStudent({...r.student, ...student});
                                        setMode('update_profile'); // Force update
                                    } else {
                                        setStudent({...r.student, ...student});
                                        startGame();
                                    }
                                } else setMode('register');
                                setCheckingId(false);
                            }}
                            className="w-full bg-black text-white p-4 rounded-xl font-bold disabled:opacity-60"
                            disabled={checkingId}
                        >{checkingId ? 'Checking...' : 'Next'}</button>
                    </div>
                </div>
            );

            if(mode === 'register' || mode === 'update_profile') return (
                <div className="min-h-screen bg-indigo-500 flex items-center justify-center p-6">
                    <div className="bg-white w-full max-w-sm p-8 rounded-3xl anim-pop">
                        <h1 className="text-xl font-bold mb-4">{mode === 'register' ? 'New Student' : 'Complete Profile'}</h1>
                        <p className="text-xs text-gray-400 mb-4 font-bold">Please fill in your details to continue.</p>
                        
                        {mode === 'register' && (
                            <>
                                <input className="w-full bg-gray-100 p-3 rounded-xl font-bold mb-3 outline-none" placeholder="Full Name" value={student.name} onChange={e=>setStudent({...student, name:e.target.value})} />
                                <input className="w-full bg-gray-100 p-3 rounded-xl font-bold mb-3 outline-none" placeholder="Roll No" value={student.roll} onChange={e=>setStudent({...student, roll:e.target.value})} />
                            </>
                        )}

                        <div className="flex gap-2 mb-4">
                            <select value={student.class} onChange={e=>setStudent({...student, class:e.target.value})} className="w-full bg-gray-100 p-3 rounded-xl font-bold text-sm outline-none">
                                <option value="">Select Class</option>
                                {config.classes.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                            <select value={student.section} onChange={e=>setStudent({...student, section:e.target.value})} className="w-full bg-gray-100 p-3 rounded-xl font-bold text-sm outline-none">
                                <option value="">Section</option>
                                {config.sections.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        
                        <button onClick={()=>{
                            if(updatingProfile) return;
                            if(!student.class || !student.section || (mode === 'register' && (!student.name || !student.roll))) return alert("Please fill all fields");
                            setUpdatingProfile(true);
                            startGame();
                            setUpdatingProfile(false);
                        }} className="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold disabled:opacity-60" disabled={updatingProfile}>{updatingProfile ? 'Preparing...' : 'Start Exam'}</button>
                    </div>
                </div>
            );

            if(mode === 'game') return (
                <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-6">
                    <div className="w-full max-w-md flex justify-between items-center mb-8">
                        <div className="font-bold text-slate-500 uppercase text-xs tracking-widest">Question {qIdx+1}/{exam.questions.length}</div>
                        <div className={\`text-xl font-mono font-bold \${(settings.timerMode==='question'?qTime:totalTime)<10?'text-red-500 animate-pulse':'text-green-400'}\`}>
                            {settings.timerMode === 'question' ? qTime : Math.floor(totalTime/60) + ':' + (totalTime%60).toString().padStart(2,'0')}
                        </div>
                    </div>
                    <div className="w-full max-w-md flex-1 flex flex-col justify-center">
                        <div className="bg-white text-slate-900 p-6 rounded-3xl mb-6 text-center shadow-2xl">
                            {exam.questions[qIdx].image_key && (
                                <div className="w-full mb-4">
                                    <div className="w-full aspect-video bg-slate-100 rounded-2xl flex items-center justify-center overflow-hidden">
                                        <img src={\`/img/\${exam.questions[qIdx].image_key}\`} className="h-full w-full object-contain" />
                                    </div>
                                </div>
                            )}
                            <h2 className="text-xl font-bold">{exam.questions[qIdx].text}</h2>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {JSON.parse(exam.questions[qIdx].choices).map(c => (
                                <button key={c.id} onClick={()=>{ setAnswers({...answers, [exam.questions[qIdx].id]:c.id}); if(settings.timerMode==='question') setTimeout(next, 250); }} className={\`p-5 rounded-2xl font-bold text-left transition transform active:scale-95 \${answers[exam.questions[qIdx].id]===c.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/50' : 'bg-slate-800 text-slate-300'}\`}>
                                    {c.text}
                                </button>
                            ))}
                        </div>
                         {settings.timerMode === 'total' && <div className="mt-8 flex justify-end"><button onClick={next} disabled={submitting} className="px-6 py-2 bg-white text-black rounded-lg font-bold disabled:opacity-60">{submitting && <span className="inline-flex items-center gap-2"><Icons.Loading /> Submitting...</span>}{!submitting && (qIdx === exam.questions.length - 1 ? 'Submit' : 'Next')}</button></div>}
                    </div>
                </div>
            );

            if(mode === 'summary') return (
                <div className="min-h-screen bg-slate-900 text-white p-6 overflow-y-auto">
                    <div className="max-w-2xl mx-auto space-y-8 pb-20">
                        <div className="bg-slate-800 p-8 rounded-3xl text-center border border-slate-700 shadow-2xl"><h2 className="text-3xl font-black mb-2 text-white">Exam Complete!</h2><div className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-green-400 to-blue-500 mb-4">{score} / {exam.questions.length}</div><div className="text-sm font-bold bg-slate-700 inline-block px-4 py-1 rounded-full text-slate-300">{Math.round((score/exam.questions.length)*100)}% Accuracy</div></div>
                        <div className="space-y-4">
                            <h3 className="font-bold text-xl mb-4 text-center">Detailed Review</h3>
                            {resultDetails.map((q, i) => (<div key={i} className={\`p-6 rounded-2xl border \${q.isCorrect ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'}\`}><div className="font-bold text-lg mb-3">Q{i+1}. {q.qText}</div><div className="space-y-2">{q.choices.map(c => { const isSelected = c.id === q.selected; const isCorrectChoice = c.id === q.correct; let style = "bg-slate-800 border-slate-700 text-slate-400"; if (isCorrectChoice) style = "bg-green-500 text-white border-green-500"; else if (isSelected && !q.isCorrect) style = "bg-red-500 text-white border-red-500"; return (<div key={c.id} className={\`p-3 rounded-xl border flex justify-between items-center \${style}\`}> <span className="font-bold">{c.text}</span> {isSelected && <span className="text-xs bg-white/20 px-2 py-1 rounded">You</span>} {isCorrectChoice && !isSelected && <span className="text-xs bg-white/20 px-2 py-1 rounded">Correct</span>} </div>); })}</div></div>))}
                        </div>
                        {settings.allowRetakes && (<div className="fixed bottom-0 left-0 w-full p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 text-center"><button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition w-full max-w-sm">Retake Exam</button></div>)}
                    </div>
                </div>
            );
        }

        function StudentPortal({ onBack }) {
             const [id, setId] = useState('');
             const [data, setData] = useState(null);
             
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
                    <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-xl text-center anim-pop">
                        <div className="mb-6 mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-500"><Icons.Logo /></div>
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">Student Hub</h1>
                        <form onSubmit={login}>
                            <input value={id} onChange={e=>setId(e.target.value)} className="w-full bg-gray-100 p-4 rounded-2xl font-bold text-center text-lg outline-none focus:ring-2 focus:ring-orange-400 mb-4" placeholder="Enter School ID" />
                            <button className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl btn-bounce shadow-lg shadow-orange-200">Enter</button>
                        </form>
                        <button onClick={onBack} className="mt-6 text-gray-400 font-bold text-sm">Back to Home</button>
                    </div>
                </div>
            );

             return (
                <div className="min-h-screen bg-orange-50 pb-safe">
                    <div className="bg-orange-500 p-8 pb-16 rounded-b-[40px] text-white shadow-lg relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-6">
                                <button onClick={()=>{localStorage.removeItem('student_id'); setData(null);}} className="bg-white/20 p-2 rounded-xl backdrop-blur-sm text-sm font-bold">Logout</button>
                                <span className="font-bold opacity-70">My Class</span>
                            </div>
                            <h1 className="text-3xl font-bold mb-1">Hi, {data.student.name.split(' ')[0]}!</h1>
                            <p className="opacity-80 font-bold text-sm tracking-wide">{data.student.school_id} • Class {data.student.class || 'N/A'}</p>
                        </div>
                    </div>
                    <div className="px-6 -mt-10 relative z-20 max-w-lg mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-3xl shadow-lg flex justify-around text-center">
                            <div>
                                <div className="text-3xl font-black text-slate-800">{data.history.length}</div>
                                <div className="text-xs font-bold text-gray-400 uppercase">Exams</div>
                            </div>
                            <div className="w-px bg-gray-100"></div>
                            <div>
                                <div className="text-3xl font-black text-green-500">{Math.round(data.history.reduce((a,b)=>a+(b.score/b.total),0)/data.history.length * 100 || 0)}%</div>
                                <div className="text-xs font-bold text-gray-400 uppercase">Avg Score</div>
                            </div>
                        </div>
                        <div className="space-y-4 pb-10">
                            <h3 className="font-bold text-slate-400 text-xs uppercase ml-2">Recent Activities</h3>
                            {data.history.map(h => (
                                <div key={h.id} className="bg-white p-5 rounded-2xl shadow-sm border border-orange-50 flex justify-between items-center">
                                    <div>
                                        <h4 className="font-bold text-slate-800">{h.title}</h4>
                                        <p className="text-xs text-gray-400 font-bold">{new Date(h.timestamp).toLocaleDateString()}</p>
                                    </div>
                                    <div className={\`text-lg font-black \${(h.score/h.total)>0.7 ? 'text-green-500':'text-orange-400'}\`}>{h.score}/{h.total}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        // --- APP ROOT ---
        function App() {
            const [status, setStatus] = useState(null);
            const [user, setUser] = useState(null);
            const initialRoute = window.__INITIAL_ROUTE__ || 'landing';
            const [route, setRoute] = useState(initialRoute);
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
                fetch('/api/system/status').then(r=>r.json()).then(setStatus).catch(e=>setStatus({installed:false, hasAdmin:false})); 
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


