# Data Model: Clinic Manager Today Dashboard

**Branch**: `001-clinic-manager-dashboard` | **Date**: 2026-03-26

## Firestore Collections (Existing — Read Only)

### `/appointments/{id}`

No schema changes. The `status` field gains one new allowed value.

| Field         | Type                                               | Notes                              |
|---------------|----------------------------------------------------|------------------------------------|
| `patientId`   | `string`                                           | UID → `/patients/{id}`             |
| `patientName` | `string`                                           | Denormalized display name          |
| `physioId`    | `string`                                           | UID → `/physiotherapists/{id}`     |
| `physioName`  | `string`                                           | Denormalized display name          |
| `date`        | `string` (YYYY-MM-DD)                              | Normalized in `docToAppointment`   |
| `hour`        | `number` (0–23)                                    | Appointment start hour             |
| `sessionType` | `string`                                           | e.g. "Initial Assessment"          |
| `status`      | `"scheduled" \| "in_progress" \| "completed" \| "cancelled"` | **`in_progress` is new** |
| `createdAt`   | `Timestamp \| null`                                |                                    |

**Status transition flow**:
```
scheduled → in_progress → completed
scheduled → cancelled
```

## TypeScript Type Changes

### `src/services/appointmentService.ts`

```typescript
// BEFORE
status: "scheduled" | "completed" | "cancelled"

// AFTER
status: "scheduled" | "in_progress" | "completed" | "cancelled"
```

Update `docToAppointment` normalizer:
```typescript
// AFTER — add "in_progress" to the guard
status: (
  data.status === "completed"   ? "completed"   :
  data.status === "cancelled"   ? "cancelled"   :
  data.status === "in_progress" ? "in_progress" :
  "scheduled"
) as Appointment["status"]
```

Update `updateAppointmentStatus` signature:
```typescript
// AFTER
status: "scheduled" | "in_progress" | "completed" | "cancelled"
```

### `src/services/dashboardService.ts`

```typescript
// BEFORE
export interface TodayAppointment {
  id:          string;
  patientName: string;
  physioName:  string;
  hour:        number;
  sessionType: string;
  status:      string;
}

// AFTER — add patientId
export interface TodayAppointment {
  id:          string;
  patientId:   string;   // ← NEW: required for "View Sheet" navigation
  patientName: string;
  physioName:  string;
  hour:        number;
  sessionType: string;
  status:      string;
}
```

Update `subscribeTodayAppointments` snapshot mapper to include `patientId`:
```typescript
patientId: (d.data().patientId as string) ?? "",
```

## Status Display Mapping (UI Only)

Defined as a pure function — no Firestore change, no migration needed.

```typescript
function displayStatus(status: string): { label: string; colour: string } {
  switch (status) {
    case "in_progress": return { label: "In Progress", colour: "amber"  };
    case "completed":   return { label: "Completed",   colour: "green"  };
    case "cancelled":   return { label: "Cancelled",   colour: "grey"   };
    default:            return { label: "Upcoming",    colour: "blue"   };
  }
}
```

## No Migration Required

All existing `appointments` documents with `status: "scheduled"` are handled by
the `default` branch above and display as "Upcoming". No backfill needed.
