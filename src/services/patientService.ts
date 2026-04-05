// FILE: src/services/patientService.ts

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Patient {
  uid:              string;
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string;
  occupation:       string;
  physioId:         string;
  status:           "active" | "discharged" | "on_hold";
  createdAt:        Timestamp | null;
  seniorEditorId:   string | null;
  seniorEditorName: string | null;
  juniorId:         string | null;
  juniorName:       string | null;
  traineeId:        string | null;
  traineeName:      string | null;
}

export type PhysioRank = "senior" | "junior" | "trainee";

export interface Physiotherapist {
  uid:             string;
  firstName:       string;
  lastName:        string;
  clinicName:      string;
  licenseNumber:   string;
  phone:           string;
  specializations: string[];
  rank:            PhysioRank;
}

export interface CreatePatientPayload {
  firstName:  string;
  lastName:   string;
  occupation: string;
  physioId:   string;
  dateOfBirth?: string;
  phone?:       string;
}

export interface CreatePatientResult {
  patient: Patient;
  code:    string; // the generated access code — show once to the staff
  error?:  never;
}

export interface CreatePatientError {
  patient?: never;
  code?:    never;
  error:    string;
}

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const map: Record<string, string> = {
    "auth/email-already-in-use": "A patient with this email already exists.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "permission-denied":         "You do not have permission to perform this action.",
  };
  return map[e.code ?? ""] ?? e.message ?? "An unexpected error occurred.";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docToPatient(id: string, data: Record<string, unknown>): Patient {
  return {
    uid:       id,
    firstName: (data.firstName as string) ?? "",
    lastName:  (data.lastName  as string) ?? "",
    email:     (data.email     as string) ?? "",
    phone:     (data.phone     as string) ?? "",
    occupation: (data.occupation as string) ?? "",
    physioId:  (data.physioId  as string) ?? "",
    status:           (data.status           as Patient["status"]) ?? "active",
    createdAt:        (data.createdAt        as Timestamp | null) ?? null,
    seniorEditorId:   (data.seniorEditorId   as string | null) ?? null,
    seniorEditorName: (data.seniorEditorName as string | null) ?? null,
    juniorId:         (data.juniorId         as string | null) ?? null,
    juniorName:       (data.juniorName       as string | null) ?? null,
    traineeId:        (data.traineeId        as string | null) ?? null,
    traineeName:      (data.traineeName      as string | null) ?? null,
  };
}

function docToPhysio(id: string, data: Record<string, unknown>): Physiotherapist {
  return {
    uid:             id,
    firstName:       (data.firstName       as string)   ?? "",
    lastName:        (data.lastName        as string)   ?? "",
    clinicName:      (data.clinicName      as string)   ?? "",
    licenseNumber:   (data.licenseNumber   as string)   ?? "",
    phone:           (data.phone           as string)   ?? "",
    specializations: (data.specializations as string[]) ?? [],
    rank:            ((data.rank as string) === "junior" ? "junior"
                   : (data.rank as string) === "trainee" ? "trainee"
                   : "senior") as PhysioRank,
  };
}

// ─── Create patient ───────────────────────────────────────────────────────────
// Uses a secondary Firebase app so the manager/physio session stays intact.
// Generates a unique access code — no email/password required from the clinic.

export async function createPatient(
  payload: CreatePatientPayload
): Promise<CreatePatientResult | CreatePatientError> {
  try {
    const { generatePatientCode, codeToEmail } = await import("./authService");
    const { initializeApp, getApps } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");

    const code  = generatePatientCode();
    const email = codeToEmail(code);

    const SECONDARY_APP_NAME = "patient-creation-worker";
    const secondaryApp =
      getApps().find((a) => a.name === SECONDARY_APP_NAME) ??
      initializeApp(
        (await import("../firebase")).default.options,
        SECONDARY_APP_NAME
      );

    const secondaryAuth: Auth = getAuth(secondaryApp);
    const { getFirestore: getSecondaryFirestore } = await import("firebase/firestore");
    const secondaryDb = getSecondaryFirestore(secondaryApp);

    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      code   // password = the code itself
    );
    const { uid } = credential.user;

    const displayName = `${payload.firstName} ${payload.lastName}`;

    // Write users doc as the new patient (secondary auth) — satisfies uid == request.auth.uid rule
    await setDoc(doc(secondaryDb, "users", uid), {
      email,
      role:        "patient",
      displayName,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });

    await secondaryAuth.signOut();

    // Write patients doc as the manager (main db) — satisfies isStaff() rule
    await setDoc(doc(db, "patients", uid), {
      firstName:    payload.firstName,
      lastName:     payload.lastName,
      email,
      occupation:   payload.occupation,
      physioId:     payload.physioId,
      dateOfBirth:  payload.dateOfBirth ?? "",
      phone:        payload.phone ?? "",
      accessCode:   code,
      status:       "active",
      createdAt:    serverTimestamp(),
    });

    return {
      patient: {
        uid,
        firstName: payload.firstName,
        lastName:  payload.lastName,
        email,
        phone:     payload.phone ?? "",
        occupation: payload.occupation,
        physioId:  payload.physioId,
        status:    "active",
        createdAt: null,
        seniorEditorId:   null,
        seniorEditorName: null,
        juniorId:         null,
        juniorName:       null,
        traineeId:        null,
        traineeName:      null,
      },
      code,
    };
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Delete patient ───────────────────────────────────────────────────────────
// Removes Firestore docs AND calls the deleteAuthUser Cloud Function to delete
// the Firebase Auth account (requires Admin SDK — only possible server-side).

export async function deletePatient(
  patientId: string
): Promise<{ error?: string }> {
  try {
    // 1. Delete Firestore documents
    await deleteDoc(doc(db, "patients", patientId));
    await deleteDoc(doc(db, "users",    patientId));

    // 2. Call Cloud Function to delete Auth account
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const { default: app } = await import("../firebase");
      const functions = getFunctions(app);
      const deleteAuthUser = httpsCallable(functions, "deleteAuthUser");
      await deleteAuthUser({ uid: patientId });
    } catch {
      // Auth deletion is best-effort — Firestore docs are already deleted
    }

    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Assign patient to a physiotherapist ─────────────────────────────────────

export async function assignPatientToPhysio(
  patientId: string,
  physioId:  string
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "patients", patientId), {
      physioId,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Assign senior editor to a patient ──────────────────────────────────────
// Only clinic_manager should call this. Writes seniorEditorId + seniorEditorName
// into patients/{patientId}. Pass null to clear the assignment.

export async function assignSeniorEditor(
  patientId:        string,
  seniorEditorId:   string | null,
  seniorEditorName: string | null
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "patients", patientId), {
      seniorEditorId,
      seniorEditorName,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Assign all staff to a patient (senior required, junior/trainee optional) ──

export async function assignPatientStaff(
  patientId: string,
  updates: {
    seniorEditorId?:   string | null;
    seniorEditorName?: string | null;
    juniorId?:         string | null;
    juniorName?:       string | null;
    traineeId?:        string | null;
    traineeName?:      string | null;
  }
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "patients", patientId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Realtime listener: single patient document ───────────────────────────────
// Used by PatientSheetPage to get live seniorEditorId / seniorEditorName.

export function subscribeToPatient(
  patientId: string,
  onData:    (patient: Patient) => void,
  onError?:  (err: Error) => void
): () => void {
  return onSnapshot(
    doc(db, "patients", patientId),
    (snap) => {
      if (snap.exists()) onData(docToPatient(snap.id, snap.data()));
    },
    (err) => onError?.(err)
  );
}

// ─── Realtime listener: patients for a specific physio ────────────────────────
// Queries physioId field only (legacy — use subscribeToPhysioPatients for full coverage)

export function subscribeToPatients(
  physioId: string,
  onData:   (patients: Patient[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, "patients"),
    where("physioId", "==", physioId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToPatient(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Realtime listener: all patients assigned to a physio in any role ─────────
// Covers physioId (primary), seniorEditorId, juniorId, traineeId.
// Firestore doesn't support OR across fields — we run 4 parallel snapshots
// and merge them client-side, deduplicating by uid.

export function subscribeToPhysioPatients(
  physioId: string,
  onData:   (patients: Patient[]) => void,
  onError?: (err: Error) => void
): () => void {
  // Map from uid → Patient, updated by any of the 4 listeners
  const byUid = new Map<string, Patient>();

  const notify = () => {
    const merged = Array.from(byUid.values()).sort((a, b) => {
      const ta = (a.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
      const tb = (b.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
      return tb - ta;
    });
    onData(merged);
  };

  const makeQ = (field: string) =>
    query(collection(db, "patients"), where(field, "==", physioId));

  const unsubs = [
    "physioId",
    "seniorEditorId",
    "juniorId",
    "traineeId",
  ].map((field) =>
    onSnapshot(
      makeQ(field),
      (snap) => {
        snap.docs.forEach((d) => byUid.set(d.id, docToPatient(d.id, d.data())));
        // Also handle removals: if a doc is no longer in this snapshot
        // we can't remove it here (another field may still match),
        // so we re-query on next snapshot trigger instead
        notify();
      },
      (err) => onError?.(err)
    )
  );

  return () => unsubs.forEach((u) => u());
}

// ─── Realtime listener: ALL patients (clinic manager) ─────────────────────────

export function subscribeToAllPatients(
  onData:   (patients: Patient[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, "patients"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToPatient(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Realtime listener: all physiotherapists ─────────────────────────────────

export function subscribeToPhysiotherapists(
  onData:   (physios: Physiotherapist[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, "physiotherapists"),
    orderBy("lastName", "asc")
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToPhysio(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}
