// Shared localStorage cache for the authenticated user profile.
// Written by login() in authService so useAuth's onAuthStateChange finds it
// immediately — eliminating the double Firestore fetch on sign-in.

const KEY    = "phub_profile_v1";
const KEY_V2 = "phub_profile_v2"; // stale key from a brief migration — clean it up

export function writeProfileCache(profile: unknown): void {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* quota */ }
}

export function readProfileCacheAny(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p.clinicId)   p.clinicId   = "";
    if (!p.clinicSlug) p.clinicSlug = "";
    return p;
  } catch { return null; }
}

export function readProfileCache(uid: string): Record<string, unknown> | null {
  const p = readProfileCacheAny();
  return p?.uid === uid ? p : null;
}

export function clearProfileCache(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_V2);
  } catch { /* noop */ }
}
