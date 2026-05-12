// FILE: src/services/nutritionService.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NutritionGoal     = "weight_loss" | "maintenance" | "muscle_gain" | "performance";
export type ActivityLevel     = "sedentary"   | "moderate"   | "active"      | "athlete";
export type CarbChoice        = "rice"        | "potatoes";
export type Meal3ProteinChoice = "tuna"       | "chicken";

export interface NutritionProfile {
  weight:        number;              // kg
  gender:        "male" | "female";
  goal:          NutritionGoal;
  activityLevel: ActivityLevel;
  carbChoice:    CarbChoice;
  meal3Choice:   Meal3ProteinChoice;
  overrides:     Record<string, number>; // itemId → custom quantity (grams or count)
}

export const DEFAULT_NUTRITION_PROFILE: NutritionProfile = {
  weight:        75,
  gender:        "male",
  goal:          "maintenance",
  activityLevel: "moderate",
  carbChoice:    "rice",
  meal3Choice:   "chicken",
  overrides:     {},
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
    carbChoice:    d.carbChoice    ?? DEFAULT_NUTRITION_PROFILE.carbChoice,
    meal3Choice:   d.meal3Choice   ?? DEFAULT_NUTRITION_PROFILE.meal3Choice,
    overrides:     d.overrides     ?? {},
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
