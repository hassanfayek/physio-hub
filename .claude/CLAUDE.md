# PhysioHub Web — Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-26

## Active Technologies

- **Language**: TypeScript 5 (strict mode — `any` forbidden)
- **Framework**: React 19 (functional components + hooks only)
- **Build tool**: Vite 7
- **Backend / BaaS**: Firebase 12 — Firestore (`onSnapshot` for real-time), Auth, Storage
- **Routing**: React Router DOM v6 (BrowserRouter)
- **Package manager**: pnpm
- **Linting**: ESLint 9 + typescript-eslint + eslint-plugin-react-hooks

## Project Structure

```text
src/
├── features/
│   ├── auth/          Login, Register pages
│   ├── patient/       PatientDashboard, PatientSheetPage, ExerciseProgram, JointAssessmentSheet
│   ├── physio/        PhysioDashboard (tabs: overview, patients, team, schedule, exercises)
│   ├── schedule/      SchedulePage, DayView, WeekView, MonthView
│   └── exercises/     ExerciseLibraryPage
├── components/        Shared reusable components
├── hooks/             useAuth (AuthContext)
├── services/          Firebase service wrappers
│   ├── authService.ts
│   ├── appointmentService.ts
│   ├── dashboardService.ts
│   ├── patientService.ts
│   ├── physioService.ts
│   ├── exerciseService.ts
│   └── secretaryService.ts
├── firebase.ts        Firebase app init + exports (db, auth, storage, secondaryAuth)
└── App.tsx            Router + ProtectedRoute / PublicRoute
```

## Commands

```bash
pnpm dev          # start dev server
pnpm build        # TypeScript compile + Vite build
pnpm lint         # ESLint check
```

## Code Style

- All React components use arrow functions or named function declarations — no class components
- All service functions are exported named functions in `src/services/`
- Firebase SDK MUST only be imported in `src/services/` and `src/firebase.ts`
- Roles: `patient | physiotherapist | clinic_manager | secretary`
- `clinic_manager` shares the `/physio` portal; `isManager` boolean gates manager-only UI
- Navigation between tabs uses local state (`activeTab`, `viewingPatientId`) — no URL params inside the portal
- Status badge pattern: map Firestore status strings to display labels + colours in UI helper functions

## Recent Changes

### 001-clinic-manager-dashboard (2026-03-26)

- Added `"in_progress"` to `Appointment.status` union in `appointmentService.ts`
- Added `patientId` to `TodayAppointment` in `dashboardService.ts`
- Enhanced `OverviewTab` in `PhysioDashboard.tsx`:
  - Switched data source to `subscribeToAppointmentsByDay` for richer appointment type
  - Added `onViewPatient` prop for patient sheet drill-down
  - Added status badge (Upcoming / In Progress / Completed / Cancelled)
  - Added "View Sheet" button per row (visible to `isManager` only)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
