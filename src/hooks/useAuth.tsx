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
  type ViewerProfile,
} from "../services/authService";

type Profile = PatientProfile | PhysioProfile | SecretaryProfile | PhysicianProfile | ViewerProfile | null;

interface AuthContextValue {
  user:    Profile;
  loading: boolean;
  logout:  () => Promise<void>;
}

// ─── localStorage profile cache ───────────────────────────────────────────────
// Serves the last known profile instantly on reload; Firestore refreshes it in
// the background so the UI is never stale for more than one render cycle.

const CACHE_KEY = "phub_profile_v2";

function readCache(): Profile {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { profile } = JSON.parse(raw) as { profile: Profile };
    return profile ?? null;
  } catch {
    return null;
  }
}

function writeCache(profile: Profile): void {
  try {
    if (profile) localStorage.setItem(CACHE_KEY, JSON.stringify({ profile }));
    else         localStorage.removeItem(CACHE_KEY);
  } catch { /* storage quota — ignore */ }
}

function clearCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user:    null,
  loading: true,
  logout:  async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise from cache so returning users see their dashboard immediately
  const [user,    setUser]    = useState<Profile>(readCache);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        // If the cached profile belongs to this user, resolve loading immediately
        // so the dashboard renders without waiting for Firestore.
        const cached = readCache();
        if (cached && cached.uid === firebaseUser.uid) {
          setUser(cached);
          setLoading(false);
        }

        // Always refresh from Firestore in the background.
        try {
          const profile = await loadUserProfile(firebaseUser);
          setUser(profile);
          writeCache(profile);
        } catch {
          setUser(null);
          clearCache();
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        clearCache();
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

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
