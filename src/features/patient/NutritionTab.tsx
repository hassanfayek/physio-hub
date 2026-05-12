// FILE: src/features/patient/NutritionTab.tsx
// Nutrition plan tab — Dr. Shehab Kamal template with per-patient quantity scaling

import { useState, useEffect, useCallback } from "react";
import { Printer, ChevronDown, ChevronUp, Edit2, Save, X, RotateCcw } from "lucide-react";
import {
  getNutritionProfile,
  saveNutritionProfile,
  DEFAULT_NUTRITION_PROFILE,
  type NutritionProfile,
  type NutritionGoal,
  type ActivityLevel,
  type CarbChoice,
  type Meal3ProteinChoice,
} from "../../services/nutritionService";

// ─── Plan Template ────────────────────────────────────────────────────────────

const BASE_WEIGHT_KG = 75;

type ScaleType = "protein" | "carb" | "dairy" | "egg" | "fixed";

interface FoodItem {
  id:          string;
  label:       string;
  baseQty:     number;
  unit:        string;
  scaleType:   ScaleType;
  note?:       string;
  carbGuard?:  CarbChoice;         // only show when carbChoice matches
  meal3Guard?: Meal3ProteinChoice;  // only show when meal3Choice matches
  overridable: boolean;
}

interface MealDef {
  id:    string;
  label: string;
  time:  string;
  items: FoodItem[];
  tips:  string[];
}

const MEALS: MealDef[] = [
  {
    id:    "meal1",
    label: "First Meal",
    time:  "~1:00 PM",
    tips: [
      "Cook without oil — use cooking spray or a dry non-stick pan",
      "Can add: mushroom, green onion, zaatar, black seed, cumin in any amount",
      "Small drizzle of olive oil on salad is allowed",
    ],
    items: [
      {
        id: "eggs", label: "Eggs (boiled or omelet)",
        baseQty: 3, unit: "eggs", scaleType: "egg", overridable: true,
        note: "Cook without oil or ghee",
      },
      {
        id: "bran_bread", label: "Bran Bread",
        baseQty: 30, unit: "g", scaleType: "fixed", overridable: true,
      },
      {
        id: "fresh_cheese", label: "Fresh Cheese",
        baseQty: 150, unit: "g", scaleType: "dairy", overridable: true,
        note: "Can add cream cheese, zaatar, black seed, cumin",
      },
      {
        id: "salad1", label: "Green Salad",
        baseQty: 0, unit: "free", scaleType: "fixed", overridable: false,
        note: "Tomatoes, cucumber, lettuce, rocket, parsley — unlimited",
      },
      {
        id: "fruit1", label: "Fruit",
        baseQty: 0, unit: "1 piece", scaleType: "fixed", overridable: false,
        note: "See allowed fruits in guidelines",
      },
    ],
  },
  {
    id:    "meal2",
    label: "Second Meal",
    time:  "5:00 – 7:00 PM",
    tips: [
      "Weigh protein AFTER cooking — no oil or ghee when cooking",
      "Carbs weighed after cooking as well",
    ],
    items: [
      {
        id: "protein2", label: "Animal Protein",
        baseQty: 200, unit: "g", scaleType: "protein", overridable: true,
        note: "Chicken breast / thigh fillet / shish tawook / smoked fish — weight after cooking",
      },
      {
        id: "rice", label: "Rice (white or brown)",
        baseQty: 100, unit: "g", scaleType: "carb", overridable: true,
        carbGuard: "rice", note: "Weight after cooking",
      },
      {
        id: "potatoes", label: "Potatoes",
        baseQty: 150, unit: "g", scaleType: "carb", overridable: true,
        carbGuard: "potatoes", note: "Boiled, mashed, or grilled — weight after cooking",
      },
      {
        id: "veg2", label: "Sautéed / Grilled Vegetables",
        baseQty: 150, unit: "g", scaleType: "fixed", overridable: true,
        note: "With tomato sauce, no oil — beans, spinach, broccoli, zucchini, eggplant, peas, carrots",
      },
      {
        id: "salad2", label: "Green Salad",
        baseQty: 0, unit: "free", scaleType: "fixed", overridable: false,
        note: "Unlimited",
      },
    ],
  },
  {
    id:    "meal3",
    label: "Third Meal",
    time:  "11:00 PM – 12:00 AM",
    tips: [
      "Can add small drizzle of olive oil to salad",
    ],
    items: [
      {
        id: "chicken3", label: "Grilled Chicken Breast",
        baseQty: 150, unit: "g", scaleType: "protein", overridable: true,
        meal3Guard: "chicken", note: "Weight after cooking",
      },
      {
        id: "tuna3", label: "Tuna (canned, in brine/water)",
        baseQty: 0, unit: "1 can", scaleType: "fixed", overridable: false,
        meal3Guard: "tuna",
      },
      {
        id: "sweetcorn3", label: "Sweet Corn",
        baseQty: 50, unit: "g", scaleType: "fixed", overridable: true,
      },
      {
        id: "mushroom3", label: "Mushroom",
        baseQty: 0, unit: "free", scaleType: "fixed", overridable: false,
        note: "Any amount",
      },
      {
        id: "salad3", label: "Green Salad",
        baseQty: 0, unit: "free", scaleType: "fixed", overridable: false,
        note: "Unlimited",
      },
      {
        id: "yogurt3", label: "Greek Yogurt",
        baseQty: 170, unit: "g", scaleType: "dairy", overridable: true,
      },
      {
        id: "honey3", label: "Natural Honey",
        baseQty: 0, unit: "1 tsp", scaleType: "fixed", overridable: false,
        note: "Small teaspoon",
      },
    ],
  },
];

const SUPPLEMENTS = [
  { name: "Omega 3 — 1,000 mg", timing: "1 pill after breakfast · 1 pill after lunch" },
  { name: "Vi Drop",             timing: "2 pills in the morning · 1 pill after lunch" },
  { name: "Calmag",              timing: "1 pill in the morning · 1 pill after dinner"  },
  { name: "Multivitamin",        timing: "1 pill after dinner"                          },
];

const GUIDELINES = {
  freeVeg: [
    "Tomatoes", "Cucumber", "Lettuce", "Cabbage", "Parsley", "Rocket (Arugula)", "Dill",
  ],
  cookedVeg: [
    "Beans", "Spinach", "Broccoli", "Zucchini", "Eggplant", "Peas", "Carrots",
  ],
  proteins: [
    "Chicken breast", "Thigh fillet", "Shish tawook", "Grilled / smoked duck",
    "Ground meat", "Liver (grilled or sautéed)", "Salmon", "Country chicken",
    "Tuna", "Shrimp", "Boiled / cut meat",
  ],
  fruits: [
    "Banana — 1 medium", "Avocado", "Dates — 3 pieces",
    "Guava", "Orange — 150 g", "Grapefruit — 150 g",
    "Mandarin (Yusuf Effendi) — 200 g", "Watermelon", "Mango",
  ],
  allowed: [
    "All spices & herbs — unlimited",
    "Garlic & onion — any amount",
    "Lemon & apple cider vinegar — any amount",
    "Warm drinks without sugar (Stevia / saccharin OK)",
    "Coffee 30 min before training",
    "Green tea + fenugreek: 3–4 times daily",
    "Table salt — max 5 g / day total",
    "Ketchup, mustard, hot sauce — OK",
  ],
  prohibited: [
    "Oil, ghee, or butter in cooking",
    "Fresh juices & fizzy drinks",
    "White sugar, sweets & pastries",
    "Mayonnaise",
    "Any food outside this plan",
  ],
};

// ─── Quantity Calculation ─────────────────────────────────────────────────────

const GOAL_FACTOR: Record<NutritionGoal, number> = {
  weight_loss:  0.80,
  maintenance:  1.00,
  muscle_gain:  1.20,
  performance:  1.30,
};

const ACT_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 0.80,
  moderate:  1.00,
  active:    1.20,
  athlete:   1.45,
};

const GENDER_FACTOR: Record<"male" | "female", number> = {
  male:   1.00,
  female: 0.82,
};

function calcQty(item: FoodItem, profile: NutritionProfile): number {
  if (item.scaleType === "fixed" || item.baseQty === 0) return item.baseQty;

  const wf = profile.weight / BASE_WEIGHT_KG;
  const gf = GENDER_FACTOR[profile.gender];
  const qf = GOAL_FACTOR[profile.goal];
  const af = ACT_FACTOR[profile.activityLevel];

  switch (item.scaleType) {
    case "egg": {
      const raw = item.baseQty * wf * qf * gf;
      return Math.min(6, Math.max(1, Math.round(raw)));
    }
    case "protein": {
      const raw = item.baseQty * wf * qf * gf;
      return Math.round(raw / 5) * 5;
    }
    case "carb": {
      const raw = item.baseQty * wf * qf * af * gf;
      return Math.round(raw / 5) * 5;
    }
    case "dairy": {
      // Dairy scales gently — partial scaling to avoid extreme values
      const raw = item.baseQty * (0.4 + 0.6 * wf * qf * gf);
      return Math.round(raw / 5) * 5;
    }
    default:
      return item.baseQty;
  }
}

function calcWaterLiters(profile: NutritionProfile): number {
  const base = Math.max(3.5, profile.weight * 0.038);
  const actAdd: Record<ActivityLevel, number> = { sedentary: 0, moderate: 0.5, active: 1.0, athlete: 1.5 };
  const total = base + actAdd[profile.activityLevel];
  return Math.round(total * 2) / 2; // nearest 0.5 L
}

function displayQty(item: FoodItem, profile: NutritionProfile): { value: string; isBase: boolean } {
  const override = profile.overrides[item.id];
  if (override !== undefined) {
    const label = item.scaleType === "egg" ? `${override} eggs` : `${override} ${item.unit}`;
    return { value: label, isBase: false };
  }
  if (item.baseQty === 0) return { value: item.unit, isBase: true };
  const qty = calcQty(item, profile);
  const label = item.scaleType === "egg" ? `${qty} eggs` : `${qty} ${item.unit}`;
  return { value: label, isBase: true };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1.5px solid #e5e0d8",
  borderRadius: 16,
  padding: "20px 24px",
  marginBottom: 18,
  fontFamily: "'Outfit', sans-serif",
};

const CARD_TITLE: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontSize: 17,
  fontWeight: 600,
  color: "#1a1a1a",
  marginBottom: 4,
};

const LABEL_SM: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#9a9590",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const BTN_BASE: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1.5px solid #e5e0d8",
  fontFamily: "'Outfit', sans-serif",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 5,
  transition: "all 0.15s",
};

const SELECT_STYLE: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1.5px solid #e5e0d8",
  fontFamily: "'Outfit', sans-serif",
  fontSize: 13,
  color: "#1a1a1a",
  background: "#fafaf8",
  cursor: "pointer",
  outline: "none",
  width: "100%",
};

// ─── Meal Card ────────────────────────────────────────────────────────────────

function MealCard({
  meal,
  profile,
  canEdit,
  onOverride,
  onClearOverride,
}: {
  meal: MealDef;
  profile: NutritionProfile;
  canEdit: boolean;
  onOverride: (itemId: string, value: number) => void;
  onClearOverride: (itemId: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal]     = useState("");

  const visibleItems = meal.items.filter((item) => {
    if (item.carbGuard  && item.carbGuard  !== profile.carbChoice)  return false;
    if (item.meal3Guard && item.meal3Guard !== profile.meal3Choice) return false;
    return true;
  });

  const mealColors: Record<string, { bg: string; accent: string; dot: string }> = {
    meal1: { bg: "#f0fdf4", accent: "#16a34a", dot: "#86efac" },
    meal2: { bg: "#fff7ed", accent: "#ea580c", dot: "#fed7aa" },
    meal3: { bg: "#f0f9ff", accent: "#0369a1", dot: "#bae6fd" },
  };
  const colors = mealColors[meal.id] ?? mealColors.meal1;

  const commitOverride = (item: FoodItem) => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v > 0) {
      onOverride(item.id, item.scaleType === "egg" ? Math.round(v) : Math.round(v / 5) * 5);
    }
    setEditingId(null);
    setEditVal("");
  };

  return (
    <div style={{ ...CARD, borderColor: colors.dot }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ ...CARD_TITLE }}>{meal.label}</div>
          <div style={{ fontSize: 12.5, color: "#9a9590", marginTop: 2 }}>{meal.time}</div>
        </div>
        <div style={{
          background: colors.bg,
          border: `1.5px solid ${colors.dot}`,
          borderRadius: 8,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          color: colors.accent,
        }}>
          {meal.id === "meal1" ? "Lunch" : meal.id === "meal2" ? "Post-noon" : "Night"}
        </div>
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleItems.map((item) => {
          const hasOverride = profile.overrides[item.id] !== undefined;
          const { value: qtyLabel } = displayQty(item, profile);
          const isEditing = editingId === item.id;
          const calcVal = item.baseQty > 0 ? calcQty(item, profile) : null;

          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: hasOverride ? "#fffbeb" : "#fafaf8",
                borderRadius: 10,
                border: `1px solid ${hasOverride ? "#fde68a" : "#f0ede8"}`,
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "#1a1a1a" }}>{item.label}</div>
                {item.note && (
                  <div style={{ fontSize: 12, color: "#9a9590", marginTop: 2 }}>{item.note}</div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      type="number"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitOverride(item);
                        if (e.key === "Escape") { setEditingId(null); setEditVal(""); }
                      }}
                      placeholder={String(calcVal ?? "")}
                      style={{
                        width: 70, padding: "4px 8px", borderRadius: 6,
                        border: "1.5px solid #6366f1", fontFamily: "'Outfit', sans-serif",
                        fontSize: 13, outline: "none", textAlign: "right",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#9a9590" }}>{item.unit !== "eggs" && item.unit !== "free" && item.unit !== "1 piece" && item.unit !== "1 can" && item.unit !== "1 tsp" ? item.unit : ""}</span>
                    <button onClick={() => commitOverride(item)} style={{ ...BTN_BASE, background: "#6366f1", color: "#fff", border: "none", padding: "4px 10px" }}>
                      <Save size={12} /> Set
                    </button>
                    <button onClick={() => { setEditingId(null); setEditVal(""); }} style={{ ...BTN_BASE, padding: "4px 8px", background: "#fafaf8" }}>
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: hasOverride ? "#92400e" : colors.accent,
                      }}>
                        {qtyLabel}
                      </div>
                      {hasOverride && calcVal !== null && (
                        <div style={{ fontSize: 11, color: "#9a9590" }}>
                          calc: {calcVal} {item.unit !== "eggs" ? item.unit : "eggs"}
                        </div>
                      )}
                    </div>
                    {canEdit && item.overridable && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => { setEditingId(item.id); setEditVal(hasOverride ? String(profile.overrides[item.id]) : String(calcVal ?? "")); }}
                          title="Override quantity"
                          style={{ ...BTN_BASE, padding: "4px 8px", background: "#fafaf8", color: "#9a9590" }}
                        >
                          <Edit2 size={11} />
                        </button>
                        {hasOverride && (
                          <button
                            onClick={() => onClearOverride(item.id)}
                            title="Reset to calculated"
                            style={{ ...BTN_BASE, padding: "4px 8px", background: "#fef9c3", color: "#92400e", borderColor: "#fde68a" }}
                          >
                            <RotateCcw size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tips */}
      {meal.tips.length > 0 && (
        <div style={{ marginTop: 14, padding: "10px 12px", background: "#f8f7f4", borderRadius: 10, borderLeft: `3px solid ${colors.dot}` }}>
          {meal.tips.map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>• {tip}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Setup Card ───────────────────────────────────────────────────────────────

function SetupCard({
  profile,
  onSave,
  saving,
  isNew,
}: {
  profile: NutritionProfile;
  onSave: (p: NutritionProfile) => void;
  saving: boolean;
  isNew: boolean;
}) {
  const [draft, setDraft] = useState<NutritionProfile>(profile);
  const [editing, setEditing] = useState(isNew);

  useEffect(() => { setDraft(profile); }, [profile]);
  useEffect(() => { if (isNew) setEditing(true); }, [isNew]);

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <div style={LABEL_SM}>{label}</div>
      {node}
    </div>
  );

  const GOAL_LABELS: Record<NutritionGoal, string> = {
    weight_loss:  "Weight Loss",
    maintenance:  "Maintenance",
    muscle_gain:  "Muscle Gain",
    performance:  "Athletic Performance",
  };
  const ACT_LABELS: Record<ActivityLevel, string> = {
    sedentary: "Sedentary (desk job, no exercise)",
    moderate:  "Moderate (1–3x exercise / week)",
    active:    "Active (4–5x exercise / week)",
    athlete:   "Athlete (daily training)",
  };

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 20 : 12 }}>
        <div>
          <div style={CARD_TITLE}>Patient Variables</div>
          <div style={{ fontSize: 13, color: "#9a9590", marginTop: 2 }}>Used to calculate personalised quantities</div>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ ...BTN_BASE, background: "#fafaf8", color: "#1a1a1a" }}>
            <Edit2 size={13} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {field("Weight (kg)",
              <input
                type="number"
                min={30} max={250}
                value={draft.weight}
                onChange={(e) => setDraft({ ...draft, weight: parseFloat(e.target.value) || 0 })}
                style={{ ...SELECT_STYLE, width: "100%", boxSizing: "border-box" }}
              />
            )}
            {field("Gender",
              <div style={{ display: "flex", gap: 8 }}>
                {(["male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setDraft({ ...draft, gender: g })}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 500,
                      border: "1.5px solid",
                      borderColor: draft.gender === g ? "#1a1a1a" : "#e5e0d8",
                      background: draft.gender === g ? "#1a1a1a" : "#fafaf8",
                      color: draft.gender === g ? "#fff" : "#9a9590",
                      transition: "all 0.15s",
                    }}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            )}
            {field("Goal",
              <select value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value as NutritionGoal })} style={SELECT_STYLE}>
                {(Object.entries(GOAL_LABELS) as [NutritionGoal, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
            {field("Activity Level",
              <select value={draft.activityLevel} onChange={(e) => setDraft({ ...draft, activityLevel: e.target.value as ActivityLevel })} style={SELECT_STYLE}>
                {(Object.entries(ACT_LABELS) as [ActivityLevel, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
            {field("Carb Source (Meal 2)",
              <div style={{ display: "flex", gap: 8 }}>
                {([["rice", "Rice"], ["potatoes", "Potatoes"]] as [CarbChoice, string][]).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setDraft({ ...draft, carbChoice: k })}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 500,
                      border: "1.5px solid",
                      borderColor: draft.carbChoice === k ? "#ea580c" : "#e5e0d8",
                      background: draft.carbChoice === k ? "#fff7ed" : "#fafaf8",
                      color: draft.carbChoice === k ? "#ea580c" : "#9a9590",
                      transition: "all 0.15s",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
            {field("Protein Source (Meal 3)",
              <div style={{ display: "flex", gap: 8 }}>
                {([["chicken", "Chicken"], ["tuna", "Tuna"]] as [Meal3ProteinChoice, string][]).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setDraft({ ...draft, meal3Choice: k })}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 500,
                      border: "1.5px solid",
                      borderColor: draft.meal3Choice === k ? "#0369a1" : "#e5e0d8",
                      background: draft.meal3Choice === k ? "#f0f9ff" : "#fafaf8",
                      color: draft.meal3Choice === k ? "#0369a1" : "#9a9590",
                      transition: "all 0.15s",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {!isNew && (
              <button onClick={() => { setDraft(profile); setEditing(false); }} style={{ ...BTN_BASE, background: "#fafaf8", color: "#9a9590" }}>
                Cancel
              </button>
            )}
            <button
              onClick={() => { onSave({ ...draft, overrides: profile.overrides }); setEditing(false); }}
              disabled={saving || !draft.weight}
              style={{ ...BTN_BASE, background: "#1a1a1a", color: "#fff", border: "none", padding: "8px 18px" }}
            >
              {saving ? "Saving…" : <><Save size={13} /> Save Variables</>}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {[
            ["Weight", `${profile.weight} kg`],
            ["Gender",  profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)],
            ["Goal",    GOAL_LABELS[profile.goal]],
            ["Activity", ACT_LABELS[profile.activityLevel].split(" (")[0]],
            ["Carbs",   profile.carbChoice.charAt(0).toUpperCase() + profile.carbChoice.slice(1)],
            ["Meal 3",  profile.meal3Choice.charAt(0).toUpperCase() + profile.meal3Choice.slice(1)],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "#fafaf8", border: "1px solid #e5e0d8", borderRadius: 10, padding: "8px 14px" }}>
              <div style={{ fontSize: 11, color: "#9a9590", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  patientId:   string;
  patientName: string;
  canEdit:     boolean;
}

export default function NutritionTab({ patientId, patientName, canEdit }: Props) {
  const [profile,          setProfile]          = useState<NutritionProfile>(DEFAULT_NUTRITION_PROFILE);
  const [loading,          setLoading]          = useState(true);
  const [isNew,            setIsNew]            = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [saved,            setSaved]            = useState(false);
  const [guidelinesOpen,   setGuidelinesOpen]   = useState(false);
  const [supplementsOpen,  setSupplementsOpen]  = useState(true);

  useEffect(() => {
    setLoading(true);
    getNutritionProfile(patientId).then((data) => {
      if (data) {
        setProfile(data);
        setIsNew(false);
      } else {
        setIsNew(true);
      }
      setLoading(false);
    });
  }, [patientId]);

  const handleSave = useCallback(async (updated: NutritionProfile) => {
    setSaving(true);
    const result = await saveNutritionProfile(patientId, updated);
    if (!result.error) {
      setProfile(updated);
      setIsNew(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }, [patientId]);

  const handleOverride = useCallback((itemId: string, value: number) => {
    const updated = { ...profile, overrides: { ...profile.overrides, [itemId]: value } };
    setProfile(updated);
    saveNutritionProfile(patientId, updated);
  }, [profile, patientId]);

  const handleClearOverride = useCallback((itemId: string) => {
    const { [itemId]: _removed, ...rest } = profile.overrides;
    const updated = { ...profile, overrides: rest };
    setProfile(updated);
    saveNutritionProfile(patientId, updated);
  }, [profile, patientId]);

  const waterL = calcWaterLiters(profile);

  const handlePrint = () => {
    const printWin = window.open("", "_blank", "width=900,height=700");
    if (!printWin) return;

    const mealHTML = MEALS.map((meal) => {
      const items = meal.items
        .filter((item) => {
          if (item.carbGuard  && item.carbGuard  !== profile.carbChoice)  return false;
          if (item.meal3Guard && item.meal3Guard !== profile.meal3Choice) return false;
          return true;
        })
        .map((item) => {
          const { value } = displayQty(item, profile);
          return `<tr><td style="padding:6px 10px;border-bottom:1px solid #f0ede8;">${item.label}${item.note ? `<br><small style="color:#9a9590">${item.note}</small>` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #f0ede8;text-align:right;font-weight:700;">${value}</td></tr>`;
        }).join("");
      return `<div style="margin-bottom:24px;page-break-inside:avoid"><h3 style="font-family:'Playfair Display',serif;margin:0 0 8px">${meal.label} — ${meal.time}</h3><table style="width:100%;border-collapse:collapse;background:#fafaf8;border-radius:8px">${items}</table></div>`;
    }).join("");

    const suppHTML = SUPPLEMENTS.map((s) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #f0ede8;font-weight:500">${s.name}</td><td style="padding:6px 10px;border-bottom:1px solid #f0ede8;color:#6b7280">${s.timing}</td></tr>`
    ).join("");

    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nutrition Plan — ${patientName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Outfit:wght@400;500;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Outfit',sans-serif;color:#1a1a1a;margin:32px;font-size:13px}h1{font-family:'Playfair Display',serif;font-size:22px;margin-bottom:4px}h2{font-family:'Playfair Display',serif;font-size:16px;margin:24px 0 10px;border-bottom:2px solid #e5e0d8;padding-bottom:4px}table{width:100%;border-collapse:collapse}@media print{body{margin:16px}}</style>
    </head><body>
    <h1>Nutrition Plan</h1>
    <p style="color:#9a9590;margin-bottom:24px">Patient: <strong style="color:#1a1a1a">${patientName}</strong> · ${profile.weight} kg · ${profile.gender} · Goal: ${profile.goal.replace("_", " ")} · Activity: ${profile.activityLevel}</p>
    <h2>Meals</h2>${mealHTML}
    <h2>Water Intake</h2>
    <p>Daily total: <strong>${waterL} L</strong> minimum<br>Before training (1–2 hrs): 0.5 L &nbsp;|&nbsp; During training: 1 L &nbsp;|&nbsp; After training (1–2 hrs): 0.5 L</p>
    <h2>Supplements</h2>
    <table>${suppHTML}</table>
    <p style="margin-top:32px;font-size:11px;color:#9a9590">Plan by Dr. Shehab Kamal — WellFit Clinics. Do not eat more or less than written.</p>
    </body></html>`);
    printWin.document.close();
    setTimeout(() => { printWin.focus(); printWin.print(); }, 600);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 60, color: "#9a9590", fontFamily: "'Outfit', sans-serif" }}>
        Loading nutrition plan…
      </div>
    );
  }

  const overrideCount = Object.keys(profile.overrides).length;

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 500, color: "#1a1a1a" }}>
            Nutrition Plan
          </div>
          <div style={{ fontSize: 13, color: "#9a9590", marginTop: 2 }}>
            Dr. Shehab Kamal — WellFit Clinics template
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saved && (
            <span style={{ fontSize: 12.5, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </span>
          )}
          {overrideCount > 0 && (
            <span style={{ fontSize: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "3px 10px", color: "#92400e" }}>
              {overrideCount} custom override{overrideCount > 1 ? "s" : ""}
            </span>
          )}
          {!isNew && (
            <button onClick={handlePrint} style={{ ...BTN_BASE, background: "#fafaf8", color: "#1a1a1a" }}>
              <Printer size={13} /> Print Plan
            </button>
          )}
        </div>
      </div>

      {/* Setup card — always visible to canEdit, read-only summary when not */}
      {(canEdit || !isNew) && (
        <SetupCard
          profile={profile}
          onSave={handleSave}
          saving={saving}
          isNew={isNew}
        />
      )}

      {/* Plan content */}
      {!isNew && (
        <>
          {/* Meals */}
          {MEALS.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              profile={profile}
              canEdit={canEdit}
              onOverride={handleOverride}
              onClearOverride={handleClearOverride}
            />
          ))}

          {/* Water */}
          <div style={CARD}>
            <div style={{ ...CARD_TITLE, marginBottom: 14 }}>Daily Water Intake</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#1d4ed8" }}>{waterL} L</div>
                <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2, fontWeight: 500 }}>Daily Minimum</div>
              </div>
              {[
                ["Before Training", "0.5 L", "1–2 hrs before"],
                ["During Training", "1.0 L", "Throughout session"],
                ["After Training",  "0.5 L", "1–2 hrs after"],
              ].map(([label, amount, sub]) => (
                <div key={label} style={{ flex: "1 1 120px", background: "#fafaf8", border: "1px solid #e5e0d8", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{amount}</div>
                  <div style={{ fontSize: 12, color: "#9a9590", marginTop: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#b4b0ab", marginTop: 1 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Supplements */}
          <div style={CARD}>
            <button
              onClick={() => setSupplementsOpen((v) => !v)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0, fontFamily: "'Outfit', sans-serif" }}
            >
              <div style={CARD_TITLE}>Supplements</div>
              {supplementsOpen ? <ChevronUp size={16} color="#9a9590" /> : <ChevronDown size={16} color="#9a9590" />}
            </button>
            {supplementsOpen && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {SUPPLEMENTS.map((s) => (
                  <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#fafaf8", borderRadius: 10, border: "1px solid #f0ede8", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: "#6b7280" }}>{s.timing}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Guidelines */}
          <div style={CARD}>
            <button
              onClick={() => setGuidelinesOpen((v) => !v)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0, fontFamily: "'Outfit', sans-serif" }}
            >
              <div>
                <div style={CARD_TITLE}>Plan Guidelines</div>
                <div style={{ fontSize: 12.5, color: "#9a9590", marginTop: 2 }}>Allowed foods, prohibited items & general notes</div>
              </div>
              {guidelinesOpen ? <ChevronUp size={16} color="#9a9590" /> : <ChevronDown size={16} color="#9a9590" />}
            </button>

            {guidelinesOpen && (
              <div style={{ marginTop: 18 }}>
                <GuidelineSection title="Free Vegetables (unlimited)" color="#16a34a" dot="#86efac" items={GUIDELINES.freeVeg} note="Can add lemon & apple cider vinegar in any amount" />
                <GuidelineSection title="Cooked Vegetables" color="#16a34a" dot="#86efac" items={GUIDELINES.cookedVeg} note="Grilled or boiled WITHOUT oil, or cooked with tomato sauce only. Garlic & onion in any amount." />
                <GuidelineSection title="Allowed Proteins" color="#ea580c" dot="#fed7aa" items={GUIDELINES.proteins} note="All proteins cooked without oil or ghee. Weigh after cooking." />
                <GuidelineSection title="Allowed Fruits" color="#7c3aed" dot="#ddd6fe" items={GUIDELINES.fruits} />
                <GuidelineSection title="Allowed Extras & Beverages" color="#0369a1" dot="#bae6fd" items={GUIDELINES.allowed} />

                <div style={{ marginTop: 14, padding: "14px 16px", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Prohibited</div>
                  {GUIDELINES.prohibited.map((item) => (
                    <div key={item} style={{ fontSize: 13, color: "#dc2626", lineHeight: 1.8 }}>✕ {item}</div>
                  ))}
                </div>

                <div style={{ marginTop: 12, padding: "12px 14px", background: "#1a1a1a", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "center" }}>
                    Do not eat more… and do not eat less than written
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state when new + not canEdit (patient portal before setup) */}
      {isNew && !canEdit && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#9a9590" }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>Your nutrition plan hasn't been set up yet.</div>
          <div style={{ fontSize: 13 }}>Please ask your physiotherapist to configure it.</div>
        </div>
      )}
    </div>
  );
}

function GuidelineSection({
  title, color, dot, items, note,
}: {
  title: string; color: string; dot: string; items: string[]; note?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <span key={item} style={{ fontSize: 12.5, background: `${dot}30`, border: `1px solid ${dot}`, borderRadius: 20, padding: "3px 10px", color: "#1a1a1a" }}>
            {item}
          </span>
        ))}
      </div>
      {note && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{note}</div>}
    </div>
  );
}
