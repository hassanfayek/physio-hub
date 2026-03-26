# Research: Clinic Manager Today Dashboard

**Branch**: `001-clinic-manager-dashboard` | **Date**: 2026-03-26

## Firestore Data Model (Existing)

**Decision**: Use existing `/appointments` collection as-is; no new collection required.

**Rationale**: The `appointments` documents already denormalize `patientName` and
`physioName` at write time. The dashboard can display all required fields from a
single collection query — no multi-collection joins needed.

**Existing shape**:
```
/appointments/{id}
  patientId:   string        ← needed for "View Sheet" navigation
  patientName: string        ← display, already denormalized
  physioId:    string
  physioName:  string        ← display, already denormalized
  date:        "YYYY-MM-DD"
  hour:        number (0–23)
  sessionType: string
  status:      "scheduled" | "completed" | "cancelled"
  createdAt:   Timestamp
```

**Gap found**: `status` does not include `"in_progress"`. The spec requires an
"In Progress" display state. Resolution: add `"in_progress"` as a valid status
value; update the type union in `appointmentService.ts` and the
`updateAppointmentStatus` function signature accordingly.

---

## Real-Time Query Strategy

**Decision**: Use `subscribeToAppointmentsByDay(today, null, onData, onError)`
from `src/services/appointmentService.ts`.

**Rationale**: Passing `physioId: null` already returns all clinic appointments
for a given date. The function sorts by `hour` ascending. This is already used
by the schedule views, so no index risk.

**Alternative considered**: `subscribeTodayAppointments("__all__", ...)` from
`dashboardService.ts`. Rejected because its `TodayAppointment` type lacks
`patientId`, which is required for "View Sheet" navigation. Extending it is
possible but introduces duplication — using the richer `Appointment` type from
`appointmentService` is cleaner.

---

## Status Display Mapping

**Decision**: Map Firestore status values to human-readable display labels in the UI.

| Firestore value | Display label | Badge colour  |
|-----------------|---------------|---------------|
| `scheduled`     | Upcoming      | Blue          |
| `in_progress`   | In Progress   | Amber         |
| `completed`     | Completed     | Green         |
| `cancelled`     | Cancelled     | Grey          |

**Rationale**: The spec requires "Upcoming / In Progress / Completed" labels.
Mapping happens at render time; no Firestore schema migration needed for existing
"scheduled" documents.

---

## Navigation to Patient Sheet

**Decision**: Reuse the existing `viewingPatientId` / `setViewingPatientId`
state mechanism in `PhysioDashboard.tsx`.

**Rationale**: When `viewingPatientId` is non-null, `PhysioDashboard` already
renders `<PatientSheetPage patientId={viewingPatientId} onBack={...} />` and
hides the tab content. Passing an `onViewPatient` callback prop to `OverviewTab`
is a one-line change at the call site and requires no new routing.

**Alternative considered**: URL-based navigation (`/physio/patient/:id`). Rejected
because it requires new route definitions, a back-navigation handler, and changes
to `App.tsx` — disproportionate complexity for a same-page drill-down pattern
that already exists.

---

## Role-Based Access

**Decision**: No new route guard required. Gate the "View Sheet" button and the
enriched appointment list behind the existing `isManager` flag inside
`OverviewTab`.

**Rationale**: `clinic_manager` already lands in `PhysioDashboard` via
`PHYSIO_PORTAL_ROLES`. The `isManager` boolean is already derived from
`user.role === "clinic_manager"` in `PhysioDashboard`. Showing richer
appointment data only to managers is a conditional render — no auth change needed.

---

## Component Strategy

**Decision**: Enhance the existing `OverviewTab` component inside
`PhysioDashboard.tsx` rather than creating a new `ClinicOverviewTab` component.

**Rationale**: `OverviewTab` is already conditionally rendered for all roles. It
already fetches today's appointments via `subscribeTodayAppointments`. The
required changes are:
1. Replace `subscribeTodayAppointments` with `subscribeToAppointmentsByDay` to
   gain `patientId`.
2. Accept an `onViewPatient` callback prop.
3. Render a "View Sheet" button per row when `isManager` is true.

Adding a second overview component (one for physios, one for managers) would
create duplication. Constitution Principle V (YAGNI) favours the minimal approach.

**Files to change** (no new files):
- `src/services/appointmentService.ts` — add `"in_progress"` to status union
- `src/services/dashboardService.ts` — add `patientId` to `TodayAppointment`
  (kept for consistency with existing callers)
- `src/features/physio/PhysioDashboard.tsx` — update `OverviewTab` internal +
  pass `onViewPatient` callback

---

## Alternatives Considered & Rejected

| Alternative | Rejected because |
|---|---|
| New `/physio/overview` route | Unnecessary routing complexity; `viewingPatientId` pattern already handles drill-down |
| Separate `ClinicOverviewTab` component | Would duplicate stats + greeting sections; one component with role-conditional render is simpler |
| Client-side join from `/patients` + `/users` | `patientName`/`physioName` already denormalized; extra reads not needed |
| Polling instead of `onSnapshot` | `onSnapshot` is the established pattern; real-time is a core requirement |
