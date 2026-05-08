// Module-level singleton so any service can read the current clinic's ID
// without needing React context or prop-drilling.
// Set once in AuthProvider when the user profile loads.

let _clinicId   = "";
let _clinicSlug = "";

export const getClinicId   = (): string => _clinicId;
export const getClinicSlug = (): string => _clinicSlug;

export function setClinicContext(clinicId: string, clinicSlug: string): void {
  _clinicId   = clinicId;
  _clinicSlug = clinicSlug;
}

export function clearClinicContext(): void {
  _clinicId   = "";
  _clinicSlug = "";
}
