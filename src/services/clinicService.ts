// FILE: src/services/clinicService.ts
// Multi-tenant clinic management — each document represents one subscribed clinic.

import {
  collection, doc, setDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClinicPlan   = "starter" | "clinic" | "enterprise";
export type ClinicStatus = "trial" | "active" | "suspended" | "expired";

export interface Clinic {
  id:           string;
  slug:         string;
  name:         string;
  plan:         ClinicPlan;
  status:       ClinicStatus;
  trialEndsAt:  Timestamp | null;
  ownerUid:     string;
  ownerEmail:   string;
  phone:        string;
  address:      string;
  createdAt:    Timestamp | null;
  updatedAt:    Timestamp | null;
  planLimits: {
    maxPhysios:  number;
    maxPatients: number;
  };
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<ClinicPlan, { maxPhysios: number; maxPatients: number }> = {
  starter:    { maxPhysios: 2,  maxPatients: 30  },
  clinic:     { maxPhysios: 10, maxPatients: 200 },
  enterprise: { maxPhysios: -1, maxPatients: -1  },
};

export const PLAN_LABELS: Record<ClinicPlan, string> = {
  starter:    "Starter",
  clinic:     "Clinic",
  enterprise: "Enterprise",
};

export const PLAN_PRICES: Record<ClinicPlan, string> = {
  starter:    "Free trial → EGP 499/mo",
  clinic:     "EGP 1,299/mo",
  enterprise: "Custom pricing",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  return (err as { message?: string }).message ?? "An unexpected error occurred.";
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

function docToClinic(id: string, d: Record<string, unknown>): Clinic {
  return {
    id,
    slug:        (d.slug        as string)       ?? "",
    name:        (d.name        as string)       ?? "",
    plan:        (d.plan        as ClinicPlan)   ?? "starter",
    status:      (d.status      as ClinicStatus) ?? "trial",
    trialEndsAt: (d.trialEndsAt as Timestamp | null) ?? null,
    ownerUid:    (d.ownerUid    as string)       ?? "",
    ownerEmail:  (d.ownerEmail  as string)       ?? "",
    phone:       (d.phone       as string)       ?? "",
    address:     (d.address     as string)       ?? "",
    createdAt:   (d.createdAt   as Timestamp | null) ?? null,
    updatedAt:   (d.updatedAt   as Timestamp | null) ?? null,
    planLimits:  (d.planLimits  as Clinic["planLimits"]) ?? PLAN_LIMITS[(d.plan as ClinicPlan) ?? "starter"],
  };
}

// ─── Slug availability ────────────────────────────────────────────────────────

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const snap = await getDocs(query(collection(db, "clinics"), where("slug", "==", slug)));
  return snap.empty;
}

// ─── Create clinic ────────────────────────────────────────────────────────────

export async function createClinic(data: {
  slug:       string;
  name:       string;
  plan:       ClinicPlan;
  ownerUid:   string;
  ownerEmail: string;
  phone?:     string;
  address?:   string;
}): Promise<Clinic> {
  const id  = doc(collection(db, "clinics")).id;
  const now = serverTimestamp();

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const clinicData = {
    slug:        data.slug,
    name:        data.name,
    plan:        data.plan,
    status:      "trial" as ClinicStatus,
    trialEndsAt: trialEnd,
    ownerUid:    data.ownerUid,
    ownerEmail:  data.ownerEmail,
    phone:       data.phone    ?? "",
    address:     data.address  ?? "",
    planLimits:  PLAN_LIMITS[data.plan],
    createdAt:   now,
    updatedAt:   now,
  };

  await setDoc(doc(db, "clinics", id), clinicData);

  return docToClinic(id, { ...clinicData, createdAt: null, updatedAt: null, trialEndsAt: null });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getClinicById(id: string): Promise<Clinic | null> {
  const snap = await getDoc(doc(db, "clinics", id));
  return snap.exists() ? docToClinic(snap.id, snap.data()) : null;
}

export async function getClinicBySlug(slug: string): Promise<Clinic | null> {
  const snap = await getDocs(query(collection(db, "clinics"), where("slug", "==", slug)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return docToClinic(d.id, d.data());
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateClinic(
  id:      string,
  updates: Partial<Pick<Clinic, "name" | "slug" | "phone" | "address" | "plan" | "status">>,
): Promise<{ error?: string }> {
  try {
    const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
    if (updates.plan) payload.planLimits = PLAN_LIMITS[updates.plan];
    await updateDoc(doc(db, "clinics", id), payload);
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function setClinicStatus(
  id:     string,
  status: ClinicStatus,
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "clinics", id), { status, updatedAt: serverTimestamp() });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function subscribeToAllClinics(
  onData:   (clinics: Clinic[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "clinics"), orderBy("createdAt", "desc")),
    (snap) => onData(snap.docs.map((d) => docToClinic(d.id, d.data()))),
    onError,
  );
}

export function subscribeToClinic(
  id:       string,
  onData:   (clinic: Clinic) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, "clinics", id),
    (snap) => { if (snap.exists()) onData(docToClinic(snap.id, snap.data())); },
    onError,
  );
}
