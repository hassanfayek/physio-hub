// FILE: src/services/diagnosisTemplateService.ts
import {
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, query, orderBy, serverTimestamp, getDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { assignExerciseToPatient } from "./exerciseService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateExercise {
  exerciseId:   string;
  exerciseName: string;
  sets:         number;
  reps:         number;
  holdTime:     number;
  notes:        string;
  programType:  "clinic" | "home";
  mediaUrl:     string;
  videoId:      string;
}

export interface DiagnosisTemplate {
  id:                 string;
  name:               string;
  bodyPart:           string;
  description:        string;
  // Diagnosis fields
  primaryDiagnosis:   string;
  icdCode:            string;
  mechanism:          string;
  contraindications:  string;
  // Treatment program
  treatmentType:      string;
  treatmentGoals:     string;
  treatmentNotes:     string;
  // Exercises
  exercises:          TemplateExercise[];
  createdBy:          string;
  createdAt:          Timestamp | null;
}

export interface CreateTemplatePayload {
  name:               string;
  bodyPart:           string;
  description:        string;
  primaryDiagnosis:   string;
  icdCode:            string;
  mechanism:          string;
  contraindications:  string;
  treatmentType:      string;
  treatmentGoals:     string;
  treatmentNotes:     string;
  exercises:          TemplateExercise[];
  createdBy:          string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const map: Record<string, string> = {
    "permission-denied": "You do not have permission to perform this action.",
  };
  return map[e.code ?? ""] ?? e.message ?? "An unexpected error occurred.";
}

function docToTemplate(id: string, data: Record<string, unknown>): DiagnosisTemplate {
  const exRaw = (data.exercises as Record<string, unknown>[] | undefined) ?? [];
  return {
    id,
    name:               (data.name               as string) ?? "",
    bodyPart:           (data.bodyPart           as string) ?? "",
    description:        (data.description        as string) ?? "",
    primaryDiagnosis:   (data.primaryDiagnosis   as string) ?? "",
    icdCode:            (data.icdCode            as string) ?? "",
    mechanism:          (data.mechanism          as string) ?? "",
    contraindications:  (data.contraindications  as string) ?? "",
    treatmentType:      (data.treatmentType      as string) ?? "",
    treatmentGoals:     (data.treatmentGoals     as string) ?? "",
    treatmentNotes:     (data.treatmentNotes     as string) ?? "",
    exercises: exRaw.map((e) => ({
      exerciseId:   (e.exerciseId   as string) ?? "",
      exerciseName: (e.exerciseName as string) ?? "",
      sets:         (e.sets         as number) ?? 3,
      reps:         (e.reps         as number) ?? 10,
      holdTime:     (e.holdTime     as number) ?? 0,
      notes:        (e.notes        as string) ?? "",
      programType:  ((e.programType as string) === "home" ? "home" : "clinic"),
      mediaUrl:     (e.mediaUrl     as string) ?? "",
      videoId:      (e.videoId      as string) ?? "",
    })),
    createdBy:  (data.createdBy as string) ?? "",
    createdAt:  (data.createdAt as Timestamp | null) ?? null,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function subscribeToTemplates(
  onData:   (templates: DiagnosisTemplate[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "diagnosisTemplates"), orderBy("name", "asc")),
    (snap) => onData(snap.docs.map((d) => docToTemplate(d.id, d.data() as Record<string, unknown>))),
    (err)  => onError?.(err),
  );
}

export async function createTemplate(
  payload: CreateTemplatePayload,
): Promise<{ id: string } | { error: string }> {
  try {
    const ref = await addDoc(collection(db, "diagnosisTemplates"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function updateTemplate(
  id: string,
  payload: Partial<CreateTemplatePayload>,
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "diagnosisTemplates", id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "diagnosisTemplates", id));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Apply template to a patient ──────────────────────────────────────────────

export interface ApplyTemplateResult {
  exercisesAdded:  number;
  diagnosisSet:    boolean;
  treatmentAdded:  boolean;
  error?:          string;
}

export async function applyTemplateToPatient(
  templateId: string,
  patientId:  string,
  physioId:   string,
): Promise<ApplyTemplateResult> {
  const result: ApplyTemplateResult = {
    exercisesAdded: 0,
    diagnosisSet:   false,
    treatmentAdded: false,
  };

  try {
    // 1. Load template
    const tSnap = await getDoc(doc(db, "diagnosisTemplates", templateId));
    if (!tSnap.exists()) return { ...result, error: "Template not found." };
    const t = docToTemplate(tSnap.id, tSnap.data() as Record<string, unknown>);

    // 2. Assign exercises (skip if nothing to add)
    if (t.exercises.length > 0) {
      const results = await Promise.allSettled(
        t.exercises.map((ex) =>
          assignExerciseToPatient({
            patientId,
            exerciseId:   ex.exerciseId,
            exerciseName: ex.exerciseName,
            sets:         ex.sets,
            reps:         ex.reps,
            holdTime:     ex.holdTime,
            notes:        ex.notes,
            createdBy:    physioId,
            mediaUrl:     ex.mediaUrl,
            videoId:      ex.videoId,
            programType:  ex.programType,
          }),
        ),
      );
      result.exercisesAdded = results.filter((r) => r.status === "fulfilled").length;
    }

    // 3. Set diagnosis — only if patient has no primaryDiagnosis yet
    const diagSnap = await getDoc(doc(db, "patientDiagnosis", patientId));
    const existingDiag = diagSnap.exists()
      ? ((diagSnap.data() as Record<string, unknown>).primaryDiagnosis as string | undefined) ?? ""
      : "";
    if (!existingDiag && (t.primaryDiagnosis || t.icdCode)) {
      await setDoc(doc(db, "patientDiagnosis", patientId), {
        primaryDiagnosis:  t.primaryDiagnosis,
        icdCode:           t.icdCode,
        mechanism:         t.mechanism,
        contraindications: t.contraindications,
        onsetDate:         "",
        surgeryDate:       "",
        surgeon:           "",
        updatedAt:         serverTimestamp(),
      });
      result.diagnosisSet = true;
    }

    // 4. Add treatment program entry if notes or goals present
    if (t.treatmentNotes || t.treatmentGoals) {
      await addDoc(collection(db, "patientSessions"), {
        patientId,
        physioId,
        date:          new Date().toISOString().slice(0, 10),
        treatmentType: t.treatmentType || "Exercise Therapy",
        notes:         t.treatmentNotes,
        entryMode:     "plan",
        goals:         t.treatmentGoals,
        createdAt:     serverTimestamp(),
      });
      result.treatmentAdded = true;
    }

    return result;
  } catch (err) {
    return { ...result, error: parseError(err) };
  }
}
