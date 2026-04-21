// FILE: src/services/notificationService.ts

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifType =
  | "appointment_booked"
  | "appointment_cancelled"
  | "patient_confirmed"
  | "new_patient"
  | "package_expiring"
  | "unpaid_balance";

export interface AppNotification {
  id:         string;
  type:       NotifType;
  title:      string;
  body:       string;
  read:       boolean;
  createdAt:  Timestamp | null;
  sourceId?:  string;
  patientId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemsCol(userId: string) {
  return collection(db, "notifications", userId, "items");
}

// ─── Real-time subscription (latest 50, newest first) ─────────────────────────

export function subscribeToNotifications(
  userId:   string,
  onData:   (notifs: AppNotification[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(itemsCol(userId), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification))),
    onError
  );
}

// ─── Send a single notification (deduplicates via sourceId) ──────────────────

export async function sendNotification(
  userId: string,
  notif:  Omit<AppNotification, "id" | "createdAt" | "read">
): Promise<void> {
  if (notif.sourceId) {
    const existing = await getDocs(
      query(itemsCol(userId), where("sourceId", "==", notif.sourceId))
    );
    if (!existing.empty) return;
  }
  await addDoc(itemsCol(userId), { ...notif, read: false, createdAt: serverTimestamp() });
}

// ─── Staff UID cache (lazy-loaded once per session) ───────────────────────────

let staffCache: { managerIds: string[]; secretaryIds: string[] } | null = null;

async function getStaffUids(): Promise<{ managerIds: string[]; secretaryIds: string[] }> {
  if (staffCache) return staffCache;
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "in", ["clinic_manager", "secretary"]))
  );
  const managerIds: string[] = [];
  const secretaryIds: string[] = [];
  snap.forEach((d) => {
    const r = d.data().role as string;
    if (r === "clinic_manager") managerIds.push(d.id);
    else                        secretaryIds.push(d.id);
  });
  staffCache = { managerIds, secretaryIds };
  return staffCache;
}

// ─── Fanout: notify managers + secretaries + optional physio ──────────────────

export async function notifyStaff(
  notif: Omit<AppNotification, "id" | "createdAt" | "read">,
  opts:  { managers?: boolean; secretaries?: boolean; physioId?: string } = {}
): Promise<void> {
  const { managers = true, secretaries = true, physioId } = opts;
  try {
    const { managerIds, secretaryIds } = await getStaffUids();
    const targets = new Set<string>();
    if (managers)    managerIds.forEach((id)   => targets.add(id));
    if (secretaries) secretaryIds.forEach((id) => targets.add(id));
    if (physioId)    targets.add(physioId);
    await Promise.all([...targets].map((uid) => sendNotification(uid, notif)));
  } catch {
    // fire-and-forget — never throw
  }
}

// ─── Mark read ────────────────────────────────────────────────────────────────

export async function markNotifRead(userId: string, notifId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "notifications", userId, "items", notifId), { read: true });
  } catch { /* ignore */ }
}

export async function markAllNotifsRead(userId: string): Promise<void> {
  try {
    const snap = await getDocs(query(itemsCol(userId), where("read", "==", false)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch { /* ignore */ }
}

// ─── Clear all ────────────────────────────────────────────────────────────────

export async function clearAllNotifs(userId: string): Promise<void> {
  try {
    const snap = await getDocs(itemsCol(userId));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch { /* ignore */ }
}

// ─── Background scan ─────────────────────────────────────────────────────────
// Runs once per calendar day per browser session.
// Checks: (1) active packages with 1 session remaining, (2) unpaid session balances.

const SCAN_KEY = "phd_notif_scan";

export async function runBackgroundScan(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (sessionStorage.getItem(SCAN_KEY) === today) return;
  sessionStorage.setItem(SCAN_KEY, today);

  try {
    // ── Packages with exactly 1 session remaining ───────────────────────────
    const pkgSnap = await getDocs(
      query(collection(db, "patientPackages"), where("active", "==", true))
    );
    for (const d of pkgSnap.docs) {
      const pkg = d.data();
      const rem = (pkg.packageSize as number) - (pkg.sessionsUsed as number);
      if (rem !== 1) continue;
      await sendNotification(userId, {
        type:      "package_expiring",
        title:     "Package almost finished",
        body:      "A patient has only 1 session left in their active package.",
        sourceId:  `pkg_exp_${d.id}_${today}`,
        patientId: pkg.patientId as string,
      });
    }

    // ── Unpaid session balances (grouped by patient) ─────────────────────────
    const priceSnap = await getDocs(
      query(collection(db, "patientSessionPrices"), where("paid", "==", false))
    );
    const unpaidMap = new Map<string, number>();
    priceSnap.forEach((d) => {
      const pid = d.data().patientId as string;
      const amt = (d.data().amount   as number) ?? 0;
      unpaidMap.set(pid, (unpaidMap.get(pid) ?? 0) + amt);
    });
    for (const [patientId, total] of unpaidMap.entries()) {
      if (total <= 0) continue;
      await sendNotification(userId, {
        type:      "unpaid_balance",
        title:     "Unpaid balance",
        body:      `Patient has ${total.toLocaleString()} EGP in unpaid sessions.`,
        sourceId:  `unpaid_${patientId}_${today}`,
        patientId,
      });
    }
  } catch {
    // best-effort — never throw
  }
}
