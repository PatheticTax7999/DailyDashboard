import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CalorieTrackerPage } from "./CalorieTracker";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const HOUR_START = 6, HOUR_END = 24;
const KG_TO_LB = 2.20462;

// ─── UTILS ────────────────────────────────────────────────────────────────────
const getDayProgress = () => {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return Math.min(1, Math.max(0, (h - HOUR_START) / (HOUR_END - HOUR_START)));
};
const getTimeString = () => new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
const getDateString = () => new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
const getGreeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const fmtWeight = (kg, useLb) => useLb ? `${(kg * KG_TO_LB).toFixed(1)} lb` : `${kg} kg`;
const uid = () => Math.random().toString(36).slice(2, 9);

async function stor(key, val) { try { await window.storage.set(key, JSON.stringify(val)); } catch (_) {} }
async function load(key, fallback) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fallback; } catch (_) { return fallback; } }

// ─── FONTS ────────────────────────────────────────────────────────────────────
const Fonts = () => <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />;

// ─── COLORS ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#0d0b14", card: "#13111f", card2: "#17142a", border: "#221d35", border2: "#2a2440",
  gold: "#f0c972", orange: "#e07b3f", green: "#6fcf97", purple: "#9180c4",
  text: "#e8e3f8", muted: "#9991b8", dim: "#6b6485", faint: "#3d3657", veryfaint: "#221d35",
};

// ══════════════════════════════════════════════════════════════════════════════
// TIME WHEEL
// ══════════════════════════════════════════════════════════════════════════════
function TimeWheel({ progress }) {
  const size = 200, stroke = 12, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  const angle = progress * 360 - 90, rad = (angle * Math.PI) / 180;
  const cx = size / 2 + r * Math.cos(rad), cy = size / 2 + r * Math.sin(rad);
  return (
    <svg width={size} height={size} style={{ filter: "drop-shadow(0 0 16px #f0c97233)" }}>
      <defs>
        <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f0c972" /><stop offset="100%" stopColor="#e07b3f" />
        </linearGradient>
      </defs>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e1e2e" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#wg)" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: "stroke-dashoffset 1s ease" }} />
      {progress > 0.01 && <circle cx={cx} cy={cy} r={5} fill="#f0c972" style={{ filter: "drop-shadow(0 0 5px #f0c972)" }} />}
      <text x={size/2} y={size/2-12} textAnchor="middle" fill={C.gold} fontSize={24} fontFamily="'DM Serif Display',serif">{getTimeString()}</text>
      <text x={size/2} y={size/2+12} textAnchor="middle" fill={C.muted} fontSize={12} fontFamily="'DM Mono',monospace">{Math.round(progress*100)}% of day</text>
      <text x={size/2} y={size/2+30} textAnchor="middle" fill={C.dim} fontSize={10} fontFamily="'DM Mono',monospace">{HOUR_START}:00 → {HOUR_END}:00</text>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GOAL BAR
// ══════════════════════════════════════════════════════════════════════════════
function GoalBar({ done, total }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:11, fontFamily:"'DM Mono',monospace", color:C.dim, letterSpacing:"0.08em" }}>
        <span>GOALS COMPLETE</span>
        <span style={{ color: pct===100 ? C.green : C.gold }}>{done}/{total} — {pct}%</span>
      </div>
      <div style={{ height:6, background:"#1e1e2e", borderRadius:99, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background: pct===100 ? `linear-gradient(90deg,${C.green},#43b580)` : `linear-gradient(90deg,${C.gold},${C.orange})`, borderRadius:99, transition:"width 0.5s ease", boxShadow: pct===100 ? "0 0 8px #6fcf9799" : "0 0 8px #f0c97266" }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 1 — DAILY DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function DailyPage() {
  const [progress, setProgress] = useState(getDayProgress());
  const [todayGoals, setTodayGoals] = useState([]);
  const [tomorrowGoals, setTomorrowGoals] = useState([]);
  const [newToday, setNewToday] = useState("");
  const [newTomorrow, setNewTomorrow] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function init() {
      const savedDate = await load("dash_date", null);
      const today = new Date().toDateString();
      let tg = await load("dash_today", []);
      let tmr = await load("dash_tomorrow", []);
      if (savedDate && savedDate !== today && tmr.length > 0) {
        tg = [...tg.filter(g=>!g.done), ...tmr.map(g=>({...g,done:false}))];
        tmr = [];
        await stor("dash_today", tg); await stor("dash_tomorrow", tmr);
      }
      await stor("dash_date", today);
      setTodayGoals(tg); setTomorrowGoals(tmr); setLoaded(true);
    }
    init();
    const t = setInterval(() => setProgress(getDayProgress()), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { if (loaded) stor("dash_today", todayGoals); }, [todayGoals, loaded]);
  useEffect(() => { if (loaded) stor("dash_tomorrow", tomorrowGoals); }, [tomorrowGoals, loaded]);

  const addGoal = (which) => {
    const v = which === "today" ? newToday.trim() : newTomorrow.trim();
    if (!v) return;
    const g = { id: uid(), text: v, done: false };
    if (which === "today") { setTodayGoals(x => [...x, g]); setNewToday(""); }
    else { setTomorrowGoals(x => [...x, g]); setNewTomorrow(""); }
  };

  const inp = (extra={}) => ({ background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontFamily:"'DM Mono',monospace", fontSize:13, outline:"none", flex:1, ...extra });
  const btn = (grad) => ({ background:grad, border:"none", borderRadius:8, padding:"9px 16px", color:"#1a1625", fontWeight:700, fontFamily:"'DM Mono',monospace", fontSize:14, cursor:"pointer" });

  return (
    <div style={{ padding:"32px 16px", maxWidth:420, margin:"0 auto" }}>
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:11, color:C.dim, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:4 }}>{getDateString()}</div>
        <div style={{ fontSize:26, fontFamily:"'DM Serif Display',serif", color:C.text }}>{getGreeting()}</div>
      </div>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:28 }}><TimeWheel progress={progress} /></div>

      {/* Today */}
      <div style={{ background:C.card, border:`1px solid ${C.border2}`, borderRadius:16, padding:"20px 20px 16px", marginBottom:14 }}>
        <div style={{ fontSize:11, letterSpacing:"0.12em", color:C.dim, marginBottom:12, textTransform:"uppercase" }}>Today's Goals</div>
        <GoalBar done={todayGoals.filter(g=>g.done).length} total={todayGoals.length} />
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <input style={inp()} placeholder="Add a goal..." value={newToday} onChange={e=>setNewToday(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addGoal("today")} />
          <button style={btn(`linear-gradient(135deg,${C.gold},${C.orange})`)} onClick={()=>addGoal("today")}>+</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {todayGoals.length===0 && <div style={{ color:C.faint, fontSize:12, textAlign:"center", padding:"10px 0" }}>No goals yet</div>}
          {todayGoals.map(g => (
            <div key={g.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#1e1a30", borderRadius:10, padding:"9px 12px", border:`1px solid ${g.done?"#6fcf9733":C.border}`, transition:"border 0.3s" }}>
              <div onClick={()=>setTodayGoals(x=>x.map(i=>i.id===g.id?{...i,done:!i.done}:i))} style={{ width:17,height:17,borderRadius:4,border:`2px solid ${g.done?C.green:C.faint}`,background:g.done?C.green:"transparent",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s" }}>
                {g.done && <span style={{ color:"#17132a", fontSize:10, fontWeight:900 }}>✓</span>}
              </div>
              <span style={{ flex:1, fontSize:13, color:g.done?C.faint:C.text, textDecoration:g.done?"line-through":"none", transition:"all 0.2s" }}>{g.text}</span>
              <span onClick={()=>setTodayGoals(x=>x.filter(i=>i.id!==g.id))} style={{ color:C.faint, cursor:"pointer", fontSize:16 }}>×</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tomorrow */}
      <div style={{ background:"#13111f", border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 20px 16px" }}>
        <div style={{ fontSize:11, letterSpacing:"0.12em", color:C.faint, marginBottom:4, textTransform:"uppercase" }}>Tomorrow's Goals</div>
        <div style={{ fontSize:11, color:"#2e2845", marginBottom:12 }}>Auto-rolls into today at midnight</div>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <input style={inp({ background:"#17132a", borderColor:C.border })} placeholder="Plan ahead..." value={newTomorrow} onChange={e=>setNewTomorrow(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addGoal("tomorrow")} />
          <button style={btn(`linear-gradient(135deg,${C.purple},#5a4a8a)`)} onClick={()=>addGoal("tomorrow")}>+</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {tomorrowGoals.length===0 && <div style={{ color:"#2e2845", fontSize:12, textAlign:"center", padding:"10px 0" }}>Nothing queued</div>}
          {tomorrowGoals.map(g => (
            <div key={g.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#17132a", borderRadius:10, padding:"9px 12px", border:`1px solid ${C.border}` }}>
              <div style={{ width:17, height:17, borderRadius:4, border:`2px solid #2e2845`, flexShrink:0 }} />
              <span style={{ flex:1, fontSize:13, color:C.dim }}>{g.text}</span>
              <span onClick={()=>setTomorrowGoals(x=>x.filter(i=>i.id!==g.id))} style={{ color:"#2e2845", cursor:"pointer", fontSize:16 }}>×</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EXERCISE GRAPH
// ══════════════════════════════════════════════════════════════════════════════
function ExerciseGraph({ history, useLb }) {
  if (!history || history.length < 2) return (
    <div style={{ height:80, display:"flex", alignItems:"center", justifyContent:"center", color:C.faint, fontSize:12, fontFamily:"'DM Mono',monospace" }}>
      Log more sessions to see progress
    </div>
  );
  const data = history.map((h, i) => ({ session: i + 1, weight: useLb ? parseFloat((h.weight * KG_TO_LB).toFixed(1)) : h.weight, date: h.date }));
  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top:6, right:8, left:-20, bottom:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1a30" />
        <XAxis dataKey="session" tick={{ fill:C.faint, fontSize:10, fontFamily:"'DM Mono',monospace" }} />
        <YAxis tick={{ fill:C.faint, fontSize:10, fontFamily:"'DM Mono',monospace" }} />
        <Tooltip
          contentStyle={{ background:"#17142a", border:`1px solid ${C.border2}`, borderRadius:8, fontFamily:"'DM Mono',monospace", fontSize:12 }}
          labelStyle={{ color:C.muted }} itemStyle={{ color:C.gold }}
          formatter={(v) => [`${v} ${useLb?"lb":"kg"}`, "Top weight"]}
          labelFormatter={(i) => `Session ${i}`}
        />
        <Line type="monotone" dataKey="weight" stroke={C.gold} strokeWidth={2} dot={{ fill:C.gold, r:3 }} activeDot={{ r:5, fill:C.orange }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTIVE WORKOUT SESSION
// ══════════════════════════════════════════════════════════════════════════════
function WorkoutSession({ routine, useLb, onFinish, exerciseHistory, setExerciseHistory, setUseLb }) {
  const [current, setCurrent] = useState(0);
  const [sets, setSets] = useState(() => routine.exercises.map(() => [{ weight: "", reps: "" }]));
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const updateSet = (exIdx, setIdx, field, val) => {
    setSets(prev => {
      const next = prev.map(s => [...s]);
      next[exIdx] = next[exIdx].map((s, i) => i === setIdx ? { ...s, [field]: val } : s);
      return next;
    });
  };

  const addSet = (exIdx) => setSets(prev => { const n = prev.map(s=>[...s]); n[exIdx] = [...n[exIdx], {weight:"",reps:""}]; return n; });
  const removeSet = (exIdx, setIdx) => setSets(prev => { const n = prev.map(s=>[...s]); if(n[exIdx].length>1) n[exIdx]=n[exIdx].filter((_,i)=>i!==setIdx); return n; });

  const finishWorkout = () => {
    const dateStr = new Date().toLocaleDateString("en-AU", { day:"numeric", month:"short" });
    const newHistory = { ...exerciseHistory };
    routine.exercises.forEach((ex, i) => {
      const validSets = sets[i].filter(s => s.weight !== "" && s.reps !== "");
      if (validSets.length === 0) return;
      const topWeight = Math.max(...validSets.map(s => parseFloat(s.weight) || 0));
      if (!newHistory[ex.name]) newHistory[ex.name] = [];
      newHistory[ex.name] = [...newHistory[ex.name], { weight: topWeight, reps: validSets[0].reps, date: dateStr }];
    });
    setExerciseHistory(newHistory);
    stor("fit_exercise_history", newHistory);
    setDone(true);
  };

  if (done) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:400, gap:16, padding:32 }}>
      <div style={{ fontSize:56 }}>🏆</div>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:36, color:C.gold, letterSpacing:"0.05em" }}>Workout Complete</div>
      <div style={{ color:C.muted, fontFamily:"'DM Mono',monospace", fontSize:14 }}>Duration: {fmt(elapsed)}</div>
      <button onClick={onFinish} style={{ marginTop:16, background:`linear-gradient(135deg,${C.gold},${C.orange})`, border:"none", borderRadius:12, padding:"14px 32px", color:"#0d0b14", fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:"0.05em", cursor:"pointer" }}>
        Back to Routines
      </button>
    </div>
  );

  const ex = routine.exercises[current];
  const exSets = sets[current];

  return (
    <div style={{ padding:"20px 16px", maxWidth:440, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:C.gold, letterSpacing:"0.05em" }}>{routine.name}</div>
          <div style={{ fontSize:11, color:C.dim, fontFamily:"'DM Mono',monospace" }}>⏱ {fmt(elapsed)}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {/* Weight unit toggle during workout */}
          <div style={{ display:"flex", alignItems:"center", gap:4, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"4px 8px" }}>
            <button onClick={() => setUseLb(false)} style={{ background:"none", border:"none", color:!useLb?C.gold:C.faint, fontFamily:"'DM Mono',monospace", fontSize:11, cursor:"pointer", fontWeight:700 }}>KG</button>
            <div style={{ width:20, height:12, background:useLb?C.gold:"#2a2440", borderRadius:99, position:"relative", cursor:"pointer", transition:"background 0.2s" }} onClick={() => setUseLb(x=>!x)}>
              <div style={{ position:"absolute", top:1, left:useLb?9:1, width:10, height:10, borderRadius:99, background:useLb?"#0d0b14":C.muted, transition:"left 0.2s" }} />
            </div>
            <button onClick={() => setUseLb(true)} style={{ background:"none", border:"none", color:useLb?C.gold:C.faint, fontFamily:"'DM Mono',monospace", fontSize:11, cursor:"pointer", fontWeight:700 }}>LB</button>
          </div>
          <button onClick={finishWorkout} style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 16px", color:C.green, fontFamily:"'DM Mono',monospace", fontSize:12, cursor:"pointer" }}>
            Finish ✓
          </button>
        </div>
      </div>

      {/* Exercise nav pills */}
      <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:20, paddingBottom:4 }}>
        {routine.exercises.map((ex2, i) => (
          <button key={i} onClick={() => setCurrent(i)} style={{ flexShrink:0, background: i===current ? `linear-gradient(135deg,${C.gold},${C.orange})` : C.card, border:`1px solid ${i===current?C.gold:C.border}`, borderRadius:20, padding:"6px 14px", color: i===current?"#0d0b14":C.muted, fontFamily:"'DM Mono',monospace", fontSize:11, cursor:"pointer", whiteSpace:"nowrap" }}>
            {ex2.name}
          </button>
        ))}
      </div>

      {/* Current exercise card */}
      <div style={{ background:C.card, border:`1px solid ${C.border2}`, borderRadius:16, padding:"20px", marginBottom:14 }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:C.text, letterSpacing:"0.04em", marginBottom:4 }}>{ex.name}</div>
        {ex.notes && <div style={{ fontSize:11, color:C.dim, fontFamily:"'DM Mono',monospace", marginBottom:14 }}>{ex.notes}</div>}

        {/* Set rows */}
        <div style={{ display:"grid", gridTemplateColumns:"32px 1fr 1fr 32px", gap:6, marginBottom:10, alignItems:"center" }}>
          <div style={{ fontSize:10, color:C.faint, fontFamily:"'DM Mono',monospace", textAlign:"center" }}>SET</div>
          <div style={{ fontSize:10, color:C.faint, fontFamily:"'DM Mono',monospace", textAlign:"center" }}>WEIGHT ({useLb?"lb":"kg"})</div>
          <div style={{ fontSize:10, color:C.faint, fontFamily:"'DM Mono',monospace", textAlign:"center" }}>REPS</div>
          <div />
          {exSets.map((s, si) => (
            <>
              <div key={`l${si}`} style={{ textAlign:"center", fontFamily:"'DM Mono',monospace", fontSize:13, color:C.dim }}>{si+1}</div>
              <input key={`w${si}`} type="number" value={s.weight} onChange={e=>updateSet(current,si,"weight",e.target.value)}
                placeholder="0" style={{ background:"#1e1a30", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px", color:C.text, fontFamily:"'DM Mono',monospace", fontSize:14, textAlign:"center", outline:"none", width:"100%" }} />
              <input key={`r${si}`} type="number" value={s.reps} onChange={e=>updateSet(current,si,"reps",e.target.value)}
                placeholder="0" style={{ background:"#1e1a30", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px", color:C.text, fontFamily:"'DM Mono',monospace", fontSize:14, textAlign:"center", outline:"none", width:"100%" }} />
              <button key={`x${si}`} onClick={()=>removeSet(current,si)} style={{ background:"none", border:"none", color:C.faint, cursor:"pointer", fontSize:16, fontFamily:"'DM Mono',monospace" }}>×</button>
            </>
          ))}
        </div>
        <button onClick={()=>addSet(current)} style={{ background:C.card2, border:`1px dashed ${C.border}`, borderRadius:8, padding:"7px 0", color:C.muted, fontFamily:"'DM Mono',monospace", fontSize:12, cursor:"pointer", width:"100%" }}>
          + Add Set
        </button>
      </div>

      {/* Prev button */}
      <div style={{ display:"flex", gap:8 }}>
        {current > 0 && <button onClick={()=>setCurrent(c=>c-1)} style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px", color:C.muted, fontFamily:"'DM Mono',monospace", fontSize:13, cursor:"pointer" }}>← Prev</button>}
        {current < routine.exercises.length - 1
          ? <button onClick={()=>setCurrent(c=>c+1)} style={{ flex:1, background:`linear-gradient(135deg,${C.gold},${C.orange})`, border:"none", borderRadius:12, padding:"12px", color:"#0d0b14", fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:"0.04em", cursor:"pointer" }}>Next →</button>
          : <button onClick={finishWorkout} style={{ flex:1, background:`linear-gradient(135deg,${C.green},#43b580)`, border:"none", borderRadius:12, padding:"12px", color:"#0d0b14", fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:"0.04em", cursor:"pointer" }}>Finish ✓</button>
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTINE EDITOR MODAL
// ══════════════════════════════════════════════════════════════════════════════
function RoutineEditor({ routine, onSave, onCancel }) {
  const [name, setName] = useState(routine?.name || "");
  const [exercises, setExercises] = useState(routine?.exercises || []);
  const [newEx, setNewEx] = useState("");

  const addEx = () => { if (!newEx.trim()) return; setExercises(x=>[...x,{id:uid(),name:newEx.trim(),notes:""}]); setNewEx(""); };
  const removeEx = (id) => setExercises(x=>x.filter(e=>e.id!==id));
  const updateNotes = (id, notes) => setExercises(x=>x.map(e=>e.id===id?{...e,notes}:e));

  const inpS = { background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontFamily:"'DM Mono',monospace", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0d0b14cc", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:C.bg, border:`1px solid ${C.border2}`, borderRadius:"20px 20px 0 0", padding:"24px 20px", width:"100%", maxWidth:480, maxHeight:"80vh", overflowY:"auto" }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:C.gold, letterSpacing:"0.05em", marginBottom:16 }}>
          {routine ? "Edit Routine" : "New Routine"}
        </div>
        <input style={{ ...inpS, marginBottom:14 }} placeholder="Routine name (e.g. Push Day)" value={name} onChange={e=>setName(e.target.value)} />
        <div style={{ fontSize:11, color:C.dim, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Exercises</div>
        {exercises.map(ex => (
          <div key={ex.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px", marginBottom:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:C.text }}>{ex.name}</span>
              <span onClick={()=>removeEx(ex.id)} style={{ color:C.faint, cursor:"pointer", fontSize:16 }}>×</span>
            </div>
            <input style={{ ...inpS, fontSize:12, padding:"6px 10px" }} placeholder="Notes (optional, e.g. 4×8, tempo 3-1-3)" value={ex.notes} onChange={e=>updateNotes(ex.id,e.target.value)} />
          </div>
        ))}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <input style={inpS} placeholder="Add exercise..." value={newEx} onChange={e=>setNewEx(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEx()} />
          <button onClick={addEx} style={{ background:`linear-gradient(135deg,${C.gold},${C.orange})`, border:"none", borderRadius:8, padding:"9px 16px", color:"#0d0b14", fontWeight:700, fontFamily:"'DM Mono',monospace", fontSize:14, cursor:"pointer" }}>+</button>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, background:C.card2, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px", color:C.muted, fontFamily:"'DM Mono',monospace", fontSize:13, cursor:"pointer" }}>Cancel</button>
          <button onClick={()=>{ if(!name.trim()||exercises.length===0) return; onSave({id:routine?.id||uid(), name:name.trim(), exercises}); }} style={{ flex:1, background:`linear-gradient(135deg,${C.gold},${C.orange})`, border:"none", borderRadius:12, padding:"12px", color:"#0d0b14", fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:"0.04em", cursor:"pointer" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 2 — FITNESS
// ══════════════════════════════════════════════════════════════════════════════
function FitnessPage() {
  const [routines, setRoutines] = useState([]);
  const [exerciseHistory, setExerciseHistory] = useState({});
  const [useLb, setUseLb] = useState(false);
  const [activeRoutine, setActiveRoutine] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | routine obj
  const [expandedEx, setExpandedEx] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function init() {
      const r = await load("fit_routines", []);
      const h = await load("fit_exercise_history", {});
      const lb = await load("fit_use_lb", false);
      setRoutines(r); setExerciseHistory(h); setUseLb(lb); setLoaded(true);
    }
    init();
  }, []);

  useEffect(() => { if (loaded) stor("fit_routines", routines); }, [routines, loaded]);
  useEffect(() => { if (loaded) stor("fit_use_lb", useLb); }, [useLb, loaded]);

  const saveRoutine = (r) => {
    setRoutines(prev => { const exists = prev.find(x=>x.id===r.id); return exists ? prev.map(x=>x.id===r.id?r:x) : [...prev, r]; });
    setEditing(null);
  };
  const deleteRoutine = (id) => setRoutines(prev => prev.filter(r=>r.id!==id));

  // All unique exercises across all routines
  const allExercises = [...new Set(routines.flatMap(r => r.exercises.map(e => e.name)))];

  if (activeRoutine) return (
    <WorkoutSession
      routine={activeRoutine} useLb={useLb} setUseLb={setUseLb}
      onFinish={() => setActiveRoutine(null)}
      exerciseHistory={exerciseHistory} setExerciseHistory={setExerciseHistory}
    />
  );

  return (
    <div style={{ padding:"24px 16px", maxWidth:440, margin:"0 auto" }}>
      {editing && (
        <RoutineEditor
          routine={editing==="new"?null:editing}
          onSave={saveRoutine}
          onCancel={()=>setEditing(null)}
        />
      )}

      {/* Header + settings */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:C.text, letterSpacing:"0.04em", lineHeight:1 }}>Fitness</div>
          <div style={{ fontSize:12, color:C.dim, fontFamily:"'DM Mono',monospace" }}>Track. Lift. Progress.</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px" }}>
          <span style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color: !useLb ? C.gold : C.dim, cursor:"pointer" }} onClick={()=>setUseLb(false)}>KG</span>
          <div onClick={()=>setUseLb(x=>!x)} style={{ width:32, height:18, background:useLb?C.gold:"#2a2440", borderRadius:99, position:"relative", cursor:"pointer", transition:"background 0.2s" }}>
            <div style={{ position:"absolute", top:2, left:useLb?14:2, width:14, height:14, borderRadius:99, background:useLb?"#0d0b14":C.muted, transition:"left 0.2s" }} />
          </div>
          <span style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color: useLb ? C.gold : C.dim, cursor:"pointer" }} onClick={()=>setUseLb(true)}>LB</span>
        </div>
      </div>

      {/* Routines */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontSize:11, color:C.dim, letterSpacing:"0.12em", textTransform:"uppercase", fontFamily:"'DM Mono',monospace" }}>Your Routines</div>
        <button onClick={()=>setEditing("new")} style={{ background:`linear-gradient(135deg,${C.gold},${C.orange})`, border:"none", borderRadius:8, padding:"6px 14px", color:"#0d0b14", fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.05em", cursor:"pointer" }}>+ New</button>
      </div>

      {routines.length === 0 && (
        <div style={{ background:C.card, border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 20px", textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🏋️</div>
          <div style={{ color:C.faint, fontFamily:"'DM Mono',monospace", fontSize:13 }}>No routines yet — create your first one</div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
        {routines.map(r => (
          <div key={r.id} style={{ background:C.card, border:`1px solid ${C.border2}`, borderRadius:14, overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:C.text, letterSpacing:"0.04em" }}>{r.name}</div>
                <div style={{ fontSize:11, color:C.dim, fontFamily:"'DM Mono',monospace" }}>{r.exercises.length} exercise{r.exercises.length!==1?"s":""}</div>
              </div>
              <button onClick={()=>setEditing(r)} style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", color:C.muted, fontFamily:"'DM Mono',monospace", fontSize:11, cursor:"pointer" }}>Edit</button>
              <button onClick={()=>deleteRoutine(r.id)} style={{ background:"none", border:"none", color:C.faint, fontFamily:"'DM Mono',monospace", fontSize:16, cursor:"pointer" }}>×</button>
            </div>
            <div style={{ padding:"0 16px 14px", display:"flex", gap:6, flexWrap:"wrap" }}>
              {r.exercises.map(ex => (
                <span key={ex.id} style={{ background:"#1e1a30", borderRadius:6, padding:"3px 8px", fontSize:11, color:C.muted, fontFamily:"'DM Mono',monospace" }}>{ex.name}</span>
              ))}
            </div>
            <button onClick={()=>setActiveRoutine(r)} style={{ width:"100%", background:`linear-gradient(90deg,${C.gold}22,${C.orange}22)`, border:"none", borderTop:`1px solid ${C.border}`, padding:"12px", color:C.gold, fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:"0.06em", cursor:"pointer" }}>
              START WORKOUT →
            </button>
          </div>
        ))}
      </div>

      {/* Progress section */}
      {allExercises.length > 0 && (
        <>
          <div style={{ fontSize:11, color:C.dim, letterSpacing:"0.12em", textTransform:"uppercase", fontFamily:"'DM Mono',monospace", marginBottom:12 }}>Progressive Overload</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {allExercises.map(name => {
              const hist = exerciseHistory[name] || [];
              const best = hist.length > 0 ? Math.max(...hist.map(h=>h.weight)) : null;
              const isOpen = expandedEx === name;
              return (
                <div key={name} style={{ background:C.card, border:`1px solid ${C.border2}`, borderRadius:14, overflow:"hidden" }}>
                  <div onClick={()=>setExpandedEx(isOpen?null:name)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", cursor:"pointer" }}>
                    <div>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:C.text }}>{name}</div>
                      <div style={{ fontSize:11, color:C.dim, fontFamily:"'DM Mono',monospace", marginTop:2 }}>
                        {hist.length} session{hist.length!==1?"s":""}
                        {best !== null && <span style={{ color:C.gold, marginLeft:8 }}>Best: {fmtWeight(best, useLb)}</span>}
                      </div>
                    </div>
                    <span style={{ color:C.faint, fontSize:14, fontFamily:"'DM Mono',monospace" }}>{isOpen?"▲":"▼"}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding:"0 16px 16px" }}>
                      <ExerciseGraph history={hist} useLb={useLb} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP — TAB NAV
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("daily");

  const tabBtn = (id, label, icon) => (
    <button onClick={()=>setTab(id)} style={{
      flex:1, background:"none", border:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:3,
      padding:"10px 0", cursor:"pointer",
      color: tab===id ? C.gold : C.faint,
      fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"0.08em", textTransform:"uppercase",
      borderTop: tab===id ? `2px solid ${C.gold}` : "2px solid transparent",
      transition:"all 0.2s",
    }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.text }}>
      <Fonts />
      <div style={{ paddingBottom:80 }}>
        {tab === "daily" ? <DailyPage /> : tab === "fitness" ? <FitnessPage /> : <CalorieTrackerPage />}
      </div>
      {/* Bottom tab bar */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:`${C.bg}ee`, borderTop:`1px solid ${C.border}`, display:"flex", backdropFilter:"blur(12px)", zIndex:50 }}>
        {tabBtn("daily", "Daily", "🗓")}
        {tabBtn("fitness", "Fitness", "🏋️")}
        {tabBtn("nutrition", "Nutrition", "🍽")}
      </div>
    </div>
  );
}
