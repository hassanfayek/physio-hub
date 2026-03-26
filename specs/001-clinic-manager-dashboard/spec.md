# Feature Specification: Clinic Manager Today Dashboard

**Feature Branch**: `001-clinic-manager-dashboard`
**Created**: 2026-03-26
**Status**: Draft
**Input**: User description: "Build a clinic manager overview dashboard that shows real-time clinic activity for today."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Today's Full Appointment Schedule (Priority: P1)

A clinic manager opens the dashboard and immediately sees every appointment booked
for today — patient name, assigned physiotherapist, scheduled time, and current
status — without needing to navigate elsewhere.

**Why this priority**: This is the core value of the feature. Without it nothing
else matters. It gives the manager a single source of truth for the day.

**Independent Test**: Open the dashboard on a day with appointments. Verify that
every today-appointment row is visible with correct patient name, physiotherapist
name, time, and status before any other action is taken.

**Acceptance Scenarios**:

1. **Given** the clinic has appointments scheduled for today, **When** the clinic
   manager opens the overview dashboard, **Then** all of today's appointments are
   displayed in chronological order showing patient name, assigned physiotherapist,
   appointment time, and status.

2. **Given** no appointments are scheduled for today, **When** the manager opens
   the dashboard, **Then** an empty-state message is shown confirming there are no
   appointments today.

3. **Given** the dashboard is open, **When** a new appointment is created for
   today by another user, **Then** the new appointment appears in the list
   automatically without a manual page refresh.

---

### User Story 2 - Real-Time Status Tracking (Priority: P2)

A clinic manager watches appointment statuses change throughout the day — from
"Upcoming" before the appointment starts, to "In Progress" when the session is
active, to "Completed" once finished — so they always know what is happening
right now.

**Why this priority**: Real-time status is what separates this from a static
schedule view and is the primary "live snapshot" goal.

**Independent Test**: Change an appointment's status in the system and verify
the dashboard reflects the new status within a few seconds without a manual
refresh.

**Acceptance Scenarios**:

1. **Given** an appointment has not yet started, **When** the manager views its
   row, **Then** the status is displayed as "Upcoming".

2. **Given** a session is currently in progress, **When** the manager views the
   row, **Then** the status is displayed as "In Progress" with a visual
   distinction from other statuses.

3. **Given** a session has ended, **When** the manager views the row, **Then**
   the status is displayed as "Completed".

4. **Given** the dashboard is open and a physiotherapist marks a session as
   in-progress, **When** the status update propagates, **Then** the row updates
   in real time without a page reload.

---

### User Story 3 - Navigate to Patient Sheet (Priority: P3)

A clinic manager clicks a button on any appointment row and is taken directly to
that patient's full sheet, where they can view the treatment program and session
details.

**Why this priority**: Drill-down access adds operational value on top of the
overview but the overview is useful even without it.

**Independent Test**: Click the "View Sheet" button on any row and confirm
navigation lands on the correct patient's sheet page.

**Acceptance Scenarios**:

1. **Given** the manager is viewing the dashboard, **When** they click the
   "View Sheet" button on an appointment row, **Then** they are navigated to
   the patient's full sheet page showing treatment details.

2. **Given** the manager navigates to a patient sheet from the dashboard,
   **When** they press the browser back button or an equivalent navigation
   control, **Then** they return to the clinic manager dashboard.

---

### Edge Cases

- What happens when an appointment has no assigned physiotherapist (e.g., unassigned slot)?
- How does the list behave when there are more than 50 appointments in one day?
- What is shown if the manager's account loses network connectivity while the dashboard is open?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST be accessible only to users with the
  `clinic_manager` role (and `secretary` role as a secondary viewer).
- **FR-002**: The dashboard MUST display all appointments scheduled for the
  current calendar day.
- **FR-003**: Each appointment row MUST show: patient full name, assigned
  physiotherapist full name, scheduled appointment time, and current status.
- **FR-004**: Status values MUST be one of: `Upcoming`, `In Progress`,
  `Completed`.
- **FR-005**: The appointment list MUST update in real time when appointment
  data changes without requiring a manual page refresh.
- **FR-006**: Each appointment row MUST include a "View Sheet" action that
  navigates the manager to the corresponding patient's sheet page.
- **FR-007**: Appointments MUST be displayed in ascending chronological order
  by scheduled time.
- **FR-008**: When no appointments exist for today, the dashboard MUST display
  a clear empty-state message.
- **FR-009**: The dashboard MUST be reachable from within the existing physio
  portal (`/physio`) navigation without requiring a full URL change.

### Key Entities

- **Appointment**: Represents a scheduled session for today; has a scheduled
  time, status, link to a patient, and link to a physiotherapist.
- **Patient**: The person receiving treatment; identified by full name.
- **Physiotherapist**: The clinician conducting the session; identified by full
  name.
- **Patient Sheet**: The detailed record of a patient's treatment program and
  session history, accessible via existing navigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clinic manager can open the dashboard and see today's full
  appointment list within 3 seconds on a standard connection.
- **SC-002**: Status changes made by other users appear on the dashboard within
  5 seconds without a manual refresh.
- **SC-003**: Clicking "View Sheet" on any row navigates to the correct patient
  sheet within 2 seconds.
- **SC-004**: 100% of today's appointments are shown — no appointments are
  omitted from the list.
- **SC-005**: The dashboard is usable on both desktop and tablet screen sizes
  without horizontal scrolling.

## Assumptions

- The existing data store already records appointment date, time, patient
  reference, physiotherapist reference, and a status field; no new data model
  additions are required beyond surfacing existing data.
- Status transitions (`Upcoming` → `In Progress` → `Completed`) are managed by
  physiotherapists from their own portal; the clinic manager dashboard is
  read-only with respect to status.
- The existing patient sheet page (`PatientSheetPage`) is already functional
  and reachable by its current route/navigation; this feature only needs to
  link to it.
- "Today" is determined by the client's local calendar date at the time the
  dashboard loads.
- The `clinic_manager` and `secretary` roles already exist in the auth system
  and can be checked at the route/component level.
- Mobile (phone) support is out of scope for this initial version; tablet and
  desktop are the target form factors.
