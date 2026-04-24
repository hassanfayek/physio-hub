// FILE: src/services/partnerService.ts
// Referral partner accounts — read-only portal for gym/clinic partners.

import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Partner {
  uid:              string;
  name:             string;          // contact person name
  organizationName: string;          // gym / clinic name
  email:            string;
  phone:            string;
  sharePercent:     number;          // e.g. 40  (partner gets 40%)
  createdAt:        Timestamp | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { message?: string };
  return e.message ?? "An unexpected error occurred.";
}

function docToPartner(id: string, data: Record<string, unknown>): Partner {
  return {
    uid:              id,
    name:             (data.name             as string)  ?? "",
    organizationName: (data.organizationName as string)  ?? "",
    email:            (data.email            as string)  ?? "",
    phone:            (data.phone            as string)  ?? "",
    sharePercent:     (data.sharePercent     as number)  ?? 40,
    createdAt:        (data.createdAt        as Timestamp | null) ?? null,
  };
}

// ─── Create partner account (manager calls this) ──────────────────────────────
// Creates Firebase Auth + users doc + partners doc via secondaryAuth so the
// manager session is not disrupted.

export async function registerPartner(data: {
  name:             string;
  organizationName: string;
  email:            string;
  password:         string;
  phone:            string;
  sharePercent:     number;
}): Promise<Partner> {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth, createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
  const { default: app } = await import("../firebase");

  const SECONDARY = "partner-creation-worker";
  const secondaryApp =
    getApps().find((a) => a.name === SECONDARY) ??
    initializeApp(app.options, SECONDARY);
  const secondaryAuth = getAuth(secondaryApp);

  const credential = await createUserWithEmailAndPassword(
    secondaryAuth, data.email, data.password
  );
  const { user } = credential;
  await updateProfile(user, { displayName: data.name });

  const now = serverTimestamp();

  await setDoc(doc(db, "users", user.uid), {
    email:       data.email,
    role:        "partner",
    displayName: data.name,
    createdAt:   now,
    updatedAt:   now,
  });

  await setDoc(doc(db, "partners", user.uid), {
    name:             data.name,
    organizationName: data.organizationName,
    email:            data.email,
    phone:            data.phone,
    sharePercent:     data.sharePercent,
    createdAt:        now,
  });

  await secondaryAuth.signOut();

  return {
    uid:              user.uid,
    name:             data.name,
    organizationName: data.organizationName,
    email:            data.email,
    phone:            data.phone,
    sharePercent:     data.sharePercent,
    createdAt:        null,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function updatePartner(
  uid:     string,
  updates: Partial<Omit<Partner, "uid" | "createdAt">>
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "partners", uid), { ...updates, updatedAt: serverTimestamp() });
    if (updates.name) {
      await updateDoc(doc(db, "users", uid), { displayName: updates.name, updatedAt: serverTimestamp() });
    }
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deletePartner(uid: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "partners", uid));
    await deleteDoc(doc(db, "users",    uid));
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const { default: app } = await import("../firebase");
      const fn = httpsCallable(getFunctions(app), "deleteAuthUser");
      await fn({ uid });
    } catch { /* best-effort */ }
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function subscribeToPartners(
  onData:   (partners: Partner[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, "partners"), orderBy("createdAt", "desc")),
    (snap) => onData(snap.docs.map((d) => docToPartner(d.id, d.data()))),
    onError
  );
}

export function subscribeToPartner(
  uid:      string,
  onData:   (partner: Partner) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    doc(db, "partners", uid),
    (snap) => { if (snap.exists()) onData(docToPartner(snap.id, snap.data())); },
    onError
  );
}

// ─── Assign / unassign partner from a patient ─────────────────────────────────

export async function assignPartnerToPatient(
  patientId: string,
  partnerId: string | null,
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "patients", patientId), {
      referredByPartnerId: partnerId ?? "",
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Subscribe to a partner's referred patients' packages (for earnings) ──────

export function subscribeToPartnerPatients(
  partnerId: string,
  onData:    (patients: Array<{ uid: string; firstName: string; lastName: string; phone: string }>) => void,
  onError?:  (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, "patients"), where("referredByPartnerId", "==", partnerId)),
    (snap) => onData(snap.docs.map((d) => {
      const data = d.data();
      return {
        uid:       d.id,
        firstName: (data.firstName as string) ?? "",
        lastName:  (data.lastName  as string) ?? "",
        phone:     (data.phone     as string) ?? "",
      };
    })),
    onError
  );
}

export function subscribeToPartnerPackages(
  _partnerId: string,
  patientIds: string[],
  onData:    (packages: Array<{
    id: string; patientId: string; packageSize: number;
    sessionsUsed: number; paidAmount: number; active: boolean;
  }>) => void,
  onError?:  (err: Error) => void
): (() => void) | null {
  if (patientIds.length === 0) { onData([]); return null; }

  // Firestore `in` supports up to 30 values; partners typically have few patients
  const chunks: string[][] = [];
  for (let i = 0; i < patientIds.length; i += 30) {
    chunks.push(patientIds.slice(i, i + 30));
  }

  const results = new Map<string, ReturnType<typeof onData> extends void ? never : never>();
  const allPkgs = new Map<string, object>();

  const unsubs = chunks.map((chunk) =>
    onSnapshot(
      query(collection(db, "patientPackages"), where("patientId", "in", chunk)),
      (snap) => {
        snap.docs.forEach((d) => allPkgs.set(d.id, { id: d.id, ...d.data() }));
        onData(Array.from(allPkgs.values()) as Parameters<typeof onData>[0]);
      },
      onError
    )
  );

  void results;
  return () => unsubs.forEach((u) => u());
}
