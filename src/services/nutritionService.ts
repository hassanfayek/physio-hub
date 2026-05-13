// FILE: src/services/nutritionService.ts

import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NutritionGoal = "weight_loss" | "maintenance" | "muscle_gain" | "performance";
export type ActivityLevel = "sedentary"   | "moderate"   | "active"      | "athlete";

export interface InBodyData {
  measuredAt:         string;        // ISO date string  (YYYY-MM-DD)
  weight:             number | null; // kg  — InBody scale weight
  skeletalMuscleMass: number | null; // kg  — SMM
  bodyFatMass:        number | null; // kg
  bodyFatPercent:     number | null; // %
  bmi:                number | null;
  bmr:                number | null; // kcal / day  — Basal Metabolic Rate
  visceralFatLevel:   number | null; // 1 – 20
  totalBodyWater:     number | null; // L
  notes:              string;
}

export interface CustomSupplement {
  id:     string;
  name:   string;
  timing: string;
}

export interface IntakeForm {
  height:              number | null;
  age:                 number | null;
  target:              string;
  mealsPerDay:         4 | 5;
  allergies:           string;
  trainingHistory:     string;
  currentSupplements:  string;
  carbPreferences:     string[];
  proteinPreferences:  string[];
  fruitPreferences:    string[];
  fatPreferences:      string[];
  trainingLocation:    "gym" | "home";
  trainingDaysPerWeek: number;
  dailyRoutine:        string;
  medicalCondition:    string;
  comments:            string;
  completedAt:         string;
}

export interface NutritionProfile {
  weight:        number;              // kg  (self-reported; InBody weight takes precedence in calc)
  gender:        "male" | "female";
  goal:          NutritionGoal;
  activityLevel: ActivityLevel;
  overrides:     Record<string, number>; // manual overrides: itemId → quantity
  inBodyHistory?: InBodyData[];   // array sorted newest-first; replaces old inBody field
  supplements?:   CustomSupplement[];
  aiQuantities?: Record<string, number>; // last AI-optimised quantities
  aiReasoning?:  string;                 // AI explanation
  intakeForm?:   IntakeForm;
}

export const DEFAULT_INBODY: InBodyData = {
  measuredAt:         "",
  weight:             null,
  skeletalMuscleMass: null,
  bodyFatMass:        null,
  bodyFatPercent:     null,
  bmi:                null,
  bmr:                null,
  visceralFatLevel:   null,
  totalBodyWater:     null,
  notes:              "",
};

export const DEFAULT_INTAKE_FORM: IntakeForm = {
  height:              null,
  age:                 null,
  target:              "",
  mealsPerDay:         5,
  allergies:           "",
  trainingHistory:     "",
  currentSupplements:  "",
  carbPreferences:     [],
  proteinPreferences:  [],
  fruitPreferences:    [],
  fatPreferences:      [],
  trainingLocation:    "gym",
  trainingDaysPerWeek: 3,
  dailyRoutine:        "",
  medicalCondition:    "",
  comments:            "",
  completedAt:         "",
};

export const DEFAULT_SUPPLEMENTS: CustomSupplement[] = [
  { id: "s1", name: "Omega 3 — 1,000 mg", timing: "1 pill after breakfast · 1 pill after lunch" },
  { id: "s2", name: "Vi Drop",             timing: "2 pills in the morning · 1 pill after lunch" },
  { id: "s3", name: "Calmag",              timing: "1 pill in the morning · 1 pill after dinner"  },
  { id: "s4", name: "Multivitamin",        timing: "1 pill after dinner"                          },
];

export const DEFAULT_NUTRITION_PROFILE: NutritionProfile = {
  weight:        75,
  gender:        "male",
  goal:          "maintenance",
  activityLevel: "moderate",
  overrides:     {},
  supplements:   DEFAULT_SUPPLEMENTS,
};

// ─── Firestore ops ────────────────────────────────────────────────────────────

export async function getNutritionProfile(
  patientId: string
): Promise<NutritionProfile | null> {
  const snap = await getDoc(doc(db, "nutritionProfiles", patientId));
  if (!snap.exists()) return null;
  const d = snap.data() as Partial<NutritionProfile>;
  return {
    weight:        d.weight        ?? DEFAULT_NUTRITION_PROFILE.weight,
    gender:        d.gender        ?? DEFAULT_NUTRITION_PROFILE.gender,
    goal:          d.goal          ?? DEFAULT_NUTRITION_PROFILE.goal,
    activityLevel: d.activityLevel ?? DEFAULT_NUTRITION_PROFILE.activityLevel,
    overrides:      d.overrides ?? {},
    // migrate legacy single inBody doc to array
    inBodyHistory:  d.inBodyHistory ?? ((d as Record<string, unknown>).inBody ? [(d as Record<string, unknown>).inBody as InBodyData] : undefined),
    supplements:    d.supplements ?? DEFAULT_SUPPLEMENTS,
    aiQuantities:  d.aiQuantities  ?? undefined,
    aiReasoning:   d.aiReasoning   ?? undefined,
    intakeForm:    d.intakeForm    ?? undefined,
  };
}

export async function saveNutritionProfile(
  patientId: string,
  profile:   NutritionProfile
): Promise<{ error?: string }> {
  try {
    await setDoc(doc(db, "nutritionProfiles", patientId), {
      ...profile,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? "Failed to save." };
  }
}

export async function deleteNutritionProfile(
  patientId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "nutritionProfiles", patientId));
    return {};
  } catch (err) {
    return { error: (err as Error).message ?? "Failed to delete." };
  }
}
