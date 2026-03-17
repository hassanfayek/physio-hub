// FILE: src/services/dashboardService.ts

import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalPatients:  number;
  activePatients: number;
  onHoldPatients: number;
  dischargedPatients: number;
}

// ─── Realtime dashboard stats ─────────────────────────────────────────────────
// Subscribes to all patients for this physio and derives live counts.
// Returns unsubscribe function — call it in useEffect cleanup.
//
// NOTE: Requires the same composite index as patientService:
//   Collection: patients | Fields: physioId ASC, createdAt DESC

export function subscribeToDashboardStats(
  physioId: string,
  onData:   (stats: DashboardStats) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, "patients"),
    where("physioId", "==", physioId)
  );

  return onSnapshot(
    q,
    (snap) => {
      let active     = 0;
      let onHold     = 0;
      let discharged = 0;

      snap.docs.forEach((d) => {
        const status = d.data().status ?? "active";
        if (status === "active")     active++;
        else if (status === "on_hold")   onHold++;
        else if (status === "discharged") discharged++;
      });

      onData({
        totalPatients:      snap.size,
        activePatients:     active,
        onHoldPatients:     onHold,
        dischargedPatients: discharged,
      });
    },
    (err) => onError?.(err)
  );
}
