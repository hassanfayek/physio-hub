// FILE: src/features/physio/teamStats.ts
// Live per-physio numbers for the People → Team cards (manager only).

import { useEffect, useMemo, useState } from "react";
import { subscribeToAllPatients, type Patient, type Physiotherapist } from "../../services/patientService";
import { subscribeToAppointmentsByMonth, type Appointment } from "../../services/appointmentService";
import { subscribeToAttendanceForDate, type AttendanceRecord } from "../../services/attendanceService";
import { clinicToday } from "../../services/businessService";
import { time12 } from "../../utils/time";

export interface TeamStats {
  caseload: Map<string, number>;
  sessions: Map<string, number>;
  attendance: Map<string, AttendanceRecord>;
}

const isAssigned = (p: Patient, uid: string) =>
  p.physioId === uid || p.seniorEditorId === uid || (p.juniorIds ?? []).includes(uid) || p.traineeId === uid;

export function useTeamStats(physios: Physiotherapist[]): TeamStats {
  const today = clinicToday();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [att, setAtt] = useState<AttendanceRecord[]>([]);
  useEffect(() => subscribeToAllPatients(setPatients, () => {}), []);
  useEffect(() => subscribeToAppointmentsByMonth(today.slice(0, 7), null, setAppts, () => {}), [today]);
  useEffect(() => subscribeToAttendanceForDate(today, setAtt, () => {}), [today]);
  return useMemo(() => {
    const active = patients.filter((p) => (p.status || "active") === "active");
    const caseload = new Map(physios.map((ph) => [ph.uid, active.filter((p) => isAssigned(p, ph.uid)).length] as const));
    const sessions = new Map<string, number>();
    appts.filter((a) => a.status === "completed").forEach((a) => sessions.set(a.physioId, (sessions.get(a.physioId) ?? 0) + 1));
    return { caseload, sessions, attendance: new Map(att.map((a) => [a.physioId, a] as const)) };
  }, [patients, appts, att, physios]);
}

export function attendanceLabel(a: AttendanceRecord | undefined): { text: string; cls: "in" | "done" | "out" } {
  if (!a?.checkIn) return { text: "Not arrived today", cls: "out" };
  if (!a.checkOut) return { text: `On duty since ${time12(a.checkIn)}`, cls: "in" };
  return { text: `Worked ${time12(a.checkIn)} – ${time12(a.checkOut)}`, cls: "done" };
}
