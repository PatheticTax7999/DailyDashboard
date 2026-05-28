import { useState, useEffect, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ─── COLORS ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#0d0b14", card: "#13111f", card2: "#17142a", border: "#221d35", border2: "#2a2440",
  gold: "#f0c972", orange: "#e07b3f", green: "#6fcf97", purple: "#9180c4", red: "#ff6b6b",
  text: "#e8e3f8", muted: "#9991b8", dim: "#6b6485", faint: "#3d3657", veryfaint: "#221d35",
};

const uid = () => Math.random().toString(36).slice(2, 9);
const todayKey = () => new Date().toISOString().slice(0, 10);

// ─── OPEN FOOD FACTS API ───────────────────────────────────────────────────────
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

// ─── SEARCH OPEN FOOD FACTS BY NAME ────────────────────────────────────────────
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

    // Scan loop
    const scanInterval = setInterval(async () => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const ctx = canvasRef.current.getContext("2d");
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          // Using jsQR library (will need to add to index.html)
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

    // Mifflin-St Jeor equation for BMR
    let bmr;
    if (gender === "male") {
      bmr = 10 * w + 6.25 * h - 5 * a + 5;
    } else {
      bmr = 10 * w + 6.25 * h - 5 * a - 161;
    }

    // Activity multiplier
    const activityMult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryactive: 1.9 }[activity] || 1.55;
    let tdee = bmr * activityMult;

    // Adjust for goal
    if (goal === "deficit") tdee *= 0.85;
    if (goal === "surplus") tdee *= 1.1;

    // Calculate macros (using balanced approach: 30% protein, 35% fat, 35% carbs)
    const protein = (tdee * 0.3) / 4; // 4 kcal per g
    const fat = (tdee * 0.35) / 9; // 9 kcal per g
    const carbs = (tdee * 0.35) / 4; // 4 kcal per g

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

// ──────────────────────────────────────────────────────────────────────────────
// CALORIE & WATER TRACKER PAGE
// ──────────────────────────────────────────────────────────────────────────────
export function CalorieTrackerPage() {
  const [foods, setFoods] = useState([]);
  const [waterLog, setWaterLog] = useState([]);
  const [waterGoal, setWaterGoal] = useState(2000);
  const [waterUnit, setWaterUnit] = useState("liters"); // "liters" or "glasses"
  const [macroGoals, setMacroGoals] = useState({ tdee: 2000, protein: 120, fat: 70, carbs: 250 });
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showAICoach, setShowAICoach] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    async function load() {
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
    load();
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
            <span style={{ fontSize: 24, fontFamily: "'Bebas Neue',sans-serif", color: C.blue || C.gold }}>
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
            <div style({
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

export default CalorieTrackerPage;
