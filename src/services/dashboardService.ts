// FILE: src/services/dashboardService.ts

import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { toDateStr } from "./appointmentService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalPatients:      number;
  activePatients:     number;
  onHoldPatients:     number;
  dischargedPatients: number;
}

export interface TodayAppointment {
  id:          string;
  patientName: string;
  physioName:  string;
  hour:        number;
  sessionType: string;
  status:      string;
}

// ─── Realtime dashboard stats ─────────────────────────────────────────────────
// physioId === "__all__" → clinic manager (all patients)
// physioId === uid       → physio (only their assigned patients)
// For physios we query by assignedPhysioId OR seniorEditorId so seniors
// also see their patients.

export function subscribeToDashboardStats(
  physioId: string,
  onData:   (stats: DashboardStats) => void,
  onError?: (err: Error) => void
): () => void {

  const isAll = physioId === "__all__";

  // Manager: query all patients — no filter
  // Physio:  query patients where physioId == uid
  const q = isAll
    ? query(collection(db, "patients"))
    : query(
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
        const status = (d.data().status as string) ?? "active";
        if (status === "active")      active++;
        else if (status === "on_hold")     onHold++;
        else if (status === "discharged")  discharged++;
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

// ─── Realtime today's appointments ───────────────────────────────────────────
// physioId === "__all__" → all appointments today (manager view)
// physioId === uid       → only this physio's appointments today

export function subscribeTodayAppointments(
  physioId: string,
  onData:   (appts: TodayAppointment[]) => void,
  onError?: (err: Error) => void
): () => void {
  const today  = toDateStr(new Date());
  const isAll  = physioId === "__all__";

  const q = isAll
    ? query(
        collection(db, "appointments"),
        where("date", "==", today)
      )
    : query(
        collection(db, "appointments"),
        where("date",     "==", today),
        where("physioId", "==", physioId)
      );

  return onSnapshot(
    q,
    (snap) => {
      const appts: TodayAppointment[] = snap.docs
        .map((d) => ({
          id:          d.id,
          patientName: (d.data().patientName as string) ?? "Patient",
          physioName:  (d.data().physioName  as string) ?? "",
          hour:        (d.data().hour        as number) ?? 0,
          sessionType: (d.data().sessionType as string) ?? "",
          status:      (d.data().status      as string) ?? "scheduled",
        }))
        .sort((a, b) => a.hour - b.hour);
      onData(appts);
    },
    (err) => onError?.(err)
  );
}
