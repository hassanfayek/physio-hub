# Quickstart: Clinic Manager Today Dashboard

**Branch**: `001-clinic-manager-dashboard` | **Date**: 2026-03-26

## Verifying the Feature Works

### Prerequisites

1. You have a Firebase project with the `appointments`, `patients`, and `users`
   collections populated.
2. A user account exists with `role: "clinic_manager"` in `/users/{uid}`.
3. At least one appointment document exists with `date` equal to today's date
   in `YYYY-MM-DD` format.

### Steps

1. **Log in as the clinic manager**
   - Navigate to `/`
   - Enter clinic manager credentials
   - On success, the app redirects to `/physio` and lands on the Overview tab

2. **Confirm today's appointments are listed**
   - The Overview tab MUST show a list of today's appointments
   - Each row shows: patient name, physiotherapist name, time (e.g. "09:00 AM"),
     status badge, and a "View Sheet" button

3. **Confirm real-time updates**
   - In the Firebase console (or via another user session), update an appointment's
     `status` field from `"scheduled"` to `"in_progress"`
   - Without refreshing, the dashboard row MUST update its badge to "In Progress"

4. **Confirm "View Sheet" navigation**
   - Click "View Sheet" on any appointment row
   - The app MUST display the patient's full sheet (treatment program, history)
   - Click "← Back" — the app MUST return to the Overview tab

5. **Confirm empty state**
   - Change all appointments to a different date (or use a test account with no
     today-appointments)
   - The Overview MUST show an empty-state message, not a blank area

### Confirming Role Gate

- Log in as a `physiotherapist` account
- Navigate to `/physio` → Overview tab
- "View Sheet" buttons MUST NOT appear on appointment rows
- The appointment list shows only the physio's own appointments (filtered by
  `physioId`)

### Firestore Security Rules Smoke Test

- As a `patient` user, attempt to read `/appointments` directly (e.g. via the
  Firebase console's Rules Playground or a REST call)
- The read MUST be denied unless the patient's own `patientId` matches
