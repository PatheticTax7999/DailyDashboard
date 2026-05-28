import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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
const todayKey = () => new Date().toISOString().slice(0, 10);

async function stor(key, val) { try { await window.storage?.set?.(key, JSON.stringify(val)); } catch (_) {} }
async function load(key, fallback) { try { const r = await window.storage?.get?.(key); return r ? JSON.parse(r.value) : fallback; } catch (_) { return fallback; } }

// ─── FONTS ────────────────────────────────────────────────────────────────────
const Fonts = () => <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />;

// ─── COLORS ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#0d0b14", card: "#13111f", card2: "#17142a", border: "#221d35", border2: "#2a2440",
  gold: "#f0c972", orange: "#e07b3f", green: "#6fcf97", purple: "#9180c4", red: "#ff6b6b",
  text: "#e8e3f8", muted: "#9991b8", dim: "#6b6485", faint: "#3d3657", veryfaint: "#221d35",
};

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN FOOD FACTS API
// ═══════════════════════════════════════════════════════════════════════════════
async function searchOpenFoodFacts(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      return {
        name: data.product.product_name || "Unknown",
        kcal: data.product.nutriments?.["energy-kcal"] || data.product.nutriments?.["energy-kcal_100g"] || 0,
        protein: data.product.nutriments?.proteins_100g || 0,
        fat: data.product.nutriments?.fat_100g || 0,
        carbs: data.product.nutriments?.carbohydrates_100g || 0,
        servingSize: 100,
      };
    }
  } catch (e) { console.error("OpenFoodFacts error:", e); }
  return null;
}

async function searchOpenFoodFactsByName(query) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1`);
    const data = await res.json();
    if (data.products && data.products.length > 0) {
      return data.products.slice(0, 5).map(p => ({
        name: p.product_name || "Unknown",
        barcode: p.code,
        kcal: p.nutriments?.["energy-kcal_100g"] || 0,
        protein: p.nutriments?.proteins_100g || 0,
        fat: p.nutriments?.fat_100g || 0,
        carbs: p.nutriments?.carbohydrates_100g || 0,
        servingSize: 100,
      }));
    }
  } catch (e) { console.error("Search error:", e); }
  return [];
}

// ──────────────────────────────────────────────────────────────────────────────
// QR CODE SCANNER
// ──────────────────────────────────────────────────────────────────────────────
function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [scanningActive, setScanningActive] = useState(true);

  useEffect(() => {
    if (!scanningActive) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => videoRef.current.play();
        }
      } catch (err) {
        alert("Cannot access camera: " + err.message);
        onClose();
      }
    };

    startCamera();

    const scanInterval = setInterval(async () => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const ctx = canvasRef.current.getContext("2d");
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          if (window.jsQR) {
            const code = window.jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
              setScanningActive(false);
              clearInterval(scanInterval);
              onScan(code.data);
            }
          }
        } catch (e) {
          // Continue scanning
        }
      }
    }, 500);

    return () => {
      clearInterval(scanInterval);
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
    };
  }, [scanningActive, onScan, onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0d0b14dd", zIndex: 200,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ position: "relative", width: 300, height: 300, borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div style={{
          position: "absolute", inset: 0,
          border: `2px solid ${C.gold}`, borderRadius: 16,
          boxShadow: `inset 0 0 20px ${C.gold}33`,
        }} />
      </div>
      <div style={{ color: C.muted, fontSize: 14, marginBottom: 20, fontFamily: "'DM Mono',monospace" }}>
        Point camera at QR code
      </div>
      <button onClick={onClose} style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "10px 20px", color: C.gold,
        fontFamily: "'DM Mono',monospace", fontSize: 13, cursor: "pointer",
      }}>
        Close Scanner
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// AI COACH — MACRO CALCULATOR
// ──────────────────────────────────────────────────────────────────────────────
function AICoach({ onClose, onSaveGoals }) {
  const [step, setStep] = useState(1);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("male");
  const [activity, setActivity] = useState("moderate");
  const [goal, setGoal] = useState("maintenance");
  const [results, setResults] = useState(null);

  const calculateMacros = () => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseFloat(age);
    if (!w || !h || !a) return;

    let bmr;
    if (gender === "male") {
      bmr = 10 * w + 6.25 * h - 5 * a + 5;
    } else {
      bmr = 10 * w + 6.25 * h - 5 * a - 161;
    }

    const activityMult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryactive: 1.9 }[activity] || 1.55;
    let tdee = bmr * activityMult;

    if (goal === "deficit") tdee *= 0.85;
    if (goal === "surplus") tdee *= 1.1;

    const protein = (tdee * 0.3) / 4;
    const fat = (tdee * 0.35) / 9;
    const carbs = (tdee * 0.35) / 4;

    setResults({
      tdee: Math.round(tdee),
      protein: Math.round(protein),
      fat: Math.round(fat),
      carbs: Math.round(carbs),
    });
    setStep(3);
  };

  if (step === 3 && results) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#0d0b14dd", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 20,
          padding: 30, maxWidth: 400, width: "90%",
        }}>
          <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: C.gold, marginBottom: 20 }}>
            Your Daily Goals
          </h2>
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 20, marginBottom: 20,
          }}>
            <div style={{ marginBottom: 15 }}>
              <div style={{ color: C.dim, fontSize: 12, fontFamily: "'DM Mono',monospace" }}>DAILY CALORIES</div>
              <div style={{ fontSize: 28, color: C.gold, fontFamily: "'Bebas Neue',sans-serif" }}>
                {results.tdee} kcal
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{ textAlign: "center", background: C.card2, borderRadius: 8, padding: 10 }}>
                <div style={{ color: C.dim, fontSize: 10, fontFamily: "'DM Mono',monospace" }}>PROTEIN</div>
                <div style={{ fontSize: 18, color: C.gold }}>{results.protein}g</div>
              </div>
              <div style={{ textAlign: "center", background: C.card2, borderRadius: 8, padding: 10 }}>
                <div style={{ color: C.dim, fontSize: 10, fontFamily: "'DM Mono',monospace" }}>FAT</div>
                <div style={{ fontSize: 18, color: C.orange }}>{results.fat}g</div>
              </div>
              <div style={{ textAlign: "center", background: C.card2, borderRadius: 8, padding: 10 }}>
                <div style={{ color: C.dim, fontSize: 10, fontFamily: "'DM Mono',monospace" }}>CARBS</div>
                <div style={{ fontSize: 18, color: C.green }}>{results.carbs}g</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{
              flex: 1, background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 12, color: C.muted, fontFamily: "'DM Mono',monospace",
              fontSize: 13, cursor: "pointer",
            }}>
              Cancel
            </button>
            <button onClick={() => {
              onSaveGoals(results);
              onClose();
            }} style={{
              flex: 1, background: `linear-gradient(135deg,${C.gold},${C.orange})`,
              border: "none", borderRadius: 10, padding: 12, color: "#0d0b14",
              fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, cursor: "pointer",
            }}>
              Set Goals
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0d0b14dd", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 20,
        padding: 30, maxWidth: 400, width: "90%", maxHeight: "80vh", overflowY: "auto",
      }}>
        <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: C.gold, marginBottom: 20 }}>
          AI Coach Setup
        </h2>

        {step === 1 && (
          <div>
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: "block", color: C.dim, fontSize: 12, marginBottom: 5 }}>Weight (kg)</label>
              <input
                type="number"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="75"
                style={{
                  width: "100%", boxSizing: "border-box", background: C.card2,
                  border: `1px solid ${C.border}`, borderRadius: 8, padding: 10,
                  color: C.text, fontFamily: "'DM Mono',monospace", fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: "block", color: C.dim, fontSize: 12, marginBottom: 5 }}>Height (cm)</label>
              <input
                type="number"
                value={height}
                onChange={e => setHeight(e.target.value)}
                placeholder="180"
                style={{
                  width: "100%", boxSizing: "border-box", background: C.card2,
                  border: `1px solid ${C.border}`, borderRadius: 8, padding: 10,
                  color: C.text, fontFamily: "'DM Mono',monospace", fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: "block", color: C.dim, fontSize: 12, marginBottom: 5 }}>Age</label>
              <input
                type="number"
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="25"
                style={{
                  width: "100%", boxSizing: "border-box", background: C.card2,
                  border: `1px solid ${C.border}`, borderRadius: 8, padding: 10,
                  color: C.text, fontFamily: "'DM Mono',monospace", fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: "block", color: C.dim, fontSize: 12, marginBottom: 5 }}>Gender</label>
              <div style={{ display: "flex", gap: 10 }}>
                {["male", "female"].map(g => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    style={{
                      flex: 1, padding: 10, borderRadius: 8,
                      background: gender === g ? `linear-gradient(135deg,${C.gold},${C.orange})` : C.card2,
                      border: `1px solid ${gender === g ? C.gold : C.border}`,
                      color: gender === g ? "#0d0b14" : C.muted,
                      fontFamily: "'DM Mono',monospace", fontSize: 13, cursor: "pointer",
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setStep(2)} style={{
              width: "100%", background: `linear-gradient(135deg,${C.gold},${C.orange})`,
              border: "none", borderRadius: 10, padding: 12, color: "#0d0b14",
              fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, cursor: "pointer",
            }}>
              Next →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: "block", color: C.dim, fontSize: 12, marginBottom: 8 }}>Activity Level</label>
              {["sedentary", "light", "moderate", "active", "veryactive"].map(a => (
                <button
                  key={a}
                  onClick={() => setActivity(a)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", marginBottom: 8,
                    padding: 10, borderRadius: 8,
                    background: activity === a ? `linear-gradient(135deg,${C.gold},${C.orange})` : C.card2,
                    border: `1px solid ${activity === a ? C.gold : C.border}`,
                    color: activity === a ? "#0d0b14" : C.text,
                    fontFamily: "'DM Mono',monospace", fontSize: 12, cursor: "pointer",
                  }}
                >
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", color: C.dim, fontSize: 12, marginBottom: 8 }}>Goal</label>
              {["deficit", "maintenance", "surplus"].map(g => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", marginBottom: 8,
                    padding: 10, borderRadius: 8,
                    background: goal === g ? `linear-gradient(135deg,${C.gold},${C.orange})` : C.card2,
                    border: `1px solid ${goal === g ? C.gold : C.border}`,
                    color: goal === g ? "#0d0b14" : C.text,
                    fontFamily: "'DM Mono',monospace", fontSize: 12, cursor: "pointer",
                  }}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={{
                flex: 1, background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: 12, color: C.muted, fontFamily: "'DM Mono',monospace",
                fontSize: 13, cursor: "pointer",
              }}>
                ← Back
              </button>
              <button onClick={calculateMacros} style={{
                flex: 1, background: `linear-gradient(135deg,${C.green},#43b580)`,
                border: "none", borderRadius: 10, padding: 12, color: "#0d0b14",
                fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, cursor: "pointer",
              }}>
                Calculate →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// FOOD SEARCH & ADD MODAL
// ──────────────────────────────────────────────────────────────────────────────
function FoodSearchModal({ onAdd, onClose }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [selectedFood, setSelectedFood] = useState(null);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const res = await searchOpenFoodFactsByName(q);
    setResults(res);
    setSearching(false);
  };

  const addFood = () => {
    if (!selectedFood) return;
    const qty = parseFloat(quantity) || 1;
    onAdd({
      id: uid(),
      name: selectedFood.name,
      kcal: Math.round(selectedFood.kcal * qty),
      protein: Math.round(selectedFood.protein * qty * 10) / 10,
      fat: Math.round(selectedFood.fat * qty * 10) / 10,
      carbs: Math.round(selectedFood.carbs * qty * 10) / 10,
      quantity: qty,
      unit: "units",
      timestamp: Date.now(),
    });
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0d0b14dd", zIndex: 200,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        background: C.bg, border: `1px solid ${C.border2}`, borderRadius: "20px 20px 0 0",
        padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto",
      }}>
        <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: C.gold, marginBottom: 16 }}>
          Search Food
        </h3>
        <input
          autoFocus
          type="text"
          placeholder="Search by food name..."
          value={searchQuery}
          onChange={handleSearch}
          style={{
            width: "100%", boxSizing: "border-box", background: C.card2,
            border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
            color: C.text, fontFamily: "'DM Mono',monospace", fontSize: 14, marginBottom: 14,
          }}
        />

        {searching && <div style={{ color: C.muted, padding: 20, textAlign: "center" }}>Searching...</div>}

        {!searching && results.length === 0 && searchQuery && (
          <div style={{ color: C.faint, padding: 20, textAlign: "center" }}>No results found</div>
        )}

        {!searching && results.length > 0 && (
          <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
            {results.map(food => (
              <div
                key={food.barcode}
                onClick={() => setSelectedFood(food)}
                style={{
                  background: selectedFood?.barcode === food.barcode ? `${C.gold}22` : C.card2,
                  border: `1px solid ${selectedFood?.barcode === food.barcode ? C.gold : C.border}`,
                  borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer",
                }}
              >
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: C.text, marginBottom: 4 }}>
                  {food.name}
                </div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Mono',monospace" }}>
                  {Math.round(food.kcal)} kcal | P: {food.protein.toFixed(1)}g | F: {food.fat.toFixed(1)}g | C: {food.carbs.toFixed(1)}g
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedFood && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: C.dim, fontSize: 12, marginBottom: 8 }}>Quantity (servings)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", background: C.card2,
                border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
                color: C.text, fontFamily: "'DM Mono',monospace", fontSize: 14,
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 12, color: C.muted, fontFamily: "'DM Mono',monospace",
            fontSize: 13, cursor: "pointer",
          }}>
            Cancel
          </button>
          <button onClick={addFood} disabled={!selectedFood} style={{
            flex: 1, background: selectedFood ? `linear-gradient(135deg,${C.gold},${C.orange})` : C.card2,
            border: "none", borderRadius: 10, padding: 12, color: selectedFood ? "#0d0b14" : C.faint,
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, cursor: selectedFood ? "pointer" : "not-allowed",
          }}>
            Add Food
          </button>
        </div>
      </div>
    </div>
  );
}

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
              <span style={{ flex:1, fontSize:13, fontFamily:"'DM Mono',monospace", color:C.dim }}>{g.text}</span>
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

// ──────────────────────────────────────────────────────────────────────────────
// CALORIE & WATER TRACKER PAGE
// ──────────────────────────────────────────────────────────────────────────────
function CalorieTrackerPage() {
  const [foods, setFoods] = useState([]);
  const [waterLog, setWaterLog] = useState([]);
  const [waterGoal, setWaterGoal] = useState(2000);
  const [waterUnit, setWaterUnit] = useState("liters");
  const [macroGoals, setMacroGoals] = useState({ tdee: 2000, protein: 120, fat: 70, carbs: 250 });
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showAICoach, setShowAICoach] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    async function load_data() {
      try {
        const savedFoods = localStorage.getItem(`calorie_foods_${todayKey()}`) || "[]";
        const savedWater = localStorage.getItem(`water_log_${todayKey()}`) || "[]";
        const savedWaterGoal = localStorage.getItem("water_goal") || "2000";
        const savedWaterUnit = localStorage.getItem("water_unit") || "liters";
        const savedMacros = localStorage.getItem("macro_goals");

        setFoods(JSON.parse(savedFoods));
        setWaterLog(JSON.parse(savedWater));
        setWaterGoal(parseFloat(savedWaterGoal));
        setWaterUnit(savedWaterUnit);
        if (savedMacros) setMacroGoals(JSON.parse(savedMacros));
        setLoaded(true);
      } catch (e) { setLoaded(true); }
    }
    load_data();
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(`calorie_foods_${todayKey()}`, JSON.stringify(foods));
  }, [foods, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(`water_log_${todayKey()}`, JSON.stringify(waterLog));
  }, [waterLog, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("water_goal", waterGoal.toString());
    localStorage.setItem("water_unit", waterUnit);
  }, [waterGoal, waterUnit, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("macro_goals", JSON.stringify(macroGoals));
  }, [macroGoals, loaded]);

  // Calculate totals
  const totalKcal = foods.reduce((sum, f) => sum + f.kcal, 0);
  const totalProtein = foods.reduce((sum, f) => sum + f.protein, 0);
  const totalFat = foods.reduce((sum, f) => sum + f.fat, 0);
  const totalCarbs = foods.reduce((sum, f) => sum + f.carbs, 0);

  // Calculate water totals
  const totalWater = waterLog.reduce((sum, w) => sum + w.amount, 0);
  const waterInLiters = waterUnit === "glasses" ? totalWater * 0.25 : totalWater;
  const waterGoalInLiters = waterUnit === "glasses" ? waterGoal * 0.25 : waterGoal;
  const waterPercent = Math.min(100, (waterInLiters / waterGoalInLiters) * 100);

  const addFood = (food) => {
    setFoods(prev => [...prev, food]);
  };

  const removeFood = (id) => {
    setFoods(prev => prev.filter(f => f.id !== id));
  };

  const addDuplicateFood = (index) => {
    const food = { ...foods[index], id: uid() };
    setFoods(prev => [...prev, food]);
  };

  const addWater = (amount) => {
    setWaterLog(prev => [...prev, { id: uid(), amount, timestamp: Date.now() }]);
  };

  const removeWater = (id) => {
    setWaterLog(prev => prev.filter(w => w.id !== id));
  };

  const handleQRScan = async (barcode) => {
    setShowQRScanner(false);
    const food = await searchOpenFoodFacts(barcode);
    if (food) {
      addFood({
        id: uid(),
        ...food,
        quantity: 1,
        unit: "units",
        timestamp: Date.now(),
      });
    } else {
      alert("Food not found in database");
    }
  };

  const handleSaveMacroGoals = (goals) => {
    setMacroGoals(goals);
  };

  const getMacroPercent = (current, goal) => Math.min(100, (current / goal) * 100);

  return (
    <div style={{ padding: "24px 16px", maxWidth: 440, margin: "0 auto", paddingBottom: 100 }}>
      {showFoodSearch && (
        <FoodSearchModal onAdd={addFood} onClose={() => setShowFoodSearch(false)} />
      )}
      {showQRScanner && (
        <QRScanner onScan={handleQRScan} onClose={() => setShowQRScanner(false)} />
      )}
      {showAICoach && (
        <AICoach onClose={() => setShowAICoach(false)} onSaveGoals={handleSaveMacroGoals} />
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 34, color: C.text, letterSpacing: "0.04em", marginBottom: 8 }}>
          Nutrition & Water
        </div>
        <div style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono',monospace" }}>
          Track calories, macros, and hydration
        </div>
      </div>

      {/* AI Coach Button */}
      <button onClick={() => setShowAICoach(true)} style={{
        width: "100%", background: `linear-gradient(135deg,${C.purple},#5a4a8a)`,
        border: "none", borderRadius: 12, padding: 12, color: C.text,
        fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, cursor: "pointer", marginBottom: 16,
      }}>
        🤖 AI Coach Setup
      </button>

      {/* Daily Summary */}
      <div style={{
        background: C.card, border: `1px solid ${C.border2}`, borderRadius: 16,
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
          Daily Totals
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: C.gold }}>
              {totalKcal}
            </span>
            <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono',monospace" }}>
              / {macroGoals.tdee} kcal
            </span>
          </div>
          <div style={{ height: 8, background: "#1e1a30", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.min(100, (totalKcal / macroGoals.tdee) * 100)}%`,
              background: `linear-gradient(90deg,${C.gold},${C.orange})`,
              transition: "width 0.3s",
            }} />
          </div>
        </div>

        {/* Macro Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Protein", value: totalProtein, goal: macroGoals.protein, color: C.gold },
            { label: "Fat", value: totalFat, goal: macroGoals.fat, color: C.orange },
            { label: "Carbs", value: totalCarbs, goal: macroGoals.carbs, color: C.green },
          ].map((macro, i) => (
            <div key={i} style={{
              background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
            }}>
              <div style={{ fontSize: 10, color: C.dim, fontFamily: "'DM Mono',monospace", marginBottom: 6 }}>
                {macro.label}
              </div>
              <div style={{ fontSize: 16, color: macro.color, fontFamily: "'Bebas Neue',sans-serif", marginBottom: 4 }}>
                {macro.value.toFixed(0)}g
              </div>
              <div style={{ height: 4, background: "#0d0b14", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${getMacroPercent(macro.value, macro.goal)}%`,
                  background: macro.color,
                }} />
              </div>
              <div style={{ fontSize: 9, color: C.dim, marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
                {((getMacroPercent(macro.value, macro.goal)) / 100 * macro.goal).toFixed(0)}/{macro.goal}g
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Food Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setShowFoodSearch(true)} style={{
          background: `linear-gradient(135deg,${C.gold},${C.orange})`, border: "none",
          borderRadius: 10, padding: 14, color: "#0d0b14", fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 16, cursor: "pointer",
        }}>
          🔍 Search Food
        </button>
        <button onClick={() => setShowQRScanner(true)} style={{
          background: `linear-gradient(135deg,${C.green},#43b580)`, border: "none",
          borderRadius: 10, padding: 14, color: "#0d0b14", fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 16, cursor: "pointer",
        }}>
          📱 QR Code
        </button>
      </div>

      {/* Foods Log */}
      {foods.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase",
            marginBottom: 12, fontFamily: "'DM Mono',monospace",
          }}>
            Foods Consumed
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {foods.map((food, idx) => (
              <div key={food.id} style={{
                background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: C.text }}>
                      {food.name}
                    </div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                      {food.kcal} kcal
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => addDuplicateFood(idx)} style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: "4px 8px", color: C.gold,
                      fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, cursor: "pointer",
                    }}>
                      +
                    </button>
                    <button onClick={() => removeFood(food.id)} style={{
                      background: "none", border: "none", color: C.faint,
                      cursor: "pointer", fontSize: 16,
                    }}>
                      ×
                    </button>
                  </div>
                </div>
                <div style={{
                  fontSize: 10, color: C.dim, fontFamily: "'DM Mono',monospace",
                }}>
                  P: {food.protein.toFixed(1)}g | F: {food.fat.toFixed(1)}g | C: {food.carbs.toFixed(1)}g
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Water Tracker */}
      <div style={{
        background: C.card, border: `1px solid ${C.border2}`, borderRadius: 16,
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
          Hydration
        </div>

        {/* Water Goal Display */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 24, fontFamily: "'Bebas Neue',sans-serif", color: "#3ab4f2" }}>
              {waterInLiters.toFixed(1)} L
            </span>
            <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono',monospace" }}>
              / {waterGoalInLiters.toFixed(1)} L
            </span>
          </div>
          <div style={{ height: 8, background: "#1e1a30", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${waterPercent}%`,
              background: `linear-gradient(90deg,#7fb3ff,#4a90ff)`,
              transition: "width 0.3s",
            }} />
          </div>
        </div>

        {/* Water Unit Toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8,
          }}>
            <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: C.dim, textTransform: "uppercase" }}>
              Unit:
            </span>
            <button onClick={() => setWaterUnit(waterUnit === "liters" ? "glasses" : "liters")} style={{
              background: `linear-gradient(135deg,${C.gold},${C.orange})`, border: "none",
              borderRadius: 6, padding: "4px 10px", color: "#0d0b14",
              fontFamily: "'DM Mono',monospace", fontSize: 11, cursor: "pointer",
            }}>
              {waterUnit === "liters" ? "L" : "Glasses"}
            </button>
          </div>
        </div>

        {/* Quick Add Water */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: waterUnit === "liters" ? "250ml" : "1", amount: waterUnit === "liters" ? 0.25 : 1 },
            { label: waterUnit === "liters" ? "500ml" : "2", amount: waterUnit === "liters" ? 0.5 : 2 },
            { label: waterUnit === "liters" ? "1L" : "4", amount: waterUnit === "liters" ? 1 : 4 },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={() => addWater(btn.amount)}
              style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: 10, color: C.text,
                fontFamily: "'DM Mono',monospace", fontSize: 12, cursor: "pointer",
              }}
            >
              + {btn.label}
            </button>
          ))}
        </div>

        {/* Manual Water Goal Input */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={waterGoal}
            onChange={(e) => setWaterGoal(parseFloat(e.target.value) || 2000)}
            placeholder="Goal"
            style={{
              flex: 1, background: C.card2, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: 10, color: C.text, fontFamily: "'DM Mono',monospace",
              fontSize: 12,
            }}
          />
          <div style={{
            background: C.card2, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px", color: C.dim,
            fontFamily: "'DM Mono',monospace", fontSize: 12,
          }}>
            {waterUnit === "liters" ? "L" : "Glasses"}
          </div>
        </div>

        {/* Water Log */}
        {waterLog.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 10, color: C.dim, marginBottom: 10,
              fontFamily: "'DM Mono',monospace", textTransform: "uppercase",
            }}>
              Log
            </div>
            <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {waterLog.map(w => (
                <div key={w.id} style={{
                  background: "#1e1a30", borderRadius: 6, padding: "6px 10px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Mono',monospace" }}>
                    +{w.amount} {waterUnit === "liters" ? "L" : ""}
                  </span>
                  <button onClick={() => removeWater(w.id)} style={{
                    background: "none", border: "none", color: C.faint, cursor: "pointer",
                  }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
