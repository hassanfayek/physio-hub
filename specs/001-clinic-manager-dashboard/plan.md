# Implementation Plan: Clinic Manager Today Dashboard

**Branch**: `001-clinic-manager-dashboard` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-clinic-manager-dashboard/spec.md`

## Summary

Enhance the existing `OverviewTab` inside `PhysioDashboard.tsx` so that clinic
managers see a real-time list of all today's appointments — with patient name,
physiotherapist name, time, status badge, and a "View Sheet" button per row.
Two supporting service files need minor updates: add `"in_progress"` to the
appointment status union, and add `patientId` to the `TodayAppointment` type.
No new files, no new routes, no new Firebase collections.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)
**Primary Dependencies**: React 19, Firebase 12 (Firestore `onSnapshot`), React Router DOM
**Storage**: Firestore — `/appointments` collection (existing)
**Testing**: Manual smoke test per `quickstart.md`; no automated tests in scope
**Target Platform**: Modern evergreen browsers — desktop and tablet
**Project Type**: Web application (SPA)
**Performance Goals**: Dashboard visible within 3 s; status updates reflected within 5 s
**Constraints**: Read-only for clinic manager (no status mutation from this view); tablet + desktop only
**Scale/Scope**: Single clinic; expected < 50 appointments/day

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Feature-Domain Architecture | ✅ PASS | Changes stay in `src/features/physio/` and `src/services/` |
| II. Firebase-First Data Layer | ✅ PASS | Uses `onSnapshot` via service layer; no direct SDK imports in component |
| III. Type Safety | ✅ PASS | Status union extended; `patientId` added with explicit type |
| IV. Role-Based Access Control | ✅ PASS | `isManager` flag gates "View Sheet" button; no new route guard needed |
| V. Simplicity & YAGNI | ✅ PASS | No new files; minimal prop addition; no premature abstraction |

**All gates pass. No Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/001-clinic-manager-dashboard/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── overview-tab-props.md   ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (files to modify — no new files)

```text
src/
├── services/
│   ├── appointmentService.ts   MODIFY — add "in_progress" to status union
│   └── dashboardService.ts     MODIFY — add patientId to TodayAppointment
└── features/
    └── physio/
        └── PhysioDashboard.tsx MODIFY — OverviewTab: onViewPatient prop +
                                         today's appointments via subscribeToAppointmentsByDay +
                                         "View Sheet" button (manager only) +
                                         status badge with display mapping
```

## Phase 0: Research — Complete

All unknowns resolved via codebase inspection. See [research.md](research.md).

Key decisions:
- Use `subscribeToAppointmentsByDay(today, null, ...)` — already returns all-clinic data with `patientId`
- `clinic_manager` already routes to `/physio`; `isManager` flag already derived
- Reuse `viewingPatientId` / `setViewingPatientId` for patient sheet navigation
- Map `"scheduled"` → "Upcoming", `"in_progress"` → "In Progress", `"completed"` → "Completed"
- Add `"in_progress"` as new Firestore status value (no migration; existing docs default to "Upcoming")

## Phase 1: Design — Complete

Artifacts:
- [data-model.md](data-model.md) — type changes for `Appointment.status` and `TodayAppointment`
- [contracts/overview-tab-props.md](contracts/overview-tab-props.md) — `OverviewTab` prop contract
- [quickstart.md](quickstart.md) — manual verification steps

### Implementation Details

#### 1. `src/services/appointmentService.ts`

- Extend `Appointment.status` type: add `"in_progress"`
- Update `docToAppointment` normalizer to handle `"in_progress"`
- Update `updateAppointmentStatus` parameter type

```typescript
// Appointment interface — status field only
status: "scheduled" | "in_progress" | "completed" | "cancelled";

// docToAppointment normalizer
status: (
  data.status === "completed"   ? "completed"   :
  data.status === "cancelled"   ? "cancelled"   :
  data.status === "in_progress" ? "in_progress" :
  "scheduled"
) as Appointment["status"],
```

#### 2. `src/services/dashboardService.ts`

- Add `patientId: string` to `TodayAppointment`
- Update snapshot mapper in `subscribeTodayAppointments` to include `patientId`

#### 3. `src/features/physio/PhysioDashboard.tsx` — `OverviewTab`

**Prop change** — add optional callback:
```typescript
interface OverviewTabProps {
  physio:         PhysioProfile;
  isManager:      boolean;
  isSecretary?:   boolean;
  onViewPatient?: (patientId: string) => void;   // ← NEW
}
```

**Data source change** — swap `subscribeTodayAppointments` for `subscribeToAppointmentsByDay`
to gain `patientId` in the appointment objects:
```typescript
import { subscribeToAppointmentsByDay, toDateStr, fmtHour12 } from "../../services/appointmentService";

// inside OverviewTab useEffect:
const today = toDateStr(new Date());
return subscribeToAppointmentsByDay(
  today,
  (isManager || isSecretary) ? null : physio.uid,
  setTodayAppts,
);
```

**Status badge helper** — pure function, no state:
```typescript
function apptDisplayStatus(status: string): { label: string; color: string } {
  if (status === "in_progress") return { label: "In Progress", color: "#f59e0b" };
  if (status === "completed")   return { label: "Completed",   color: "#22c55e" };
  if (status === "cancelled")   return { label: "Cancelled",   color: "#9ca3af" };
  return                               { label: "Upcoming",    color: "#3b82f6" };
}
```

**Row render** — add status badge and conditional "View Sheet" button:
```typescript
// inside the appointment list map():
const { label, color } = apptDisplayStatus(a.status);

<span style={{ background: color, ... }}>{label}</span>

{isManager && a.patientId && onViewPatient && (
  <button onClick={() => onViewPatient(a.patientId)}>
    View Sheet
  </button>
)}
```

**Call site** — pass `onViewPatient` from `PhysioDashboard`:
```typescript
<OverviewTab
  physio={physio}
  isManager={isManager}
  isSecretary={isSecretary}
  onViewPatient={(id) => setViewingPatientId(id)}
/>
```

### Constitution Re-check (Post-Design)

All five principles still pass. The `subscribeToAppointmentsByDay` call in
`OverviewTab` still goes through the service layer (Principle II). The `onViewPatient`
prop is conditionally applied — no logic leaks into `App.tsx` or entry files
(Principle I). No `any` types introduced (Principle III).
