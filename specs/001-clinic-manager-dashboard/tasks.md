# Tasks: Clinic Manager Today Dashboard

**Input**: Design documents from `specs/001-clinic-manager-dashboard/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/overview-tab-props.md ✅

**Tests**: No automated tests in scope (per plan.md — manual verification via quickstart.md).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- All source changes are in `src/` at the repository root of `apps/web`
- No new files — all tasks modify existing files

---

## Phase 1: Setup

No new project infrastructure is needed. All dependencies, collections, and routes already exist.
The service layer changes in Phase 2 are the only prerequisites before UI work can begin.

---

## Phase 2: Foundational (Service Layer — Blocks All User Stories)

**Purpose**: Extend the TypeScript types and service functions that all three user stories depend on.

**⚠️ CRITICAL**: All three UI story tasks (Phases 3–5) depend on these changes being correct.

- [x] T001 [P] Add `"in_progress"` to the `Appointment.status` union type and update the `docToAppointment` normalizer guard to handle it in `src/services/appointmentService.ts`
- [x] T002 Update the `updateAppointmentStatus` function's `status` parameter type to include `"in_progress"` in `src/services/appointmentService.ts`
- [x] T003 [P] Add `patientId: string` field to the `TodayAppointment` interface and add `patientId: (d.data().patientId as string) ?? ""` to the snapshot mapper in `subscribeTodayAppointments` in `src/services/dashboardService.ts`

**Checkpoint**: T001 + T002 + T003 complete — service types are ready. TypeScript reports no new errors.

> T001 and T003 are in different files and can be implemented in parallel.
> T002 must follow T001 (same file).

---

## Phase 3: User Story 1 — View Today's Full Appointment Schedule (Priority: P1) 🎯 MVP

**Goal**: Clinic manager opens the Overview tab and immediately sees every today-appointment
row with patient name, physiotherapist name, formatted time, session type, and status field
(unstyled at this stage). Empty-state message shown when no appointments exist.

**Independent Test**: Log in as `clinic_manager`, open `/physio` → Overview tab.
Verify all today-appointments appear in chronological order with correct names and time.
Verify empty-state message appears when no appointments are booked today.

### Implementation for User Story 1

- [x] T004 [US1] Inside `OverviewTab` in `src/features/physio/PhysioDashboard.tsx`, replace the `subscribeTodayAppointments` call with `subscribeToAppointmentsByDay(today, (isManager || isSecretary) ? null : physio.uid, setTodayAppts)` — import `subscribeToAppointmentsByDay` and `toDateStr` from `../../services/appointmentService`; update the `todayAppts` state type to `Appointment[]`
- [x] T005 [US1] Update the appointment list render in `OverviewTab` in `src/features/physio/PhysioDashboard.tsx` so each row displays: patient name (`a.patientName`), physiotherapist name (`a.physioName` — visible when `isManager || isSecretary`), formatted time (`fmtHour12(a.hour)`), session type (`a.sessionType`), and a placeholder `<span>` for the status badge (static text `a.status` for now)
- [x] T006 [US1] Add an empty-state block inside the appointment list section of `OverviewTab` in `src/features/physio/PhysioDashboard.tsx`: when `todayAppts.length === 0` render a message such as "No appointments scheduled for today" styled consistently with the existing empty states in the dashboard

**Checkpoint**: US1 fully functional and independently testable. Verify with quickstart.md steps 1–2.

---

## Phase 4: User Story 2 — Real-Time Status Tracking (Priority: P2)

**Goal**: Each appointment row displays a styled status badge that reflects the current
Firestore `status` value in real time — Upcoming (blue), In Progress (amber), Completed (green),
Cancelled (grey). Badge updates without page reload when status changes.

**Independent Test**: Update an appointment's `status` in Firestore (via console or physio portal).
Confirm the badge on the manager dashboard changes within 5 seconds without a manual refresh.

### Implementation for User Story 2

- [x] T007 [US2] Add a `apptDisplayStatus` pure helper function above `OverviewTab` in `src/features/physio/PhysioDashboard.tsx` that maps Firestore status strings to `{ label: string; color: string }` — cases: `"in_progress"` → `{ label: "In Progress", color: "#f59e0b" }`, `"completed"` → `{ label: "Completed", color: "#22c55e" }`, `"cancelled"` → `{ label: "Cancelled", color: "#9ca3af" }`, default → `{ label: "Upcoming", color: "#3b82f6" }`
- [x] T008 [US2] Replace the placeholder `<span>` from T005 with a styled badge in each appointment row in `OverviewTab` in `src/features/physio/PhysioDashboard.tsx`: call `apptDisplayStatus(a.status)` and render `<span style={{ background: color, color: "#fff", borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>`

**Checkpoint**: US2 fully functional. Badges display correctly for all status values and update live.

---

## Phase 5: User Story 3 — Navigate to Patient Sheet (Priority: P3)

**Goal**: Each appointment row includes a "View Sheet" button (visible to `clinic_manager` only).
Clicking it opens the patient's full sheet via the existing `viewingPatientId` mechanism.
Clicking back returns to the Overview tab.

**Independent Test**: Click "View Sheet" on any row. Confirm patient sheet opens for the correct
patient. Click the "← Back" button in the patient sheet view — confirm return to Overview tab.

### Implementation for User Story 3

- [x] T009 [US3] Add `onViewPatient?: (patientId: string) => void` to the `OverviewTabProps` interface in `src/features/physio/PhysioDashboard.tsx` and destructure it in the `OverviewTab` function signature
- [x] T010 [US3] Add a "View Sheet" button at the end of each appointment row in `OverviewTab` in `src/features/physio/PhysioDashboard.tsx`: render only when `isManager && a.patientId && onViewPatient`; on click call `onViewPatient(a.patientId)`; style consistently with existing action buttons in the dashboard (small, outlined or secondary variant)
- [x] T011 [US3] Update the `<OverviewTab>` call site in `PhysioDashboard`'s render section in `src/features/physio/PhysioDashboard.tsx` to pass the new prop: `onViewPatient={(id) => setViewingPatientId(id)}`

**Checkpoint**: US3 fully functional. "View Sheet" button visible only to manager, navigates correctly, back navigation works.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Type-check and layout verification across all modified files.

- [x] T012 Run `pnpm build` (or `tsc --noEmit`) from `apps/web` and resolve any TypeScript errors introduced across `src/services/appointmentService.ts`, `src/services/dashboardService.ts`, and `src/features/physio/PhysioDashboard.tsx`
- [ ] T013 Verify the appointment list layout in `OverviewTab` in `src/features/physio/PhysioDashboard.tsx` does not overflow horizontally on tablet viewport (≥ 768 px) — use browser DevTools responsive mode; adjust row layout (flex-wrap or truncation) if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately. T001 and T003 in parallel.
- **US1 (Phase 3)**: Requires Phase 2 complete (T004 imports `Appointment` type from appointmentService)
- **US2 (Phase 4)**: Requires Phase 3 complete (T007/T008 extend the row render from T005)
- **US3 (Phase 5)**: Requires Phase 3 complete (T010 adds button to the row from T005; T009 needs the component to exist in final shape)
- **Polish (Phase 6)**: Requires all story phases complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — independent baseline
- **US2 (P2)**: After US1 complete — extends the row render added in US1
- **US3 (P3)**: After US1 complete — adds button to the row from US1 (can be implemented in parallel with US2 by a second developer, as T009–T011 touch different lines than T007–T008)

### Within Each Phase

- Services before UI (Phase 2 before Phases 3–5)
- Data source before render (T004 before T005, T006)
- Helper function before usage (T007 before T008)
- Prop interface before render + call site (T009 before T010, T011)

### Parallel Opportunities

```
Phase 2 parallel start:
  Task: "Add 'in_progress' to Appointment.status union in src/services/appointmentService.ts"  (T001)
  Task: "Add patientId to TodayAppointment in src/services/dashboardService.ts"               (T003)

Phase 3 sequential (same file):
  T004 → T005 → T006

Phase 4 + Phase 5 parallel (once Phase 3 done, different areas of same file):
  Task: "Add apptDisplayStatus helper + badge render in PhysioDashboard.tsx"  (T007 → T008)
  Task: "Add onViewPatient prop + View Sheet button in PhysioDashboard.tsx"   (T009 → T010 → T011)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Service layer (T001–T003)
2. Complete Phase 3: US1 implementation (T004–T006)
3. **STOP and VALIDATE**: Log in as clinic_manager, confirm full appointment list with all fields, confirm empty state
4. Demo/review — the core dashboard value is delivered

### Incremental Delivery

1. Phase 2 → Phase 3 (US1): Appointment list visible → **MVP demo ready**
2. Phase 4 (US2): Add status badges → Real-time tracking visible
3. Phase 5 (US3): Add "View Sheet" → Full drill-down capability
4. Phase 6: Type-check + layout polish

### Parallel Team Strategy (2 developers after Phase 3)

- **Developer A**: Phase 4 (US2) — status badge helper + render (T007, T008)
- **Developer B**: Phase 5 (US3) — prop interface + button + call site (T009, T010, T011)
- Both work in `PhysioDashboard.tsx` on different lines; merge after both complete

---

## Notes

- [P] tasks = different files, no dependencies — safe to run in parallel
- All 12 tasks modify exactly 3 existing files — no new files created
- The `onSnapshot` subscription in OverviewTab handles real-time updates automatically; no polling needed
- Verify tests fail (behaviour absent) before implementing each story, per quickstart.md
- Run `tsc --noEmit` after each phase to catch type regressions early
- Commit after each checkpoint (end of Phase 2, end of each US phase)
