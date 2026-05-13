// FILE: src/features/patient/NutritionTab.tsx
// Nutrition plan tab — structured meal template with InBody-aware quantity scaling

import { useState, useEffect, useCallback } from "react";
import { Printer, ChevronDown, ChevronUp, Edit2, Save, X, RotateCcw, Sparkles, Plus, Trash2 } from "lucide-react";
import {
  getNutritionProfile,
  saveNutritionProfile,
  deleteNutritionProfile,
  DEFAULT_NUTRITION_PROFILE,
  DEFAULT_INBODY,
  DEFAULT_SUPPLEMENTS,
  DEFAULT_INTAKE_FORM,
  type NutritionProfile,
  type InBodyData,
  type CustomSupplement,
  type IntakeForm,
  type NutritionGoal,
  type ActivityLevel,
} from "../../services/nutritionService";

// ─── Plan Template ────────────────────────────────────────────────────────────

const BASE_WEIGHT_KG = 75;

type ScaleType = "protein" | "carb" | "dairy" | "egg" | "fixed";
type QtySource  = "override" | "ai" | "formula" | "fixed";

interface FoodItem {
  id:          string;
  label:       string;
  baseQty:     number;
  unit:        string;
  scaleType:   ScaleType;
  note?:       string;
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
    id: "meal1", label: "First Meal", time: "~1:00 PM",
    tips: [
      "Cook without oil — use cooking spray or a dry non-stick pan",
      "Can add: mushroom, green onion, zaatar, black seed, cumin in any amount",
      "Small drizzle of olive oil on salad is allowed",
    ],
    items: [
      { id: "eggs",         label: "Eggs (boiled or omelet)",   baseQty: 3,   unit: "eggs", scaleType: "egg",     overridable: true,  note: "Cook without oil or ghee" },
      { id: "bran_bread",   label: "Bran Bread",                baseQty: 30,  unit: "g",    scaleType: "fixed",   overridable: true  },
      { id: "fresh_cheese", label: "Fresh Cheese",              baseQty: 150, unit: "g",    scaleType: "dairy",   overridable: true,  note: "Can add cream cheese, zaatar, black seed, cumin" },
      { id: "salad1",       label: "Green Salad",               baseQty: 0,   unit: "free", scaleType: "fixed",   overridable: false, note: "Tomatoes, cucumber, lettuce, rocket, parsley — unlimited" },
      { id: "fruit1",       label: "Fruit",                     baseQty: 0,   unit: "1 piece", scaleType: "fixed", overridable: false, note: "See allowed fruits in guidelines" },
    ],
  },
  {
    id: "meal2", label: "Second Meal", time: "5:00 – 7:00 PM",
    tips: [
      "Weigh protein AFTER cooking — no oil or ghee when cooking",
      "Carbs weighed after cooking as well",
    ],
    items: [
      { id: "protein2", label: "Animal Protein",               baseQty: 200, unit: "g", scaleType: "protein", overridable: true, note: "Chicken breast / thigh fillet / shish tawook / smoked fish — weight after cooking" },
      { id: "carb2",    label: "Rice / Potatoes",              baseQty: 100, unit: "g", scaleType: "carb",    overridable: true, note: "Rice (white or brown) or potatoes — weight after cooking" },
      { id: "veg2",     label: "Sautéed / Grilled Vegetables", baseQty: 150, unit: "g", scaleType: "fixed",   overridable: true, note: "With tomato sauce, no oil" },
      { id: "salad2",    label: "Green Salad",                 baseQty: 0,   unit: "free", scaleType: "fixed", overridable: false, note: "Unlimited" },
    ],
  },
  {
    id: "meal3", label: "Third Meal", time: "11:00 PM – 12:00 AM",
    tips: ["Can add small drizzle of olive oil to salad"],
    items: [
      { id: "protein3",   label: "Grilled Chicken Breast / Tuna", baseQty: 150, unit: "g", scaleType: "protein", overridable: true, note: "Chicken breast (cooked weight) or 1 can tuna in brine" },
      { id: "sweetcorn3", label: "Sweet Corn",                 baseQty: 50,  unit: "g",     scaleType: "fixed",   overridable: true  },
      { id: "mushroom3",  label: "Mushroom",                   baseQty: 0,   unit: "free",  scaleType: "fixed",   overridable: false, note: "Any amount" },
      { id: "salad3",     label: "Green Salad",                baseQty: 0,   unit: "free",  scaleType: "fixed",   overridable: false, note: "Unlimited" },
      { id: "yogurt3",    label: "Greek Yogurt",               baseQty: 170, unit: "g",     scaleType: "dairy",   overridable: true  },
      { id: "honey3",     label: "Natural Honey",              baseQty: 0,   unit: "1 tsp", scaleType: "fixed",   overridable: false, note: "Small teaspoon" },
    ],
  },
];

// ─── 4-meal & 5-meal plan extensions ─────────────────────────────────────────

const MEAL_MORNING: MealDef = {
  id: "meal_morning", label: "Morning Meal", time: "7:00 – 8:00 AM",
  tips: [
    "Prepare oats with water only — no milk or sugar",
    "A pinch of cinnamon or small drizzle of honey is allowed",
  ],
  items: [
    { id: "oats_morning", label: "Oats", baseQty: 50, unit: "g", scaleType: "carb", overridable: true, note: "Cooked with water, no milk or added sugar" },
    { id: "fruit_morning", label: "Fruit (1 piece)", baseQty: 0, unit: "1 piece", scaleType: "fixed", overridable: false, note: "See allowed fruits in guidelines" },
  ],
};

const MEAL_SNACK: MealDef = {
  id: "meal_snack", label: "Afternoon Snack", time: "3:00 – 4:00 PM",
  tips: [
    "Keep this snack light — it bridges lunch and dinner",
    "Drink at least 500 mL water before this snack",
  ],
  items: [
    { id: "snack_nuts", label: "Mixed Nuts / Almonds", baseQty: 20, unit: "g", scaleType: "fixed", overridable: true, note: "Unsalted — almonds, cashews, or peanuts" },
    { id: "snack_fruit", label: "Fruit (1 piece)", baseQty: 0, unit: "1 piece", scaleType: "fixed", overridable: false, note: "Optional" },
  ],
};

const MEALS_3: MealDef[] = MEALS;
const MEALS_4: MealDef[] = [MEAL_MORNING, ...MEALS];
const MEALS_5: MealDef[] = [MEAL_MORNING, MEALS[0], MEAL_SNACK, MEALS[1], MEALS[2]];

function getMeals(mealsPerDay?: number): MealDef[] {
  if (mealsPerDay === 4) return MEALS_4;
  if (mealsPerDay === 5) return MEALS_5;
  return MEALS_3;
}

const GUIDELINES = {
  freeVeg:    ["Tomatoes","Cucumber","Lettuce","Cabbage","Parsley","Rocket (Arugula)","Dill"],
  cookedVeg:  ["Beans","Spinach","Broccoli","Zucchini","Eggplant","Peas","Carrots"],
  proteins:   ["Chicken breast","Thigh fillet","Shish tawook","Grilled / smoked duck","Ground meat","Liver (grilled or sautéed)","Salmon","Country chicken","Tuna","Shrimp","Boiled / cut meat"],
  fruits:     ["Banana — 1 medium","Avocado","Dates — 3 pieces","Guava","Orange — 150 g","Grapefruit — 150 g","Mandarin — 200 g","Watermelon","Mango"],
  allowed:    ["All spices & herbs — unlimited","Garlic & onion — any amount","Lemon & apple cider vinegar — any amount","Warm drinks without sugar (Stevia / saccharin OK)","Coffee 30 min before training","Green tea + fenugreek: 3–4 times daily","Table salt — max 5 g / day total","Ketchup, mustard, hot sauce — OK"],
  prohibited: ["Oil, ghee, or butter in cooking","Fresh juices & fizzy drinks","White sugar, sweets & pastries","Mayonnaise","Any food outside this plan"],
};

// ─── Quantity Calculation ─────────────────────────────────────────────────────

const GOAL_FACTOR:   Record<NutritionGoal, number>   = { weight_loss: 0.80, maintenance: 1.00, muscle_gain: 1.20, performance: 1.30 };
const ACT_FACTOR:    Record<ActivityLevel, number>   = { sedentary: 0.80, moderate: 1.00, active: 1.20, athlete: 1.45 };
const GENDER_FACTOR: Record<"male"|"female", number> = { male: 1.00, female: 0.82 };

function latestInBody(profile: NutritionProfile): InBodyData | undefined {
  const h = profile.inBodyHistory;
  if (!h || h.length === 0) return undefined;
  return [...h].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
}

function effectiveWeight(profile: NutritionProfile): number {
  return latestInBody(profile)?.weight ?? profile.weight;
}

function calcQty(item: FoodItem, profile: NutritionProfile): number {
  if (item.scaleType === "fixed" || item.baseQty === 0) return item.baseQty;
  const w  = effectiveWeight(profile);
  const wf = w / BASE_WEIGHT_KG;
  const gf = GENDER_FACTOR[profile.gender];
  const qf = GOAL_FACTOR[profile.goal];
  const af = ACT_FACTOR[profile.activityLevel];
  switch (item.scaleType) {
    case "egg":    return Math.min(6, Math.max(1, Math.round(item.baseQty * wf * qf * gf)));
    case "protein": return Math.round((item.baseQty * wf * qf * gf) / 5) * 5;
    case "carb":   return Math.round((item.baseQty * wf * qf * af * gf) / 5) * 5;
    case "dairy":  return Math.round((item.baseQty * (0.4 + 0.6 * wf * qf * gf)) / 5) * 5;
    default:       return item.baseQty;
  }
}

function calcWaterLiters(profile: NutritionProfile): number {
  const w    = effectiveWeight(profile);
  const base = Math.max(3.5, w * 0.038);
  const add: Record<ActivityLevel, number> = { sedentary: 0, moderate: 0.5, active: 1.0, athlete: 1.5 };
  return Math.round((base + add[profile.activityLevel]) * 2) / 2;
}

function resolveQty(item: FoodItem, profile: NutritionProfile): { value: string; source: QtySource } {
  if (item.baseQty === 0) return { value: item.unit, source: "fixed" };
  const label = (n: number) => item.scaleType === "egg" ? `${n} eggs` : `${n} ${item.unit}`;
  if (profile.overrides[item.id]   !== undefined) return { value: label(profile.overrides[item.id]),   source: "override" };
  if (profile.aiQuantities?.[item.id] !== undefined) return { value: label(profile.aiQuantities![item.id]), source: "ai" };
  return { value: label(calcQty(item, profile)), source: "formula" };
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff", border: "1.5px solid #e5e0d8", borderRadius: 16,
  padding: "20px 24px", marginBottom: 18, fontFamily: "'Outfit', sans-serif",
};
const CARD_TITLE: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 600, color: "#1a1a1a", marginBottom: 4,
};
const LABEL_SM: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#9a9590",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
};
const BTN: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, border: "1.5px solid #e5e0d8",
  fontFamily: "'Outfit', sans-serif", fontSize: 12.5, fontWeight: 500,
  cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
};
const SELECT_STYLE: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 8, border: "1.5px solid #e5e0d8",
  fontFamily: "'Outfit', sans-serif", fontSize: 13, color: "#1a1a1a",
  background: "#fafaf8", cursor: "pointer", outline: "none", width: "100%",
};
const INPUT_STYLE: React.CSSProperties = {
  ...SELECT_STYLE, cursor: "text",
};

// ─── Source badge colors ──────────────────────────────────────────────────────

const SOURCE_STYLE: Record<QtySource, { color: string; bg: string }> = {
  override: { color: "#92400e", bg: "#fffbeb" },
  ai:       { color: "#6d28d9", bg: "#f5f3ff" },
  formula:  { color: "#1a1a1a", bg: "transparent" },
  fixed:    { color: "#1a1a1a", bg: "transparent" },
};

// ─── MealCard ─────────────────────────────────────────────────────────────────

function MealCard({
  meal, profile, canEdit, onOverride, onClearOverride,
}: {
  meal:           MealDef;
  profile:        NutritionProfile;
  canEdit:        boolean;
  onOverride:     (id: string, v: number) => void;
  onClearOverride:(id: string) => void;
}) {
  const [editId,  setEditId]  = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const COLORS: Record<string, { bg: string; accent: string; border: string }> = {
    meal1:        { bg: "#f0fdf4", accent: "#16a34a", border: "#86efac" },
    meal2:        { bg: "#fff7ed", accent: "#ea580c", border: "#fed7aa" },
    meal3:        { bg: "#f0f9ff", accent: "#0369a1", border: "#bae6fd" },
    meal_morning: { bg: "#fffbeb", accent: "#d97706", border: "#fde68a" },
    meal_snack:   { bg: "#fdf4ff", accent: "#9333ea", border: "#e9d5ff" },
  };
  const c = COLORS[meal.id] ?? COLORS.meal1;

  const visible = meal.items;

  const commit = (item: FoodItem) => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v > 0) {
      onOverride(item.id, item.scaleType === "egg" ? Math.round(v) : Math.round(v / 5) * 5);
    }
    setEditId(null); setEditVal("");
  };

  return (
    <div style={{ ...CARD, borderColor: c.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={CARD_TITLE}>{meal.label}</div>
          <div style={{ fontSize: 12.5, color: "#9a9590", marginTop: 2 }}>{meal.time}</div>
        </div>
        <div style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: c.accent }}>
          {meal.id === "meal_morning" ? "Morning" : meal.id === "meal_snack" ? "Snack" : meal.id === "meal1" ? "Lunch" : meal.id === "meal2" ? "Post-noon" : "Night"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((item) => {
          const { value: qty, source } = resolveQty(item, profile);
          const calcVal   = item.baseQty > 0 ? calcQty(item, profile) : null;
          const isEditing = editId === item.id;
          const sc        = SOURCE_STYLE[source];

          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              padding: "10px 12px", borderRadius: 10, gap: 12,
              background: source === "override" ? "#fffbeb" : source === "ai" ? "#f5f3ff" : "#fafaf8",
              border: `1px solid ${source === "override" ? "#fde68a" : source === "ai" ? "#ddd6fe" : "#f0ede8"}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "#1a1a1a" }}>{item.label}</div>
                {item.note && <div style={{ fontSize: 12, color: "#9a9590", marginTop: 2 }}>{item.note}</div>}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {isEditing ? (
                  <>
                    <input
                      autoFocus type="number" value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commit(item); if (e.key === "Escape") { setEditId(null); setEditVal(""); } }}
                      placeholder={String(calcVal ?? "")}
                      style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #6366f1", fontFamily: "'Outfit', sans-serif", fontSize: 13, outline: "none", textAlign: "right" }}
                    />
                    <button onClick={() => commit(item)} style={{ ...BTN, background: "#6366f1", color: "#fff", border: "none", padding: "4px 10px" }}><Save size={12} /> Set</button>
                    <button onClick={() => { setEditId(null); setEditVal(""); }} style={{ ...BTN, padding: "4px 8px", background: "#fafaf8" }}><X size={12} /></button>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: sc.color }}>{qty}</div>
                      {source === "override" && calcVal !== null && (
                        <div style={{ fontSize: 11, color: "#9a9590" }}>calc: {calcVal}{item.scaleType !== "egg" ? ` ${item.unit}` : " eggs"}</div>
                      )}
                      {source === "ai" && (
                        <div style={{ fontSize: 10, color: "#6d28d9", fontWeight: 600, letterSpacing: "0.04em" }}>AI</div>
                      )}
                    </div>
                    {canEdit && item.overridable && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => { setEditId(item.id); setEditVal(source === "override" ? String(profile.overrides[item.id]) : String(calcVal ?? "")); }}
                          title="Override quantity"
                          style={{ ...BTN, padding: "4px 8px", background: "#fafaf8", color: "#9a9590" }}
                        ><Edit2 size={11} /></button>
                        {source === "override" && (
                          <button onClick={() => onClearOverride(item.id)} title="Reset" style={{ ...BTN, padding: "4px 8px", background: "#fef9c3", color: "#92400e", borderColor: "#fde68a" }}><RotateCcw size={11} /></button>
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

      {meal.tips.length > 0 && (
        <div style={{ marginTop: 14, padding: "10px 12px", background: "#f8f7f4", borderRadius: 10, borderLeft: `3px solid ${c.border}` }}>
          {meal.tips.map((t, i) => <div key={i} style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>• {t}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── SetupCard ────────────────────────────────────────────────────────────────

function SetupCard({ profile, onSave, saving, isNew }: {
  profile: NutritionProfile; onSave: (p: NutritionProfile) => void; saving: boolean; isNew: boolean;
}) {
  const [draft,   setDraft]   = useState<NutritionProfile>(profile);
  const [editing, setEditing] = useState(isNew);
  useEffect(() => { setDraft(profile); }, [profile]);
  useEffect(() => { if (isNew) setEditing(true); }, [isNew]);

  const GOAL_LABELS: Record<NutritionGoal, string>  = { weight_loss: "Weight Loss", maintenance: "Maintenance", muscle_gain: "Muscle Gain", performance: "Athletic Performance" };
  const ACT_LABELS:  Record<ActivityLevel, string>  = { sedentary: "Sedentary (desk job, no exercise)", moderate: "Moderate (1–3x / week)", active: "Active (4–5x / week)", athlete: "Athlete (daily training)" };

  const fld = (label: string, node: React.ReactNode) => (
    <div><div style={LABEL_SM}>{label}</div>{node}</div>
  );

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 20 : 12 }}>
        <div>
          <div style={CARD_TITLE}>Patient Variables</div>
          <div style={{ fontSize: 13, color: "#9a9590", marginTop: 2 }}>Used to calculate personalised quantities</div>
        </div>
        {!editing && <button onClick={() => setEditing(true)} style={{ ...BTN, background: "#fafaf8", color: "#1a1a1a" }}><Edit2 size={13} /> Edit</button>}
      </div>

      {editing ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {fld("Weight (kg)", <input type="number" min={30} max={250} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: parseFloat(e.target.value) || 0 })} style={{ ...INPUT_STYLE, boxSizing: "border-box" }} />)}
            {fld("Gender",
              <div style={{ display: "flex", gap: 8 }}>
                {(["male","female"] as const).map((g) => (
                  <button key={g} onClick={() => setDraft({ ...draft, gender: g })} style={{ flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer", fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 500, border: "1.5px solid", borderColor: draft.gender === g ? "#1a1a1a" : "#e5e0d8", background: draft.gender === g ? "#1a1a1a" : "#fafaf8", color: draft.gender === g ? "#fff" : "#9a9590", transition: "all 0.15s" }}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            )}
            {fld("Goal", <select value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value as NutritionGoal })} style={SELECT_STYLE}>{(Object.entries(GOAL_LABELS) as [NutritionGoal,string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>)}
            {fld("Activity Level", <select value={draft.activityLevel} onChange={(e) => setDraft({ ...draft, activityLevel: e.target.value as ActivityLevel })} style={SELECT_STYLE}>{(Object.entries(ACT_LABELS) as [ActivityLevel,string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {!isNew && <button onClick={() => { setDraft(profile); setEditing(false); }} style={{ ...BTN, background: "#fafaf8", color: "#9a9590" }}>Cancel</button>}
            <button onClick={() => { onSave({ ...draft, overrides: profile.overrides }); setEditing(false); }} disabled={saving || !draft.weight} style={{ ...BTN, background: "#1a1a1a", color: "#fff", border: "none", padding: "8px 18px" }}>
              {saving ? "Saving…" : <><Save size={13} /> Save Variables</>}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {([["Weight", `${profile.weight} kg`], ["Gender", profile.gender.charAt(0).toUpperCase()+profile.gender.slice(1)], ["Goal", GOAL_LABELS[profile.goal]], ["Activity", ACT_LABELS[profile.activityLevel].split(" (")[0]]]).map(([k,v]) => (
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

// ─── InBodyCard ───────────────────────────────────────────────────────────────

function InBodyCard({ profile, onSave, saving }: {
  profile: NutritionProfile; onSave: (p: NutritionProfile) => void; saving: boolean;
}) {
  const history = [...(profile.inBodyHistory ?? [])].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  const [open,     setOpen]     = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [draft,    setDraft]    = useState<InBodyData>(DEFAULT_INBODY);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleSaveNew = () => {
    const existing = profile.inBodyHistory ?? [];
    const updated = [draft, ...existing.filter(r => r.measuredAt !== draft.measuredAt)]
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    onSave({ ...profile, inBodyHistory: updated });
    setAdding(false);
    setDraft(DEFAULT_INBODY);
  };

  const handleDelete = (measuredAt: string) => {
    const updated = (profile.inBodyHistory ?? []).filter(r => r.measuredAt !== measuredAt);
    onSave({ ...profile, inBodyHistory: updated });
  };

  const numField = (label: string, key: keyof InBodyData, unit: string) => (
    <div>
      <div style={LABEL_SM}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" min={0} value={draft[key] ?? ""} placeholder="—"
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value ? parseFloat(e.target.value) : null } as InBodyData)}
          style={{ ...INPUT_STYLE, boxSizing: "border-box" }} />
        {unit && <span style={{ fontSize: 12, color: "#9a9590", whiteSpace: "nowrap" }}>{unit}</span>}
      </div>
    </div>
  );

  const METRICS: [string, keyof InBodyData, string][] = [
    ["Weight",   "weight",             "kg"],
    ["SMM",      "skeletalMuscleMass", "kg"],
    ["Body Fat", "bodyFatPercent",     "%"],
    ["Fat Mass", "bodyFatMass",        "kg"],
    ["BMI",      "bmi",                ""],
    ["BMR",      "bmr",                "kcal/d"],
    ["Visceral", "visceralFatLevel",   "/20"],
    ["TBW",      "totalBodyWater",     "L"],
  ];

  return (
    <div style={{ ...CARD, borderColor: history.length > 0 ? "#c4b5fd" : "#e5e0d8" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: open ? 14 : 0 }}>
        <button onClick={() => setOpen(v => !v)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0, textAlign: "left", fontFamily: "'Outfit',sans-serif" }}>
          <div style={{ ...CARD_TITLE, display: "flex", alignItems: "center", gap: 8 }}>
            InBody History
            {history.length > 0 && (
              <span style={{ fontSize: 11, background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe", borderRadius: 20, padding: "2px 8px", fontFamily: "'Outfit',sans-serif", fontWeight: 600 }}>
                {history.length} reading{history.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {open ? <ChevronUp size={16} color="#9a9590" /> : <ChevronDown size={16} color="#9a9590" />}
        </button>
        {open && !adding && (
          <button onClick={() => { setDraft(DEFAULT_INBODY); setAdding(true); }}
            style={{ ...BTN, background: "#f5f3ff", color: "#6d28d9", borderColor: "#ddd6fe", marginLeft: 10 }}>
            <Plus size={13} /> Add Reading
          </button>
        )}
      </div>

      {open && (
        <>
          {/* Add form */}
          {adding && (
            <div style={{ background: "#faf8ff", border: "1.5px solid #ddd6fe", borderRadius: 12, padding: "16px 16px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#6d28d9", marginBottom: 14 }}>New InBody Reading</div>
              <div style={{ marginBottom: 14 }}>
                <div style={LABEL_SM}>Date Measured</div>
                <input type="date" value={draft.measuredAt}
                  onChange={(e) => setDraft({ ...draft, measuredAt: e.target.value })}
                  style={{ ...INPUT_STYLE, boxSizing: "border-box", width: "100%" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                {numField("Weight", "weight", "kg")}
                {numField("Skeletal Muscle Mass (SMM)", "skeletalMuscleMass", "kg")}
                {numField("Body Fat Mass", "bodyFatMass", "kg")}
                {numField("Body Fat %", "bodyFatPercent", "%")}
                {numField("BMI", "bmi", "")}
                {numField("BMR", "bmr", "kcal/day")}
                {numField("Visceral Fat Level", "visceralFatLevel", "/ 20")}
                {numField("Total Body Water", "totalBodyWater", "L")}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={LABEL_SM}>Notes</div>
                <textarea rows={2} value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Any additional notes from the InBody report…"
                  style={{ ...INPUT_STYLE, resize: "vertical", width: "100%", boxSizing: "border-box", lineHeight: 1.5 } as React.CSSProperties} />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setAdding(false)} style={{ ...BTN, background: "#fafaf8", color: "#9a9590" }}>Cancel</button>
                <button onClick={handleSaveNew} disabled={saving || !draft.measuredAt}
                  style={{ ...BTN, background: "#6d28d9", color: "#fff", border: "none", padding: "8px 18px" }}>
                  {saving ? "Saving…" : <><Save size={13} /> Save Reading</>}
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {history.length === 0 && !adding && (
            <div style={{ padding: "4px 0 6px", fontSize: 13, color: "#b4b0ab" }}>
              No readings yet. Add a measurement to enable AI-optimised quantities and track progress.
            </div>
          )}

          {/* Reading list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map((r, idx) => {
              const isLatest   = idx === 0;
              const isExpanded = expanded === r.measuredAt;
              return (
                <div key={r.measuredAt || idx} style={{ border: `1.5px solid ${isLatest ? "#ddd6fe" : "#e5e0d8"}`, borderRadius: 12, background: isLatest ? "#faf8ff" : "#fafaf8", overflow: "hidden" }}>
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                    <button onClick={() => setExpanded(isExpanded ? null : r.measuredAt)}
                      style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: 0, textAlign: "left", fontFamily: "'Outfit',sans-serif" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>{r.measuredAt || "—"}</span>
                          {isLatest && <span style={{ fontSize: 10, background: "#6d28d9", color: "#fff", borderRadius: 20, padding: "2px 8px", fontWeight: 600, letterSpacing: "0.04em" }}>LATEST</span>}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          {r.weight            && <span style={{ fontSize: 12, color: "#6b7280" }}>{r.weight} kg</span>}
                          {r.bodyFatPercent     && <span style={{ fontSize: 12, color: "#6b7280" }}>{r.bodyFatPercent}% fat</span>}
                          {r.skeletalMuscleMass && <span style={{ fontSize: 12, color: "#6b7280" }}>SMM {r.skeletalMuscleMass} kg</span>}
                          {r.bmr               && <span style={{ fontSize: 12, color: "#6b7280" }}>BMR {r.bmr} kcal</span>}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={14} color="#9a9590" /> : <ChevronDown size={14} color="#9a9590" />}
                    </button>
                    <button onClick={() => handleDelete(r.measuredAt)} title="Delete reading"
                      style={{ ...BTN, padding: "5px 8px", background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca", flexShrink: 0, marginLeft: 8 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0ede8" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 12 }}>
                        {METRICS.filter(([, key]) => r[key] !== null && r[key] !== undefined).map(([label, key, unit]) => (
                          <div key={label} style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "7px 12px" }}>
                            <div style={{ fontSize: 10, color: "#6d28d9", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1a1a", marginTop: 2 }}>{r[key]} {unit}</div>
                          </div>
                        ))}
                      </div>
                      {r.notes && <div style={{ marginTop: 10, fontSize: 12.5, color: "#6b7280" }}><span style={{ fontWeight: 600 }}>Notes: </span>{r.notes}</div>}
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

// ─── SupplementsCard ──────────────────────────────────────────────────────────

function SupplementsCard({ profile, onSave, saving }: {
  profile: NutritionProfile; onSave: (p: NutritionProfile) => void; saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<CustomSupplement[]>(profile.supplements ?? DEFAULT_SUPPLEMENTS);
  const [open,    setOpen]    = useState(true);

  useEffect(() => { setDraft(profile.supplements ?? DEFAULT_SUPPLEMENTS); }, [profile.supplements]);

  const current = profile.supplements ?? DEFAULT_SUPPLEMENTS;

  const add = () => setDraft([...draft, { id: `s${Date.now()}`, name: "", timing: "" }]);
  const del = (id: string) => setDraft(draft.filter((s) => s.id !== id));
  const upd = (id: string, field: keyof CustomSupplement, val: string) =>
    setDraft(draft.map((s) => s.id === id ? { ...s, [field]: val } : s));

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setOpen((v) => !v)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0, textAlign: "left", fontFamily: "'Outfit',sans-serif" }}>
          <div style={CARD_TITLE}>Supplements</div>
          {open ? <ChevronUp size={16} color="#9a9590" /> : <ChevronDown size={16} color="#9a9590" />}
        </button>
        {!editing && open && (
          <button onClick={() => setEditing(true)} style={{ ...BTN, background: "#fafaf8", color: "#1a1a1a", marginLeft: 10 }}><Edit2 size={13} /> Edit</button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {editing ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {draft.map((s) => (
                  <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input value={s.name} onChange={(e) => upd(s.id, "name", e.target.value)} placeholder="Supplement name" style={{ ...INPUT_STYLE, flex: "0 0 40%", boxSizing: "border-box" }} />
                    <input value={s.timing} onChange={(e) => upd(s.id, "timing", e.target.value)} placeholder="Timing / dosage" style={{ ...INPUT_STYLE, flex: 1, boxSizing: "border-box" }} />
                    <button onClick={() => del(s.id)} style={{ ...BTN, padding: "7px 10px", background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca", flexShrink: 0 }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <button onClick={add} style={{ ...BTN, marginBottom: 16, background: "#fafaf8", color: "#1a1a1a" }}><Plus size={13} /> Add Supplement</button>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setDraft(current); setEditing(false); }} style={{ ...BTN, background: "#fafaf8", color: "#9a9590" }}>Cancel</button>
                <button onClick={() => { onSave({ ...profile, supplements: draft }); setEditing(false); }} disabled={saving} style={{ ...BTN, background: "#1a1a1a", color: "#fff", border: "none", padding: "8px 18px" }}>
                  {saving ? "Saving…" : <><Save size={13} /> Save Supplements</>}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {current.filter(s => s.name).map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#fafaf8", borderRadius: 10, border: "1px solid #f0ede8", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>{s.name}</div>
                  <div style={{ fontSize: 12.5, color: "#6b7280" }}>{s.timing}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GuidelineSection ─────────────────────────────────────────────────────────

function GuidelineSection({ title, color, dot, items, note }: {
  title: string; color: string; dot: string; items: string[]; note?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <span key={item} style={{ fontSize: 12.5, background: `${dot}30`, border: `1px solid ${dot}`, borderRadius: 20, padding: "3px 10px", color: "#1a1a1a" }}>{item}</span>
        ))}
      </div>
      {note && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{note}</div>}
    </div>
  );
}

// ─── IntakeFormCard ───────────────────────────────────────────────────────────

const CARB_OPT    = ["Rice", "Potatoes", "Sweet Potatoes", "Pasta"];
const PROTEIN_OPT = ["Chicken Breast", "Steak / Lean Red Meat", "Fish / Salmon", "Shrimps", "Turkey Breast"];
const FRUIT_OPT   = ["Apple", "Blueberries", "Raspberries", "Blackberries", "Orange", "Strawberry", "Pineapple", "Banana", "Watermelon", "Grapefruit", "Mango", "Dates", "Kiwi"];
const FAT_OPT     = ["Almonds", "Cashews", "Peanuts", "Avocados"];

function IntakeFormCard({ profile, onSave, saving, isNew, canEdit }: {
  profile: NutritionProfile; onSave: (p: NutritionProfile) => void;
  saving: boolean; isNew: boolean; canEdit: boolean;
}) {
  const hasForm = !!profile.intakeForm?.completedAt;
  const [editing, setEditing] = useState(isNew && !hasForm);
  const [open,    setOpen]    = useState(true);
  const [draft,   setDraft]   = useState<IntakeForm>(profile.intakeForm ?? DEFAULT_INTAKE_FORM);

  useEffect(() => { setDraft(profile.intakeForm ?? DEFAULT_INTAKE_FORM); }, [profile.intakeForm]);

  const tog = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const Chips = ({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => onChange(tog(selected, opt))} style={{
            padding: "5px 13px", borderRadius: 20, border: "1.5px solid",
            fontFamily: "'Outfit',sans-serif", fontSize: 12.5, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
            borderColor: on ? "#1a1a1a" : "#e5e0d8", background: on ? "#1a1a1a" : "#fafaf8", color: on ? "#fff" : "#9a9590",
          }}>{opt}</button>
        );
      })}
    </div>
  );

  const fld = (q: string, node: React.ReactNode) => (
    <div><div style={LABEL_SM}>{q}</div>{node}</div>
  );

  const handleSave = () => {
    onSave({ ...profile, intakeForm: { ...draft, completedAt: draft.completedAt || new Date().toISOString().slice(0, 10) } });
    setEditing(false);
  };

  const view = profile.intakeForm;

  return (
    <div style={{ ...CARD, borderColor: hasForm ? "#6ee7b7" : isNew ? "#6366f1" : "#e5e0d8" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 20 : 4 }}>
        <button
          onClick={() => !editing && setOpen((v) => !v)}
          style={{ flex: 1, background: "none", border: "none", cursor: editing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0, textAlign: "left", fontFamily: "'Outfit',sans-serif" }}
        >
          <div style={{ ...CARD_TITLE, display: "flex", alignItems: "center", gap: 8 }}>
            Patient Intake Form
            {hasForm && !editing && <span style={{ fontSize: 11, background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7", borderRadius: 20, padding: "2px 8px", fontFamily: "'Outfit',sans-serif", fontWeight: 600 }}>Completed</span>}
            {isNew && !hasForm && <span style={{ fontSize: 11, background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", borderRadius: 20, padding: "2px 8px", fontFamily: "'Outfit',sans-serif", fontWeight: 600 }}>Fill to get started</span>}
          </div>
          {!editing && (open ? <ChevronUp size={16} color="#9a9590" /> : <ChevronDown size={16} color="#9a9590" />)}
        </button>
        {!editing && canEdit && open && (
          <button onClick={() => setEditing(true)} style={{ ...BTN, background: "#fafaf8", color: "#1a1a1a", marginLeft: 10 }}>
            <Edit2 size={13} /> {hasForm ? "Edit" : "Fill Form"}
          </button>
        )}
      </div>

      {/* View mode */}
      {!editing && open && hasForm && view && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {([
              ["Age",       view.age    ? `${view.age} yrs`   : null],
              ["Height",    view.height ? `${view.height} cm` : null],
              ["Target",    view.target || null],
              ["Meals/day", `${view.mealsPerDay} meals`],
              ["Training",  view.trainingLocation === "gym" ? "Gym" : "Home"],
              ["Days/wk",   `${view.trainingDaysPerWeek} days`],
            ] as [string, string | null][]).filter(([, v]) => v !== null).map(([k, v]) => (
              <div key={k} style={{ background: "#fafaf8", border: "1px solid #e5e0d8", borderRadius: 10, padding: "7px 13px" }}>
                <div style={{ fontSize: 11, color: "#9a9590", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a", marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          {view.carbPreferences.length > 0 && (
            <div>
              <div style={{ ...LABEL_SM, marginBottom: 4 }}>Carb Preferences</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {view.carbPreferences.map((c) => <span key={c} style={{ fontSize: 12, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 20, padding: "3px 10px", color: "#ea580c" }}>{c}</span>)}
              </div>
            </div>
          )}
          {view.proteinPreferences.length > 0 && (
            <div>
              <div style={{ ...LABEL_SM, marginBottom: 4 }}>Protein Preferences</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {view.proteinPreferences.map((p) => <span key={p} style={{ fontSize: 12, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 20, padding: "3px 10px", color: "#0369a1" }}>{p}</span>)}
              </div>
            </div>
          )}
          {view.fruitPreferences.length > 0 && (
            <div>
              <div style={{ ...LABEL_SM, marginBottom: 4 }}>Fruit Preferences</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {view.fruitPreferences.map((f) => <span key={f} style={{ fontSize: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 20, padding: "3px 10px", color: "#16a34a" }}>{f}</span>)}
              </div>
            </div>
          )}
          {view.fatPreferences.length > 0 && (
            <div>
              <div style={{ ...LABEL_SM, marginBottom: 4 }}>Fat Preferences</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {view.fatPreferences.map((f) => <span key={f} style={{ fontSize: 12, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 20, padding: "3px 10px", color: "#7c3aed" }}>{f}</span>)}
              </div>
            </div>
          )}
          {view.allergies && (
            <div style={{ padding: "8px 12px", background: "#fef2f2", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
              <span style={{ fontWeight: 600 }}>Allergies / Dislikes: </span>{view.allergies}
            </div>
          )}
          {view.medicalCondition && (
            <div style={{ padding: "8px 12px", background: "#fefce8", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
              <span style={{ fontWeight: 600 }}>Medical Condition: </span>{view.medicalCondition}
            </div>
          )}
          {view.currentSupplements && (
            <div style={{ padding: "8px 12px", background: "#fafaf8", borderRadius: 8, fontSize: 13, color: "#1a1a1a" }}>
              <span style={{ fontWeight: 600 }}>Current Supplements: </span>{view.currentSupplements}
            </div>
          )}
          {view.trainingHistory && (
            <div style={{ padding: "8px 12px", background: "#fafaf8", borderRadius: 8, fontSize: 13, color: "#1a1a1a" }}>
              <span style={{ fontWeight: 600 }}>Training History: </span>{view.trainingHistory}
            </div>
          )}
          {view.dailyRoutine && (
            <div style={{ padding: "8px 12px", background: "#fafaf8", borderRadius: 8, fontSize: 13, color: "#1a1a1a" }}>
              <span style={{ fontWeight: 600 }}>Daily Routine: </span>{view.dailyRoutine}
            </div>
          )}
          {view.comments && (
            <div style={{ padding: "8px 12px", background: "#fafaf8", borderRadius: 8, fontSize: 13, color: "#1a1a1a" }}>
              <span style={{ fontWeight: 600 }}>Comments: </span>{view.comments}
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {fld("Age", (
              <input type="number" min={10} max={100} value={draft.age ?? ""} placeholder="e.g. 28"
                onChange={(e) => setDraft({ ...draft, age: e.target.value ? parseInt(e.target.value) : null })}
                style={{ ...INPUT_STYLE, boxSizing: "border-box" }} />
            ))}
            {fld("Height (cm)", (
              <input type="number" min={100} max={250} value={draft.height ?? ""} placeholder="e.g. 175"
                onChange={(e) => setDraft({ ...draft, height: e.target.value ? parseInt(e.target.value) : null })}
                style={{ ...INPUT_STYLE, boxSizing: "border-box" }} />
            ))}
          </div>

          {fld("Your Target / Goal", (
            <input type="text" value={draft.target} placeholder="e.g. Lose 10 kg, build muscle, improve performance…"
              onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              style={{ ...INPUT_STYLE, boxSizing: "border-box", width: "100%" }} />
          ))}

          {fld("Preferred Number of Meals per Day", (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {([4, 5] as const).map((n) => (
                <button key={n} type="button" onClick={() => setDraft({ ...draft, mealsPerDay: n })} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                  fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 500, border: "1.5px solid", transition: "all 0.15s",
                  borderColor: draft.mealsPerDay === n ? "#1a1a1a" : "#e5e0d8",
                  background:  draft.mealsPerDay === n ? "#1a1a1a" : "#fafaf8",
                  color:       draft.mealsPerDay === n ? "#fff"    : "#9a9590",
                }}>{n} Meals</button>
              ))}
            </div>
          ))}

          {fld("Allergies or Foods You Dislike", (
            <textarea rows={2} value={draft.allergies}
              onChange={(e) => setDraft({ ...draft, allergies: e.target.value })}
              placeholder="e.g. Lactose intolerant, dislike fish, allergic to nuts…"
              style={{ ...INPUT_STYLE, resize: "vertical", width: "100%", boxSizing: "border-box", lineHeight: 1.5 } as React.CSSProperties} />
          ))}

          {fld("Training History — How Long & Last 3 Months Activity", (
            <textarea rows={2} value={draft.trainingHistory}
              onChange={(e) => setDraft({ ...draft, trainingHistory: e.target.value })}
              placeholder="e.g. Training for 2 years, took last 3 months off, mostly strength training…"
              style={{ ...INPUT_STYLE, resize: "vertical", width: "100%", boxSizing: "border-box", lineHeight: 1.5 } as React.CSSProperties} />
          ))}

          {fld("Current Supplements", (
            <input type="text" value={draft.currentSupplements}
              onChange={(e) => setDraft({ ...draft, currentSupplements: e.target.value })}
              placeholder="e.g. Whey protein, creatine, multivitamin… or None"
              style={{ ...INPUT_STYLE, boxSizing: "border-box", width: "100%" }} />
          ))}

          {fld("Preferred Carb Sources", (
            <Chips options={CARB_OPT} selected={draft.carbPreferences} onChange={(v) => setDraft({ ...draft, carbPreferences: v })} />
          ))}

          {fld("Preferred Protein Sources", (
            <Chips options={PROTEIN_OPT} selected={draft.proteinPreferences} onChange={(v) => setDraft({ ...draft, proteinPreferences: v })} />
          ))}

          {fld("Preferred Fruits", (
            <Chips options={FRUIT_OPT} selected={draft.fruitPreferences} onChange={(v) => setDraft({ ...draft, fruitPreferences: v })} />
          ))}

          {fld("Preferred Fat Sources", (
            <Chips options={FAT_OPT} selected={draft.fatPreferences} onChange={(v) => setDraft({ ...draft, fatPreferences: v })} />
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {fld("Training Location", (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {(["gym", "home"] as const).map((loc) => (
                  <button key={loc} type="button" onClick={() => setDraft({ ...draft, trainingLocation: loc })} style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                    fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 500, border: "1.5px solid", transition: "all 0.15s",
                    borderColor: draft.trainingLocation === loc ? "#1a1a1a" : "#e5e0d8",
                    background:  draft.trainingLocation === loc ? "#1a1a1a" : "#fafaf8",
                    color:       draft.trainingLocation === loc ? "#fff"    : "#9a9590",
                  }}>{loc === "gym" ? "Gym" : "Home"}</button>
                ))}
              </div>
            ))}
            {fld("Training Days per Week", (
              <input type="number" min={1} max={7} value={draft.trainingDaysPerWeek}
                onChange={(e) => setDraft({ ...draft, trainingDaysPerWeek: Math.min(7, Math.max(1, parseInt(e.target.value) || 1)) })}
                style={{ ...INPUT_STYLE, boxSizing: "border-box" }} />
            ))}
          </div>

          {fld("Brief Description of Your Typical Day", (
            <textarea rows={3} value={draft.dailyRoutine}
              onChange={(e) => setDraft({ ...draft, dailyRoutine: e.target.value })}
              placeholder="e.g. Office job 9–5, gym after work, sleep around midnight, active on weekends…"
              style={{ ...INPUT_STYLE, resize: "vertical", width: "100%", boxSizing: "border-box", lineHeight: 1.5 } as React.CSSProperties} />
          ))}

          {fld("Medical Conditions", (
            <input type="text" value={draft.medicalCondition}
              onChange={(e) => setDraft({ ...draft, medicalCondition: e.target.value })}
              placeholder="e.g. Type 2 diabetes, hypertension — or None"
              style={{ ...INPUT_STYLE, boxSizing: "border-box", width: "100%" }} />
          ))}

          {fld("Additional Comments", (
            <textarea rows={2} value={draft.comments}
              onChange={(e) => setDraft({ ...draft, comments: e.target.value })}
              placeholder="Anything else you'd like us to know…"
              style={{ ...INPUT_STYLE, resize: "vertical", width: "100%", boxSizing: "border-box", lineHeight: 1.5 } as React.CSSProperties} />
          ))}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            {hasForm && (
              <button onClick={() => { setDraft(profile.intakeForm ?? DEFAULT_INTAKE_FORM); setEditing(false); }}
                style={{ ...BTN, background: "#fafaf8", color: "#9a9590" }}>Cancel</button>
            )}
            <button onClick={handleSave} disabled={saving} style={{ ...BTN, background: "#1a1a1a", color: "#fff", border: "none", padding: "8px 20px" }}>
              {saving ? "Saving…" : <><Save size={13} /> {hasForm ? "Save Changes" : "Save Intake Form"}</>}
            </button>
          </div>
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
  const [profile,         setProfile]         = useState<NutritionProfile>(DEFAULT_NUTRITION_PROFILE);
  const [loading,         setLoading]         = useState(true);
  const [isNew,           setIsNew]           = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [saved,           setSaved]           = useState(false);
  const [guidelinesOpen,  setGuidelinesOpen]  = useState(false);
  const [aiLoading,       setAiLoading]       = useState(false);
  const [aiError,         setAiError]         = useState<string | null>(null);
  const [aiReasoningOpen, setAiReasoningOpen] = useState(false);
  const [deleteConfirm,   setDeleteConfirm]   = useState(false);
  const [deleting,        setDeleting]        = useState(false);

  useEffect(() => {
    setLoading(true);
    getNutritionProfile(patientId)
      .then((data) => {
        if (data) { setProfile(data); setIsNew(false); }
        else       { setIsNew(true); }
      })
      .catch(() => { setIsNew(true); })
      .finally(() => { setLoading(false); });
  }, [patientId]);

  const persist = useCallback(async (updated: NutritionProfile) => {
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
    const { [itemId]: _, ...rest } = profile.overrides;
    const updated = { ...profile, overrides: rest };
    setProfile(updated);
    saveNutritionProfile(patientId, updated);
  }, [profile, patientId]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    const result = await deleteNutritionProfile(patientId);
    if (!result.error) {
      setProfile(DEFAULT_NUTRITION_PROFILE);
      setIsNew(true);
      setDeleteConfirm(false);
    }
    setDeleting(false);
  }, [patientId]);

  const handleAiOptimise = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const { default: app } = await import("../../firebase");
      const fn = httpsCallable(getFunctions(app), "generateNutritionQuantities");
      const result = await fn({ patientId });
      const { quantities, reasoning } = result.data as { quantities: Record<string, number>; reasoning: string };
      const updated = { ...profile, aiQuantities: quantities, aiReasoning: reasoning };
      setProfile(updated);
      await saveNutritionProfile(patientId, updated);
      setAiReasoningOpen(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI optimisation failed. Try again.");
    } finally {
      setAiLoading(false);
    }
  }, [patientId, profile]);

  const waterL      = calcWaterLiters(profile);
  const hasAi       = !!profile.aiQuantities && Object.keys(profile.aiQuantities).length > 0;
  const overrideCount = Object.keys(profile.overrides).length;
  const activeMeals   = getMeals(profile.intakeForm?.mealsPerDay);

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const mealHTML = activeMeals.map((meal) => {
      const rows = meal.items
        .map((item) => {
          const { value } = resolveQty(item, profile);
          return `<tr><td style="padding:6px 10px;border-bottom:1px solid #f0ede8">${item.label}${item.note ? `<br><small style="color:#9a9590">${item.note}</small>` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #f0ede8;text-align:right;font-weight:700">${value}</td></tr>`;
        }).join("");
      return `<div style="margin-bottom:24px;page-break-inside:avoid"><h3 style="font-family:'Playfair Display',serif;margin:0 0 8px">${meal.label} — ${meal.time}</h3><table style="width:100%;border-collapse:collapse;background:#fafaf8">${rows}</table></div>`;
    }).join("");
    const suppHTML = (profile.supplements ?? DEFAULT_SUPPLEMENTS).filter(s => s.name).map((s) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #f0ede8;font-weight:500">${s.name}</td><td style="padding:6px 10px;border-bottom:1px solid #f0ede8;color:#6b7280">${s.timing}</td></tr>`
    ).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nutrition Plan — ${patientName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Outfit:wght@400;500;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Outfit',sans-serif;color:#1a1a1a;margin:32px;font-size:13px}h1{font-family:'Playfair Display',serif;font-size:22px;margin-bottom:4px}h2{font-family:'Playfair Display',serif;font-size:16px;margin:24px 0 10px;border-bottom:2px solid #e5e0d8;padding-bottom:4px}table{width:100%;border-collapse:collapse}@media print{body{margin:16px}}</style>
    </head><body>
    <h1>Nutrition Plan</h1>
    <p style="color:#9a9590;margin-bottom:24px">Patient: <strong style="color:#1a1a1a">${patientName}</strong> · ${profile.weight} kg · ${profile.gender} · Goal: ${profile.goal.replace("_"," ")} · Activity: ${profile.activityLevel}</p>
    <h2>Meals</h2>${mealHTML}
    <h2>Daily Water</h2><p>Minimum <strong>${waterL} L</strong> daily — 0.5 L before training · 1 L during · 0.5 L after</p>
    <h2>Supplements</h2><table>${suppHTML}</table>
    <p style="margin-top:32px;font-size:11px;color:#9a9590">Do not eat more or less than written.</p>
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 60, color: "#9a9590", fontFamily: "'Outfit',sans-serif" }}>Loading nutrition plan…</div>;
  }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 500, color: "#1a1a1a" }}>Nutrition Plan</div>
          <div style={{ fontSize: 13, color: "#9a9590", marginTop: 2 }}>Personalised meal plan with body composition analysis</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {saved && <span style={{ fontSize: 12.5, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Saved</span>}
          {overrideCount > 0 && <span style={{ fontSize: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "3px 10px", color: "#92400e" }}>{overrideCount} manual override{overrideCount > 1 ? "s" : ""}</span>}
          {hasAi && <span style={{ fontSize: 12, background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 20, padding: "3px 10px", color: "#6d28d9" }}>AI optimised</span>}
          {!isNew && canEdit && (
            <button
              onClick={handleAiOptimise}
              disabled={aiLoading}
              style={{ ...BTN, background: aiLoading ? "#f5f3ff" : "#6d28d9", color: aiLoading ? "#6d28d9" : "#fff", border: "none", padding: "8px 16px" }}
            >
              {aiLoading
                ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Optimising…</>
                : <><Sparkles size={13} /> AI Optimise Quantities</>}
            </button>
          )}
          {!isNew && <button onClick={handlePrint} style={{ ...BTN, background: "#fafaf8", color: "#1a1a1a" }}><Printer size={13} /> Print</button>}
          {!isNew && canEdit && (
            <button
              onClick={() => setDeleteConfirm(true)}
              style={{ ...BTN, background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}
            ><Trash2 size={13} /> Delete Plan</button>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 28px 24px", maxWidth: 380, width: "90%", fontFamily: "'Outfit',sans-serif", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Delete Nutrition Plan?</div>
            <div style={{ fontSize: 13.5, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
              This will permanently remove the plan, all InBody data, AI quantities, and overrides for this patient. This action cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteConfirm(false)} style={{ ...BTN, background: "#fafaf8", color: "#9a9590" }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...BTN, background: "#dc2626", color: "#fff", border: "none", padding: "8px 18px" }}>
                {deleting ? "Deleting…" : <><Trash2 size={13} /> Delete Plan</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI error */}
      {aiError && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12, fontSize: 13, color: "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {aiError}
          <button onClick={() => setAiError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}><X size={14} /></button>
        </div>
      )}

      {/* AI reasoning banner */}
      {hasAi && profile.aiReasoning && (
        <div style={{ marginBottom: 18, background: "#f5f3ff", border: "1.5px solid #ddd6fe", borderRadius: 12, overflow: "hidden" }}>
          <button onClick={() => setAiReasoningOpen((v) => !v)} style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Outfit',sans-serif" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#6d28d9", display: "flex", alignItems: "center", gap: 7 }}><Sparkles size={13} /> AI Optimisation Reasoning</span>
            {aiReasoningOpen ? <ChevronUp size={15} color="#6d28d9" /> : <ChevronDown size={15} color="#6d28d9" />}
          </button>
          {aiReasoningOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 13, color: "#4c1d95", lineHeight: 1.7 }}>{profile.aiReasoning}</div>
          )}
        </div>
      )}

      {/* Intake Form — always visible when canEdit; auto-opens only for brand-new patients */}
      {canEdit && (
        <IntakeFormCard profile={profile} onSave={persist} saving={saving} isNew={isNew} canEdit={canEdit} />
      )}

      {/* Patient Variables */}
      {(canEdit || !isNew) && <SetupCard profile={profile} onSave={persist} saving={saving} isNew={isNew} />}

      {/* InBody — visible as soon as physio opens the plan (not gated on isNew) */}
      {canEdit && <InBodyCard profile={profile} onSave={persist} saving={saving} />}

      {/* Plan */}
      {!isNew && (
        <>
          {activeMeals.map((meal) => (
            <MealCard key={meal.id} meal={meal} profile={profile} canEdit={canEdit} onOverride={handleOverride} onClearOverride={handleClearOverride} />
          ))}

          {/* Water */}
          <div style={CARD}>
            <div style={{ ...CARD_TITLE, marginBottom: 14 }}>Daily Water Intake</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#1d4ed8" }}>{profile.aiQuantities?.waterLiters ?? waterL} L</div>
                <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2, fontWeight: 500 }}>Daily Minimum</div>
              </div>
              {[["Before Training","0.5 L","1–2 hrs before"],["During Training","1.0 L","Throughout session"],["After Training","0.5 L","1–2 hrs after"]].map(([label,amount,sub]) => (
                <div key={label} style={{ flex: "1 1 120px", background: "#fafaf8", border: "1px solid #e5e0d8", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{amount}</div>
                  <div style={{ fontSize: 12, color: "#9a9590", marginTop: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#b4b0ab", marginTop: 1 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Supplements */}
          <SupplementsCard profile={profile} onSave={persist} saving={saving} />

          {/* Guidelines */}
          <div style={CARD}>
            <button onClick={() => setGuidelinesOpen((v) => !v)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0, fontFamily: "'Outfit',sans-serif" }}>
              <div>
                <div style={CARD_TITLE}>Plan Guidelines</div>
                <div style={{ fontSize: 12.5, color: "#9a9590", marginTop: 2 }}>Allowed foods, prohibited items & general notes</div>
              </div>
              {guidelinesOpen ? <ChevronUp size={16} color="#9a9590" /> : <ChevronDown size={16} color="#9a9590" />}
            </button>
            {guidelinesOpen && (
              <div style={{ marginTop: 18 }}>
                <GuidelineSection title="Free Vegetables (unlimited)"  color="#16a34a" dot="#86efac" items={GUIDELINES.freeVeg}   note="Can add lemon & apple cider vinegar in any amount" />
                <GuidelineSection title="Cooked Vegetables"            color="#16a34a" dot="#86efac" items={GUIDELINES.cookedVeg}  note="Grilled or boiled WITHOUT oil, or cooked with tomato sauce only." />
                <GuidelineSection title="Allowed Proteins"             color="#ea580c" dot="#fed7aa" items={GUIDELINES.proteins}   note="All proteins cooked without oil or ghee. Weigh after cooking." />
                <GuidelineSection title="Allowed Fruits"               color="#7c3aed" dot="#ddd6fe" items={GUIDELINES.fruits} />
                <GuidelineSection title="Allowed Extras & Beverages"   color="#0369a1" dot="#bae6fd" items={GUIDELINES.allowed} />
                <div style={{ marginTop: 14, padding: "14px 16px", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Prohibited</div>
                  {GUIDELINES.prohibited.map((item) => <div key={item} style={{ fontSize: 13, color: "#dc2626", lineHeight: 1.8 }}>✕ {item}</div>)}
                </div>
                <div style={{ marginTop: 12, padding: "12px 14px", background: "#1a1a1a", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "center" }}>Do not eat more… and do not eat less than written</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {isNew && !canEdit && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#9a9590" }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>Your nutrition plan hasn't been set up yet.</div>
          <div style={{ fontSize: 13 }}>Please ask your physiotherapist to configure it.</div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
