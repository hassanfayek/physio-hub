# Contract: OverviewTab Component Props

**Feature**: `001-clinic-manager-dashboard`
**File**: `src/features/physio/PhysioDashboard.tsx` (internal component)

## Current Props (Unchanged)

```typescript
interface OverviewTabProps {
  physio:      PhysioProfile;
  isManager:   boolean;
  isSecretary?: boolean;
}
```

## Updated Props

```typescript
interface OverviewTabProps {
  physio:          PhysioProfile;
  isManager:       boolean;
  isSecretary?:    boolean;
  onViewPatient?:  (patientId: string) => void;  // ← NEW
}
```

### `onViewPatient`

| Property    | Value                                      |
|-------------|--------------------------------------------|
| Required    | No (optional — graceful no-op when absent) |
| Called when | User clicks "View Sheet" on an appointment |
| Argument    | `patientId: string` — the patient's UID    |
| Effect      | Caller sets `viewingPatientId` state       |

## Call Site (PhysioDashboard render)

```typescript
// BEFORE
<OverviewTab physio={physio} isManager={isManager} isSecretary={isSecretary} />

// AFTER
<OverviewTab
  physio={physio}
  isManager={isManager}
  isSecretary={isSecretary}
  onViewPatient={(id) => setViewingPatientId(id)}
/>
```

## Behaviour Contract

- When `isManager` is `true` AND `onViewPatient` is provided:
  - Each appointment row MUST render a "View Sheet" button.
  - Clicking the button MUST call `onViewPatient(appointment.patientId)`.
- When `isManager` is `false` OR `onViewPatient` is absent:
  - No "View Sheet" button is rendered.
  - Appointment list behaviour is unchanged from current.
- The `onViewPatient` callback MUST NOT be called with an empty string.
  If `patientId` is missing on an appointment, the button MUST be hidden.
