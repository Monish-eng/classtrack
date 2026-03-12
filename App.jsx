import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════
   SUPABASE CONFIG  —  Replace these two values with your project keys
   ═══════════════════════════════════════════════════════════════════ */
const SB_URL  = "https://rovysbkenkntckpptubh.supabase.co";       // e.g. https://xxxx.supabase.co
const SB_KEY  = "sb_publishable_your_full_key_here";  // anon / public key

/* ── helpers ── */
const configured = () => !SB_URL.startsWith("YOUR");

async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${opts.token || SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
    },
    ...opts,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "DB error"); }
  return r.status === 204 ? null : r.json();
}

async function authReq(path, body) {
  const r = await fetch(`${SB_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || d.error);
  return d;
}

/* ── local storage ── */
const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ── constants ── */
const DAYS    = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const PERIODS = Array.from({length:8},(_,i)=>`Hour ${i+1}`);
const ST      = { P:"Present", A:"Absent", OD:"OD" };
const ST_CLR  = { P:"#10b981", A:"#f43f5e", OD:"#f59e0b" };
const ST_BG   = { P:"#d1fae5", A:"#ffe4e6", OD:"#fef3c7" };
const ST_DARK = { P:"#065f46", A:"#9f1239", OD:"#92400e" };

/* ════════════════════════════════════════════════════════════════════
   ROOT
   ════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [sess,   setSess]    = useState(null);
  const [view,   setView]    = useState("login");
  const [students, setStudents] = useState([]);
  const [timetable, setTimetable] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast,  setToast]   = useState(null);
  const [syncing, setSyncing] = useState(false);

  /* persist session */
  useEffect(() => {
    const s = ls.get("ct_sess");
    if (s) { setSess(s); setView("dashboard"); }
  }, []);

  const uid = sess?.user?.id || "local";

  const notify = useCallback((msg, type="ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  /* ── load data ── */
  const load = useCallback(async (s) => {
    const id = s?.user?.id || "local";
    if (configured() && s?.access_token) {
      setSyncing(true);
      try {
        const [stu, tt, rec] = await Promise.all([
          sbFetch(`/ct_students?user_id=eq.${id}&order=roll_no.asc`, { token: s.access_token }),
          sbFetch(`/ct_timetable?user_id=eq.${id}`, { token: s.access_token }),
          sbFetch(`/ct_attendance?user_id=eq.${id}&order=date.desc,period.asc`, { token: s.access_token }),
        ]);
        setStudents(stu || []);
        const map = {};
        (tt||[]).forEach(r => { map[`${r.day}__${r.period}`] = r; });
        setTimetable(map);
        setRecords(rec || []);
      } catch(e) { notify("Cloud sync failed – using local data","warn"); loadLocal(id); }
      setSyncing(false);
    } else { loadLocal(id); }
  }, [notify]);

  const loadLocal = (id) => {
    setStudents(ls.get(`stu_${id}`) || []);
    setTimetable(ls.get(`tt_${id}`) || {});
    setRecords(ls.get(`rec_${id}`) || []);
  };

  useEffect(() => { if (sess) load(sess); }, [sess, load]);

  const saveLocal = (key, val) => ls.set(`${key}_${uid}`, val);

  /* ── auth ── */
  const handleAuth = async (email, pw, reg) => {
    setLoading(true);
    try {
      if (configured()) {
        const d = reg
          ? await authReq("/signup", { email, password: pw })
          : await authReq("/token?grant_type=password", { email, password: pw });
        if (reg && !d.access_token) { notify("Check your email to confirm account","warn"); setLoading(false); return; }
        const s = { access_token: d.access_token, user: d.user || { id: email, email } };
        setSess(s); ls.set("ct_sess", s);
      } else {
        const s = { user: { id: email, email } };
        setSess(s); ls.set("ct_sess", s);
      }
      setView("dashboard");
      notify(reg ? "Account created! Welcome 🎉" : "Welcome back!");
    } catch(e) { notify(e.message, "err"); }
    setLoading(false);
  };

  const logout = () => {
    setSess(null); ls.set("ct_sess", null);
    setStudents([]); setTimetable({}); setRecords([]);
    setView("login");
  };

  /* ── students CRUD ── */
  const saveStudents = async (list) => {
    setStudents(list); saveLocal("stu", list);
    if (!configured() || !sess?.access_token) return;
    setSyncing(true);
    try {
      await fetch(`${SB_URL}/rest/v1/ct_students?user_id=eq.${uid}`, {
        method:"DELETE", headers:{ apikey:SB_KEY, Authorization:`Bearer ${sess.access_token}` }
      });
      if (list.length)
        await sbFetch("/ct_students", { method:"POST", token: sess.access_token, prefer:"return=minimal",
          body: JSON.stringify(list.map(s=>({...s, user_id:uid}))) });
    } catch(e) { notify("Sync failed","warn"); }
    setSyncing(false);
  };

  /* ── timetable ── */
  const saveTimetable = async (tt) => {
    setTimetable(tt); saveLocal("tt", tt);
    if (!configured() || !sess?.access_token) return;
    setSyncing(true);
    try {
      await fetch(`${SB_URL}/rest/v1/ct_timetable?user_id=eq.${uid}`, {
        method:"DELETE", headers:{ apikey:SB_KEY, Authorization:`Bearer ${sess.access_token}` }
      });
      const rows = Object.values(tt).filter(r=>r?.subject).map(r=>({...r, user_id:uid}));
      if (rows.length)
        await sbFetch("/ct_timetable", { method:"POST", token: sess.access_token, prefer:"return=minimal", body:JSON.stringify(rows) });
    } catch(e) { notify("Sync failed","warn"); }
    setSyncing(false);
  };

  /* ── attendance ── */
  const saveAttendance = async (rec) => {
    const updated = [rec, ...records.filter(r=>!(r.date===rec.date&&r.period===rec.period))];
    setRecords(updated); saveLocal("rec", updated);
    if (!configured() || !sess?.access_token) { notify("Saved locally ✓"); return; }
    setSyncing(true);
    try {
      await fetch(`${SB_URL}/rest/v1/ct_attendance?user_id=eq.${uid}&date=eq.${rec.date}&period=eq.${encodeURIComponent(rec.period)}`, {
        method:"DELETE", headers:{ apikey:SB_KEY, Authorization:`Bearer ${sess.access_token}` }
      });
      await sbFetch("/ct_attendance", { method:"POST", token:sess.access_token, prefer:"return=minimal",
        body:JSON.stringify({...rec, user_id:uid}) });
      notify("Saved to cloud ☁️");
    } catch(e) { notify("Saved locally (sync failed)","warn"); }
    setSyncing(false);
  };

  /* ── render ── */
  return (
    <div className="app-root">
      <style>{CSS}</style>
      {toast && <Toast {...toast} />}
      {syncing && <div className="sync-bar">☁️ Syncing…</div>}

      {view==="login"||view==="register" ? (
        <AuthScreen view={view} setView={setView} onAuth={handleAuth} loading={loading} />
      ) : (
        <div className="shell">
          <Nav view={view} setView={setView} sess={sess} onLogout={logout} />
          <div className="content">
            {view==="dashboard"  && <Dashboard students={students} records={records} timetable={timetable} setView={setView} />}
            {view==="attendance" && <Attendance students={students} timetable={timetable} onSave={saveAttendance} notify={notify} />}
            {view==="records"    && <Records records={records} notify={notify} />}
            {view==="students"   && <Students students={students} onSave={saveStudents} notify={notify} />}
            {view==="timetable"  && <Timetable timetable={timetable} onSave={saveTimetable} notify={notify} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AUTH
   ════════════════════════════════════════════════════════════════════ */
function AuthScreen({ view, setView, onAuth, loading }) {
  const [email, setEmail] = useState("");
  const [pw,    setPw]    = useState("");
  const reg = view === "register";
  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-icon">📋</div>
          <h1 className="brand-name">ClassTrack</h1>
          <p className="brand-tagline">College Attendance Management</p>
        </div>
        <div className="auth-fields">
          <label className="field-label">Email Address</label>
          <input className="field-input" type="email" placeholder="faculty@college.edu"
            value={email} onChange={e=>setEmail(e.target.value)} />
          <label className="field-label">Password</label>
          <input className="field-input" type="password" placeholder="••••••••"
            value={pw} onChange={e=>setPw(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&onAuth(email,pw,reg)} />
          <button className="btn-primary full" onClick={()=>onAuth(email,pw,reg)} disabled={loading}>
            {loading ? <span className="spin">⟳</span> : reg ? "Create Account" : "Sign In →"}
          </button>
          <p className="auth-toggle">
            {reg?"Already registered?":"New user?"}&nbsp;
            <span className="toggle-link" onClick={()=>setView(reg?"login":"register")}>
              {reg?"Sign In":"Register"}
            </span>
          </p>
          {!configured() && (
            <div className="local-badge">⚡ Local mode — add Supabase keys for cloud sync</div>
          )}
        </div>
      </div>
      <div className="auth-deco">
        <div className="deco-circle c1"/>
        <div className="deco-circle c2"/>
        <div className="deco-circle c3"/>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NAV
   ════════════════════════════════════════════════════════════════════ */
function Nav({ view, setView, sess, onLogout }) {
  const [open, setOpen] = useState(true);
  const items = [
    { id:"dashboard",  icon:"⬡", label:"Dashboard" },
    { id:"attendance", icon:"✦", label:"Take Attendance" },
    { id:"records",    icon:"◈", label:"Records" },
    { id:"students",   icon:"◉", label:"Students" },
    { id:"timetable",  icon:"▦", label:"Timetable" },
  ];
  return (
    <nav className={`nav ${open?"nav-open":"nav-closed"}`}>
      <div className="nav-head">
        {open && <span className="nav-brand">ClassTrack</span>}
        <button className="nav-toggle" onClick={()=>setOpen(!open)}>{open?"‹":"›"}</button>
      </div>
      {open && sess && (
        <div className="nav-user">
          <div className="user-avatar">{sess.user.email[0].toUpperCase()}</div>
          <div className="user-info">
            <div className="user-name">{sess.user.email.split("@")[0]}</div>
            <div className="user-sub">{sess.user.email.split("@")[1]}</div>
          </div>
        </div>
      )}
      <div className="nav-links">
        {items.map(i=>(
          <button key={i.id}
            className={`nav-item ${view===i.id?"nav-item-active":""}`}
            onClick={()=>setView(i.id)}
            title={!open?i.label:""}>
            <span className="nav-icon">{i.icon}</span>
            {open && <span className="nav-label">{i.label}</span>}
          </button>
        ))}
      </div>
      <button className="nav-logout" onClick={onLogout} title={!open?"Logout":""}>
        <span>⏻</span>{open&&<span>Logout</span>}
      </button>
    </nav>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════════════════════ */
function Dashboard({ students, records, timetable, setView }) {
  const today = new Date().toISOString().split("T")[0];
  const todayRecs = records.filter(r=>r.date===today);
  const P  = todayRecs.reduce((a,r)=>a+(r.attendance||[]).filter(s=>s.status==="P").length, 0);
  const Ab = todayRecs.reduce((a,r)=>a+(r.attendance||[]).filter(s=>s.status==="A").length, 0);
  const OD = todayRecs.reduce((a,r)=>a+(r.attendance||[]).filter(s=>s.status==="OD").length, 0);
  const dateStr = new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  /* attendance % per student */
  const attMap = useMemo(() => {
    const m = {};
    records.forEach(r => (r.attendance||[]).forEach(s => {
      if (!m[s.id]) m[s.id] = { P:0, total:0, name:s.name, roll:s.roll };
      m[s.id].total++;
      if (s.status==="P") m[s.id].P++;
    }));
    return m;
  }, [records]);

  const lowAtt = useMemo(() =>
    Object.values(attMap)
      .map(s=>({...s, pct: s.total ? Math.round(s.P/s.total*100) : 100}))
      .filter(s=>s.pct<75)
      .sort((a,b)=>a.pct-b.pct)
      .slice(0,8),
  [attMap]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-sub">{dateStr}</p>
        </div>
        <button className="btn-primary" onClick={()=>setView("attendance")}>+ Take Attendance</button>
      </div>

      <div className="stat-grid">
        {[
          { label:"Total Students", val:students.length, icon:"◉", clr:"#6366f1" },
          { label:"Present Today",  val:P,                icon:"✦", clr:"#10b981" },
          { label:"Absent Today",   val:Ab,               icon:"✕", clr:"#f43f5e" },
          { label:"OD Today",       val:OD,               icon:"◈", clr:"#f59e0b" },
          { label:"Classes Today",  val:todayRecs.length, icon:"▦", clr:"#8b5cf6" },
          { label:"Total Records",  val:records.length,   icon:"⬡", clr:"#0ea5e9" },
        ].map(s=>(
          <div key={s.label} className="stat-card" style={{"--accent":s.clr}}>
            <div className="stat-top">
              <span className="stat-icon" style={{color:s.clr}}>{s.icon}</span>
              <span className="stat-val">{s.val}</span>
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-bar" style={{background:s.clr+"22"}}>
              <div className="stat-fill" style={{background:s.clr, width:`${Math.min(100,(s.val/(students.length||1))*100)}%`}}/>
            </div>
          </div>
        ))}
      </div>

      {lowAtt.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">⚠ Low Attendance Students</span>
            <span className="badge-warn">Below 75%</span>
          </div>
          <div className="low-list">
            {lowAtt.map(s=>(
              <div key={s.roll} className="low-row">
                <span className="roll-tag">{s.roll}</span>
                <span className="low-name">{s.name}</span>
                <div className="pct-bar">
                  <div className="pct-fill" style={{width:`${s.pct}%`, background: s.pct<60?"#f43f5e":"#f59e0b"}}/>
                </div>
                <span className="pct-val" style={{color:s.pct<60?"#f43f5e":"#f59e0b"}}>{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="quick-grid">
        {[
          { label:"Take Attendance", icon:"✦", view:"attendance", desc:"Mark today's class" },
          { label:"View Records",    icon:"◈", view:"records",    desc:"Search & share reports" },
          { label:"Manage Students", icon:"◉", view:"students",   desc:"Add or edit students" },
          { label:"Edit Timetable",  icon:"▦", view:"timetable",  desc:"Set periods & subjects" },
        ].map(a=>(
          <button key={a.label} className="quick-card" onClick={()=>setView(a.view)}>
            <span className="quick-icon">{a.icon}</span>
            <span className="quick-label">{a.label}</span>
            <span className="quick-desc">{a.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   STUDENTS  —  optimised for 90+ with bulk import
   ════════════════════════════════════════════════════════════════════ */
function Students({ students, onSave, notify }) {
  const [list, setList]       = useState(students);
  const [name, setName]       = useState("");
  const [roll, setRoll]       = useState("");
  const [dept, setDept]       = useState("");
  const [bulk, setBulk]       = useState("");
  const [search, setSearch]   = useState("");
  const [tab, setTab]         = useState("list");

  useEffect(()=>setList(students),[students]);

  const filtered = useMemo(()=>
    list.filter(s=> s.name.toLowerCase().includes(search.toLowerCase()) || s.roll?.includes(search)),
  [list,search]);

  const add = () => {
    if (!name.trim()) return;
    const s = { id:Date.now()+"", name:name.trim(), roll:roll.trim()||`${list.length+1}`, dept:dept.trim() };
    setList(prev=>[...prev,s].sort((a,b)=>a.roll.localeCompare(b.roll,undefined,{numeric:true})));
    setName(""); setRoll(""); setDept("");
  };

  const importBulk = () => {
    const lines = bulk.split("\n").map(l=>l.trim()).filter(Boolean);
    const parsed = lines.map((l,i)=>{
      const parts = l.split(/[,\t]+/);
      return { id:Date.now()+i+"", roll:parts[0]?.trim()||`${list.length+i+1}`, name:parts[1]?.trim()||parts[0]?.trim()||"Student", dept:parts[2]?.trim()||"" };
    });
    const merged = [...list, ...parsed].sort((a,b)=>a.roll.localeCompare(b.roll,undefined,{numeric:true}));
    setList(merged); setBulk(""); notify(`${parsed.length} students imported`);
  };

  const remove = id => setList(prev=>prev.filter(s=>s.id!==id));

  const save = () => { onSave(list); notify("Students saved to cloud ☁️"); };

  return (
    <div className="page">
      <div className="page-header">
        <div><h2 className="page-title">Students</h2><p className="page-sub">{list.length} enrolled</p></div>
        <button className="btn-primary" onClick={save}>☁ Save All</button>
      </div>

      <div className="tab-bar">
        {["list","add","bulk"].map(t=>(
          <button key={t} className={`tab-btn ${tab===t?"tab-active":""}`} onClick={()=>setTab(t)}>
            {t==="list"?"📋 Student List":t==="add"?"➕ Add One":"📥 Bulk Import"}
          </button>
        ))}
      </div>

      {tab==="add" && (
        <div className="panel">
          <div className="field-row">
            <div className="field-group"><label className="field-label">Roll No.</label>
              <input className="field-input" placeholder="e.g. 21CS001" value={roll} onChange={e=>setRoll(e.target.value)} /></div>
            <div className="field-group" style={{flex:2}}><label className="field-label">Full Name</label>
              <input className="field-input" placeholder="Student full name" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} /></div>
            <div className="field-group"><label className="field-label">Department</label>
              <input className="field-input" placeholder="CSE / ECE …" value={dept} onChange={e=>setDept(e.target.value)} /></div>
            <button className="btn-primary" style={{alignSelf:"flex-end"}} onClick={add}>Add</button>
          </div>
        </div>
      )}

      {tab==="bulk" && (
        <div className="panel">
          <p className="hint">Paste one student per line. Format: <code>RollNo, Name, Department</code></p>
          <textarea className="field-input bulk-area" placeholder={`21CS001, Arun Kumar, CSE\n21CS002, Priya S, CSE\n21EC001, Ravi R, ECE`}
            value={bulk} onChange={e=>setBulk(e.target.value)} />
          <button className="btn-primary" onClick={importBulk} disabled={!bulk.trim()}>Import {bulk.split("\n").filter(Boolean).length} Students</button>
        </div>
      )}

      {tab==="list" && (
        <div className="panel">
          <input className="field-input search-box" placeholder="🔍  Search by name or roll number…"
            value={search} onChange={e=>setSearch(e.target.value)} />
          {filtered.length===0 ? <div className="empty-state">No students found.</div> : (
            <div className="stu-table">
              <div className="stu-thead">
                <span>Roll No.</span><span>Name</span><span>Dept</span><span></span>
              </div>
              {filtered.map(s=>(
                <div key={s.id} className="stu-row">
                  <span className="roll-tag">{s.roll}</span>
                  <span className="stu-name">{s.name}</span>
                  <span className="stu-dept">{s.dept||"—"}</span>
                  <button className="del-btn" onClick={()=>remove(s.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TIMETABLE
   ════════════════════════════════════════════════════════════════════ */
function Timetable({ timetable, onSave, notify }) {
  const [tt, setTt]   = useState(timetable);
  const [day, setDay] = useState("Monday");

  useEffect(()=>setTt(timetable),[timetable]);

  const upd = (d,p,f,v) => {
    const k=`${d}__${p}`;
    setTt(prev=>({...prev,[k]:{...prev[k],day:d,period:p,[f]:v}}));
  };

  const save = ()=>{ onSave(tt); notify("Timetable saved ☁️"); };

  return (
    <div className="page">
      <div className="page-header">
        <div><h2 className="page-title">Timetable</h2><p className="page-sub">Define subjects & timings per period</p></div>
        <button className="btn-primary" onClick={save}>☁ Save Timetable</button>
      </div>
      <div className="day-chips">
        {DAYS.map(d=>(
          <button key={d} className={`day-chip ${day===d?"day-chip-on":""}`} onClick={()=>setDay(d)}>{d.slice(0,3)}</button>
        ))}
      </div>
      <div className="panel">
        <div className="tt-head">
          <span>Hour</span><span>Subject</span><span>Faculty (opt.)</span><span>Start</span><span>End</span>
        </div>
        {PERIODS.map(p=>{
          const k=`${day}__${p}`;
          const row=tt[k]||{};
          return (
            <div key={p} className="tt-row">
              <span className="tt-period">{p}</span>
              <input className="tt-cell-input" placeholder="e.g. Mathematics" value={row.subject||""} onChange={e=>upd(day,p,"subject",e.target.value)} />
              <input className="tt-cell-input" placeholder="Faculty name" value={row.faculty||""} onChange={e=>upd(day,p,"faculty",e.target.value)} />
              <input className="tt-cell-input time-in" type="time" value={row.startTime||""} onChange={e=>upd(day,p,"startTime",e.target.value)} />
              <input className="tt-cell-input time-in" type="time" value={row.endTime||""} onChange={e=>upd(day,p,"endTime",e.target.value)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ATTENDANCE  —  virtualised for 90+ students
   ════════════════════════════════════════════════════════════════════ */
function Attendance({ students, timetable, onSave, notify }) {
  const today = new Date().toISOString().split("T")[0];
  const dayName = new Date(today+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long"});

  const [date,    setDate]    = useState(today);
  const [period,  setPeriod]  = useState("Hour 1");
  const [subject, setSubject] = useState("");
  const [topic,   setTopic]   = useState("");
  const [att,     setAtt]     = useState({});
  const [search,  setSearch]  = useState("");
  const [saved,   setSaved]   = useState(false);

  const curDay = useMemo(()=>new Date(date+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long"}),[date]);
  const ttSlot = useMemo(()=>timetable[`${curDay}__${period}`]||{},[timetable,curDay,period]);

  useEffect(()=>{ setSubject(ttSlot.subject||""); },[ttSlot]);

  useEffect(()=>{
    const init={};
    students.forEach(s=>{ init[s.id]="P"; });
    setAtt(init); setSaved(false);
  },[students,date,period]);

  const filtered = useMemo(()=>
    students.filter(s=> s.name.toLowerCase().includes(search.toLowerCase())||s.roll?.includes(search)),
  [students,search]);

  const mark = (id,st) => setAtt(prev=>({...prev,[id]:st}));
  const markAll = st => { const u={}; students.forEach(s=>{u[s.id]=st;}); setAtt(u); };

  const countSt = st => students.filter(s=>att[s.id]===st).length;

  const handleSave = () => {
    if (!students.length){ notify("No students found — add students first","warn"); return; }
    onSave({ date, period, subject, topic,
      day: curDay,
      startTime: ttSlot.startTime||"",
      endTime:   ttSlot.endTime||"",
      attendance: students.map(s=>({id:s.id,name:s.name,roll:s.roll,dept:s.dept||"",status:att[s.id]||"P"})) });
    setSaved(true);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><h2 className="page-title">Take Attendance</h2><p className="page-sub">{curDay}, {date}</p></div>
        {saved && <span className="saved-badge">✓ Saved</span>}
      </div>

      {/* class meta */}
      <div className="panel">
        <div className="meta-grid">
          <div className="field-group">
            <label className="field-label">Date</label>
            <input className="field-input" type="date" value={date} onChange={e=>{setDate(e.target.value);setSaved(false);}} />
          </div>
          <div className="field-group">
            <label className="field-label">Hour / Period</label>
            <select className="field-input" value={period} onChange={e=>{setPeriod(e.target.value);setSaved(false);}}>
              {PERIODS.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Subject</label>
            <input className="field-input" placeholder="Auto-filled from timetable" value={subject}
              onChange={e=>setSubject(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Topic Taught</label>
            <input className="field-input" placeholder="e.g. Fourier Transforms" value={topic}
              onChange={e=>setTopic(e.target.value)} />
          </div>
        </div>
        {ttSlot.startTime && (
          <div className="time-badge">🕐 {ttSlot.startTime} – {ttSlot.endTime}{ttSlot.faculty?` · ${ttSlot.faculty}`:""}</div>
        )}
      </div>

      {/* summary + controls */}
      <div className="att-controls">
        <div className="att-summary">
          {Object.keys(ST).map(k=>(
            <div key={k} className="sum-chip" style={{background:ST_BG[k],color:ST_DARK[k]}}>
              {ST[k]}: <strong>{countSt(k)}</strong>
            </div>
          ))}
          <span className="total-chip">Total: {students.length}</span>
        </div>
        <div className="mark-all">
          <span className="mark-label">Mark all:</span>
          {Object.entries(ST).map(([k,v])=>(
            <button key={k} className="mark-btn" style={{background:ST_BG[k],color:ST_DARK[k]}} onClick={()=>markAll(k)}>{v}</button>
          ))}
        </div>
      </div>

      {/* search */}
      <input className="field-input search-box" placeholder="🔍  Search student…"
        value={search} onChange={e=>setSearch(e.target.value)} />

      {/* list */}
      {students.length===0
        ? <div className="empty-state">Add students in the Students section first.</div>
        : (
          <div className="panel no-pad">
            <div className="att-thead">
              <span>Roll</span><span>Name</span><span>Dept</span><span>Status</span>
            </div>
            <div className="att-body">
              {filtered.map(s=>(
                <div key={s.id} className={`att-row ${att[s.id]==="A"?"att-absent":att[s.id]==="OD"?"att-od":""}`}>
                  <span className="roll-tag">{s.roll}</span>
                  <span className="stu-name">{s.name}</span>
                  <span className="stu-dept">{s.dept||"—"}</span>
                  <div className="st-btns">
                    {Object.keys(ST).map(k=>(
                      <button key={k} className={`st-btn ${att[s.id]===k?"st-active":""}`}
                        style={att[s.id]===k?{background:ST_CLR[k],color:"#fff"}:{}}
                        onClick={()=>mark(s.id,k)}>{k}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }

      <button className="btn-save" onClick={handleSave}>
        {saved ? "✓ Update Attendance" : "💾 Save Attendance"}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RECORDS
   ════════════════════════════════════════════════════════════════════ */
function Records({ records, notify }) {
  const [sel,    setSel]    = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(()=>{
    let list = records.filter(r=>
      r.date?.includes(search) ||
      r.period?.toLowerCase().includes(search.toLowerCase()) ||
      r.subject?.toLowerCase().includes(search.toLowerCase()) ||
      r.day?.toLowerCase().includes(search.toLowerCase())
    );
    if (filter!=="all") list = list.filter(r=>r.period===filter);
    return list;
  },[records,search,filter]);

  const shareText = (r) => {
    if (!r) return "";
    const absent  = (r.attendance||[]).filter(s=>s.status==="A").map(s=>`  ${s.roll}. ${s.name}${s.dept?` (${s.dept})`:""}`);
    const od      = (r.attendance||[]).filter(s=>s.status==="OD").map(s=>`  ${s.roll}. ${s.name}${s.dept?` (${s.dept})`:""}`);
    const present = (r.attendance||[]).filter(s=>s.status==="P");
    const dateObj = new Date(r.date+"T00:00:00");
    const fmtDate = dateObj.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    return (
`📋 *Attendance Report*
━━━━━━━━━━━━━━━━━━━━━━━━
📅 *Date:* ${fmtDate}
📚 *Subject:* ${r.subject||"—"}
📖 *Topic:* ${r.topic||"—"}
🕐 *${r.period}*${r.startTime?` · ${r.startTime} – ${r.endTime}`:""}

*Strength:*
👥 Total: ${(r.attendance||[]).length}   ✅ Present: ${present.length}   ❌ Absent: ${absent.length}   🏷 OD: ${od.length}
━━━━━━━━━━━━━━━━━━━━━━━━
${absent.length
  ? `\n❌ *Absentees (${absent.length}):*\n${absent.join("\n")}`
  : "\n✅ *Full Attendance – No Absentees!*"}
${od.length ? `\n\n🏷 *OD Students (${od.length}):*\n${od.join("\n")}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━
_Sent via ClassTrack_`
    );
  };

  const copy = (r) => {
    navigator.clipboard.writeText(shareText(r))
      .then(()=>notify("Copied! Paste in WhatsApp/Telegram 📤"))
      .catch(()=>notify("Copy failed","err"));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><h2 className="page-title">Records</h2><p className="page-sub">{records.length} sessions logged</p></div>
      </div>

      <div className="rec-filters">
        <input className="field-input search-box" placeholder="🔍  Search date, subject, period…"
          value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="field-input" style={{width:150}} value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All Hours</option>
          {PERIODS.map(p=><option key={p}>{p}</option>)}
        </select>
      </div>

      <div className="rec-layout">
        <div className="rec-list">
          {filtered.length===0
            ? <div className="empty-state">No records found.</div>
            : filtered.map((r,i)=>{
              const ab = (r.attendance||[]).filter(s=>s.status==="A").length;
              const od = (r.attendance||[]).filter(s=>s.status==="OD").length;
              const pr = (r.attendance||[]).filter(s=>s.status==="P").length;
              const pct = (r.attendance||[]).length ? Math.round(pr/(r.attendance||[]).length*100) : 0;
              return (
                <div key={i} className={`rec-card ${sel===r?"rec-card-on":""}`} onClick={()=>setSel(sel===r?null:r)}>
                  <div className="rec-top">
                    <span className="rec-date">{r.date}</span>
                    <span className="rec-period">{r.period}</span>
                  </div>
                  <div className="rec-subject">{r.subject||"—"}</div>
                  <div className="rec-day">{r.day}</div>
                  <div className="rec-stats">
                    <span style={{color:ST_CLR.P}}>✅{pr}</span>
                    <span style={{color:ST_CLR.A}}>❌{ab}</span>
                    <span style={{color:ST_CLR.OD}}>🏷{od}</span>
                    <span className={`pct-tag ${pct<75?"pct-low":""}`}>{pct}%</span>
                  </div>
                </div>
              );
            })
          }
        </div>

        {sel && (
          <div className="rec-detail">
            <div className="panel-head">
              <span className="panel-title">Session Detail</span>
              <button className="btn-share" onClick={()=>copy(sel)}>📤 Copy & Share</button>
            </div>
            <div className="rec-meta">
              <div><strong>Date:</strong> {new Date(sel.date+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
              <div><strong>Period:</strong> {sel.period}</div>
              {sel.startTime&&<div><strong>Time:</strong> {sel.startTime} – {sel.endTime}</div>}
              <div><strong>Subject:</strong> {sel.subject||"—"}</div>
              <div><strong>Topic:</strong> {sel.topic||"—"}</div>
            </div>
            <div className="share-box">
              <pre className="share-pre">{shareText(sel)}</pre>
            </div>
            <div className="detail-list">
              <div className="att-thead"><span>Roll</span><span>Name</span><span>Status</span></div>
              {(sel.attendance||[]).map(s=>(
                <div key={s.id} className="att-row">
                  <span className="roll-tag">{s.roll}</span>
                  <span className="stu-name">{s.name}</span>
                  <span className="status-pill" style={{background:ST_BG[s.status],color:ST_DARK[s.status]}}>{ST[s.status]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════════════════════════════ */
function Toast({ msg, type }) {
  const bg = { ok:"#10b981", err:"#f43f5e", warn:"#f59e0b" }[type]||"#6366f1";
  return <div className="toast" style={{background:bg}}>{msg}</div>;
}

/* ════════════════════════════════════════════════════════════════════
   CSS
   ════════════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }
body { font-family:'Outfit',sans-serif; background:#0f172a; color:#e2e8f0; }

.app-root { min-height:100vh; background:#0f172a; }
.shell    { display:flex; min-height:100vh; }
.content  { flex:1; overflow-y:auto; min-height:100vh; background:#0f172a; }

/* ── Sync bar ── */
.sync-bar { position:fixed; top:0; left:0; right:0; background:#6366f1; color:#fff; text-align:center;
  font-size:12px; padding:4px; z-index:999; font-weight:600; }

/* ── Auth ── */
.auth-bg { min-height:100vh; display:flex; align-items:center; justify-content:center;
  background: radial-gradient(ellipse at 20% 50%, #1e1b4b 0%, #0f172a 60%), 
              radial-gradient(ellipse at 80% 20%, #1e3a5f 0%, transparent 60%); position:relative; overflow:hidden; }
.auth-card { background:#1e293b; border:1px solid #334155; border-radius:20px; padding:48px 40px;
  width:100%; max-width:420px; position:relative; z-index:2; box-shadow:0 32px 80px rgba(0,0,0,0.5); }
.auth-brand { text-align:center; margin-bottom:36px; }
.brand-icon  { font-size:52px; display:block; margin-bottom:10px; }
.brand-name  { font-size:32px; font-weight:800; color:#f1f5f9; letter-spacing:-1px; }
.brand-tagline { color:#64748b; font-size:14px; margin-top:4px; }
.auth-fields { display:flex; flex-direction:column; gap:14px; }
.auth-toggle { text-align:center; color:#64748b; font-size:14px; }
.toggle-link { color:#818cf8; cursor:pointer; font-weight:600; }
.toggle-link:hover { text-decoration:underline; }
.local-badge { background:#1c2b1a; border:1px solid #365314; color:#86efac; border-radius:10px;
  padding:10px 14px; font-size:12px; text-align:center; }
.deco-circle { position:absolute; border-radius:50%; pointer-events:none; }
.c1 { width:400px; height:400px; background:radial-gradient(circle,#4338ca22,transparent); top:-100px; right:-100px; }
.c2 { width:300px; height:300px; background:radial-gradient(circle,#0ea5e922,transparent); bottom:-50px; left:-80px; }
.c3 { width:200px; height:200px; background:radial-gradient(circle,#7c3aed22,transparent); top:50%; left:50%; transform:translate(-50%,-50%); }

/* ── Nav ── */
.nav { background:#1e293b; border-right:1px solid #334155; display:flex; flex-direction:column;
  padding:20px 12px; transition:width 0.2s; overflow:hidden; min-height:100vh; flex-shrink:0; }
.nav-open   { width:220px; }
.nav-closed { width:60px; }
.nav-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.nav-brand { font-size:18px; font-weight:800; color:#818cf8; letter-spacing:-0.5px; }
.nav-toggle { background:#334155; border:none; color:#94a3b8; border-radius:8px;
  cursor:pointer; padding:5px 9px; font-size:14px; }
.nav-toggle:hover { background:#475569; }
.nav-user { display:flex; align-items:center; gap:10px; background:#334155; border-radius:10px;
  padding:10px; margin-bottom:12px; overflow:hidden; }
.user-avatar { width:32px; height:32px; background:#6366f1; border-radius:50%; display:flex;
  align-items:center; justify-content:center; font-weight:700; font-size:14px; flex-shrink:0; }
.user-name { font-size:13px; font-weight:600; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.user-sub  { font-size:11px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.nav-links { flex:1; display:flex; flex-direction:column; gap:3px; }
.nav-item  { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px;
  border:none; background:transparent; color:#94a3b8; cursor:pointer; width:100%; font-size:14px;
  font-family:'Outfit',sans-serif; font-weight:500; white-space:nowrap; transition:all 0.15s; }
.nav-item:hover { background:#334155; color:#e2e8f0; }
.nav-item-active { background:#6366f1 !important; color:#fff !important; }
.nav-icon  { font-size:16px; min-width:18px; text-align:center; }
.nav-logout { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px;
  border:none; background:#334155; color:#f87171; cursor:pointer; font-size:14px;
  font-family:'Outfit',sans-serif; font-weight:500; margin-top:8px; }
.nav-logout:hover { background:#450a0a; }

/* ── Page ── */
.page { padding:28px 28px 60px; max-width:1140px; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
.page-title  { font-size:26px; font-weight:800; color:#f1f5f9; letter-spacing:-0.5px; }
.page-sub    { color:#64748b; font-size:14px; margin-top:3px; }

/* ── Panel ── */
.panel { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:22px; margin-bottom:18px; }
.panel.no-pad { padding:0; overflow:hidden; }
.panel-head  { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px; }
.panel-title { font-size:16px; font-weight:700; color:#f1f5f9; }
.badge-warn  { background:#451a03; color:#fb923c; border-radius:20px; padding:3px 12px; font-size:12px; font-weight:600; }

/* ── Buttons ── */
.btn-primary { padding:10px 22px; background:#6366f1; color:#fff; border:none; border-radius:10px;
  font-size:14px; font-weight:600; cursor:pointer; font-family:'Outfit',sans-serif; white-space:nowrap; transition:all 0.15s; }
.btn-primary:hover:not(:disabled) { background:#4f46e5; }
.btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
.btn-primary.full { width:100%; padding:13px; font-size:15px; }
.btn-save { width:100%; padding:15px; background:linear-gradient(135deg,#6366f1,#8b5cf6);
  color:#fff; border:none; border-radius:12px; font-size:16px; font-weight:700;
  cursor:pointer; margin-top:16px; font-family:'Outfit',sans-serif; transition:all 0.2s; }
.btn-save:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(99,102,241,0.4); }
.btn-share { padding:8px 18px; background:#0ea5e9; color:#fff; border:none; border-radius:9px;
  cursor:pointer; font-weight:600; font-size:13px; font-family:'Outfit',sans-serif; }
.del-btn  { padding:4px 10px; background:#450a0a; color:#f87171; border:none;
  border-radius:7px; cursor:pointer; font-weight:700; font-size:13px; }

/* ── Fields ── */
.field-label { display:block; font-size:12px; font-weight:600; color:#94a3b8; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; }
.field-input  { width:100%; padding:10px 14px; background:#0f172a; border:1.5px solid #334155;
  border-radius:10px; font-size:14px; color:#f1f5f9; outline:none; font-family:'Outfit',sans-serif; transition:border-color 0.2s; }
.field-input:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.2); }
select.field-input option { background:#1e293b; }
.field-row   { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
.field-group { display:flex; flex-direction:column; flex:1; min-width:140px; }
.search-box  { margin-bottom:14px; }
.bulk-area   { min-height:120px; resize:vertical; }
.hint        { font-size:13px; color:#64748b; margin-bottom:10px; }
code         { background:#334155; padding:2px 6px; border-radius:5px; font-family:'JetBrains Mono',monospace; font-size:12px; }

/* ── Tabs ── */
.tab-bar { display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap; }
.tab-btn  { padding:8px 18px; border-radius:10px; border:1.5px solid #334155;
  background:transparent; color:#94a3b8; cursor:pointer; font-size:13px; font-weight:500; font-family:'Outfit',sans-serif; }
.tab-active { background:#6366f1; color:#fff; border-color:#6366f1; }

/* ── Dashboard Stats ── */
.stat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:14px; margin-bottom:22px; }
.stat-card { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:18px;
  border-top:3px solid var(--accent,#6366f1); }
.stat-top   { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.stat-icon  { font-size:20px; }
.stat-val   { font-size:30px; font-weight:800; color:#f1f5f9; }
.stat-label { font-size:12px; color:#64748b; margin-bottom:10px; }
.stat-bar   { height:4px; border-radius:2px; overflow:hidden; }
.stat-fill  { height:100%; border-radius:2px; transition:width 0.6s; }

/* ── Low attendance ── */
.low-list { display:flex; flex-direction:column; gap:8px; }
.low-row  { display:flex; align-items:center; gap:10px; }
.low-name { flex:1; font-size:14px; color:#e2e8f0; }
.pct-bar  { width:100px; height:6px; background:#334155; border-radius:3px; overflow:hidden; }
.pct-fill { height:100%; border-radius:3px; transition:width 0.5s; }
.pct-val  { font-size:13px; font-weight:700; min-width:38px; text-align:right; }

/* ── Quick actions ── */
.quick-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; margin-top:4px; }
.quick-card { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:22px;
  display:flex; flex-direction:column; gap:6px; cursor:pointer;
  border:none; text-align:left; transition:all 0.2s; }
.quick-card:hover { background:#334155; transform:translateY(-2px); }
.quick-icon  { font-size:24px; color:#818cf8; }
.quick-label { font-size:15px; font-weight:700; color:#f1f5f9; }
.quick-desc  { font-size:12px; color:#64748b; }

/* ── Students table ── */
.stu-table { display:flex; flex-direction:column; max-height:500px; overflow-y:auto; }
.stu-thead { display:grid; grid-template-columns:100px 1fr 120px 40px; gap:8px;
  padding:10px 14px; background:#334155; font-size:11px; font-weight:700;
  text-transform:uppercase; letter-spacing:0.5px; color:#94a3b8; }
.stu-row   { display:grid; grid-template-columns:100px 1fr 120px 40px; gap:8px;
  padding:10px 14px; border-bottom:1px solid #1e293b; align-items:center; }
.stu-row:hover { background:#334155; }
.stu-name  { font-size:14px; font-weight:500; color:#f1f5f9; }
.stu-dept  { font-size:13px; color:#64748b; }
.roll-tag  { background:#312e81; color:#a5b4fc; border-radius:7px; padding:3px 9px;
  font-size:12px; font-weight:700; font-family:'JetBrains Mono',monospace; white-space:nowrap; }

/* ── Day chips ── */
.day-chips { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
.day-chip  { padding:8px 18px; border-radius:20px; border:1.5px solid #334155;
  background:transparent; color:#94a3b8; cursor:pointer; font-size:13px; font-weight:600; font-family:'Outfit',sans-serif; }
.day-chip-on { background:#6366f1; color:#fff; border-color:#6366f1; }

/* ── Timetable ── */
.tt-head { display:grid; grid-template-columns:100px 1fr 150px 100px 100px; gap:8px;
  padding:10px 4px; border-bottom:1px solid #334155; font-size:11px; font-weight:700;
  text-transform:uppercase; letter-spacing:0.5px; color:#64748b; margin-bottom:6px; }
.tt-row  { display:grid; grid-template-columns:100px 1fr 150px 100px 100px; gap:8px; margin-bottom:6px; align-items:center; }
.tt-period { font-size:13px; font-weight:700; color:#818cf8; font-family:'JetBrains Mono',monospace; }
.tt-cell-input { padding:9px 12px; background:#0f172a; border:1.5px solid #334155;
  border-radius:9px; font-size:13px; color:#f1f5f9; outline:none; font-family:'Outfit',sans-serif; width:100%; }
.tt-cell-input:focus { border-color:#6366f1; }
.time-in { font-family:'JetBrains Mono',monospace; }

/* ── Attendance ── */
.meta-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; margin-bottom:14px; }
.time-badge { background:#312e81; color:#a5b4fc; display:inline-block;
  border-radius:20px; padding:6px 16px; font-size:13px; font-weight:600; }
.att-controls { display:flex; justify-content:space-between; align-items:center;
  background:#1e293b; border:1px solid #334155; border-radius:12px; padding:14px 18px;
  margin-bottom:12px; flex-wrap:wrap; gap:10px; }
.att-summary { display:flex; gap:8px; flex-wrap:wrap; }
.sum-chip    { padding:6px 14px; border-radius:20px; font-size:13px; font-weight:600; }
.total-chip  { background:#334155; color:#94a3b8; padding:6px 14px; border-radius:20px; font-size:13px; font-weight:600; }
.mark-all   { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.mark-label { font-size:12px; color:#64748b; font-weight:600; }
.mark-btn   { padding:5px 12px; border-radius:8px; border:none; cursor:pointer;
  font-size:12px; font-weight:700; font-family:'Outfit',sans-serif; }
.att-thead  { display:grid; grid-template-columns:90px 1fr 100px 180px; gap:8px;
  padding:10px 16px; background:#334155; font-size:11px; font-weight:700;
  text-transform:uppercase; letter-spacing:0.5px; color:#94a3b8; }
.att-body   { max-height:480px; overflow-y:auto; }
.att-row    { display:grid; grid-template-columns:90px 1fr 100px 180px; gap:8px;
  padding:10px 16px; border-bottom:1px solid #1e293b; align-items:center; transition:background 0.1s; }
.att-row:hover { background:#334155; }
.att-absent { background:#1c0a0a !important; }
.att-absent:hover { background:#2d1010 !important; }
.att-od     { background:#1c1500 !important; }
.att-od:hover { background:#2d2000 !important; }
.st-btns { display:flex; gap:5px; }
.st-btn  { padding:5px 14px; border-radius:8px; background:#334155; border:none;
  color:#94a3b8; cursor:pointer; font-size:12px; font-weight:700;
  font-family:'Outfit',sans-serif; transition:all 0.12s; }
.st-btn:hover { background:#475569; color:#f1f5f9; }
.st-active { transform:scale(1.05); }
.saved-badge { background:#065f46; color:#34d399; border-radius:20px; padding:6px 16px; font-size:13px; font-weight:700; }

/* ── Records ── */
.rec-filters { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.rec-filters .search-box { flex:1; min-width:200px; margin-bottom:0; }
.rec-layout { display:grid; grid-template-columns:280px 1fr; gap:18px; }
.rec-list   { display:flex; flex-direction:column; gap:8px; max-height:640px; overflow-y:auto; }
.rec-card   { background:#1e293b; border:1px solid #334155; border-radius:12px;
  padding:14px 16px; cursor:pointer; transition:all 0.15s; }
.rec-card:hover { border-color:#475569; }
.rec-card-on { border-color:#6366f1 !important; background:#1e1b4b; }
.rec-top    { display:flex; justify-content:space-between; margin-bottom:4px; }
.rec-date   { font-size:12px; font-weight:700; color:#818cf8; font-family:'JetBrains Mono',monospace; }
.rec-period { font-size:11px; color:#64748b; }
.rec-subject { font-size:14px; font-weight:600; color:#f1f5f9; margin-bottom:2px; }
.rec-day    { font-size:12px; color:#64748b; margin-bottom:8px; }
.rec-stats  { display:flex; gap:10px; font-size:13px; font-weight:600; align-items:center; }
.pct-tag    { background:#334155; color:#94a3b8; border-radius:6px; padding:2px 8px; font-size:11px; margin-left:auto; }
.pct-low    { background:#450a0a; color:#f87171; }
.rec-detail { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:22px; overflow:hidden; }
.rec-meta   { display:flex; flex-direction:column; gap:6px; font-size:14px; color:#94a3b8; margin-bottom:16px; }
.rec-meta strong { color:#f1f5f9; }
.share-box  { background:#0f172a; border:1px solid #334155; border-radius:10px;
  padding:14px; max-height:240px; overflow-y:auto; margin-bottom:14px; }
.share-pre  { font-size:12px; color:#94a3b8; white-space:pre-wrap; font-family:'JetBrains Mono',monospace; line-height:1.6; }
.detail-list { max-height:260px; overflow-y:auto; border:1px solid #334155; border-radius:10px; overflow:hidden; }
.status-pill { border-radius:20px; padding:3px 12px; font-size:12px; font-weight:700; }

/* ── Toast ── */
.toast { position:fixed; top:20px; right:20px; padding:12px 22px; border-radius:12px;
  color:#fff; font-weight:600; font-size:14px; z-index:9999;
  box-shadow:0 8px 32px rgba(0,0,0,0.4); font-family:'Outfit',sans-serif; }
.spin { display:inline-block; animation:spin 0.8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

.empty-state { text-align:center; color:#475569; padding:40px 0; font-size:15px; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width:5px; height:5px; }
::-webkit-scrollbar-track { background:#0f172a; }
::-webkit-scrollbar-thumb { background:#334155; border-radius:3px; }
::-webkit-scrollbar-thumb:hover { background:#475569; }

@media (max-width:768px) {
  .rec-layout { grid-template-columns:1fr; }
  .att-thead, .att-row { grid-template-columns:70px 1fr 150px; }
  .att-thead span:nth-child(3), .att-row .stu-dept { display:none; }
  .page { padding:16px 14px 48px; }
  .tt-head, .tt-row { grid-template-columns:80px 1fr 100px 80px; }
  .tt-head span:nth-child(3), .tt-row input:nth-child(3) { display:none; }
}
`;
