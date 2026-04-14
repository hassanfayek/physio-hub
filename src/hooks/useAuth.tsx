// src/hooks/useAuth.ts

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

import {
  onAuthStateChange,
  loadUserProfile,
  logout as firebaseLogout,
  type PatientProfile,
  type PhysioProfile,
  type SecretaryProfile,
  type PhysicianProfile,
} from "../services/authService";

type Profile = PatientProfile | PhysioProfile | SecretaryProfile | PhysicianProfile | null;

interface AuthContextValue {
  user:    Profile;
  loading: boolean;
  logout:  () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user:    null,
  loading: true,
  logout:  async () => {},
});

// ── localStorage profile cache ─────────────────────────────────────────────────
// Stores a minimal snapshot so the dashboard renders immediately on return visits
// without waiting for Firestore. The full profile is always refreshed in background.

const CACHE_KEY = "phub_profile_v1";

function readCache(uid: string): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.uid === uid ? (parsed as unknown as Profile) : null;
  } catch { return null; }
}

function writeCache(profile: Profile): void {
  try {
    if (profile) localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch { /* storage quota exceeded — skip */ }
}

function clearCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        // ── Step 1: serve cached profile instantly ─────────────────────────
        // This ends the loading screen immediately on return visits so the
        // dashboard renders without waiting for any network round-trips.
        const cached = readCache(firebaseUser.uid);
        if (cached) {
          setUser(cached);
          setLoading(false);
        }

        // ── Step 2: always refresh from Firestore in the background ────────
        try {
          const profile = await loadUserProfile(firebaseUser);
          setUser(profile);
          writeCache(profile);
        } catch {
          // Firestore unreachable — keep the cached profile if we already
          // showed it; otherwise clear the user to force re-login.
          if (!cached) setUser(null);
        } finally {
          // No-op when cache already cleared loading; needed for first login.
          setLoading(false);
        }
      } else {
        clearCache();
        setUser(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Clears React state FIRST (synchronous), then tells Firebase to sign out.
  // This prevents the race condition where navigate() fires before the session clears.
  const logout = useCallback(async () => {
    setUser(null);
    clearCache();
    await firebaseLogout();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
