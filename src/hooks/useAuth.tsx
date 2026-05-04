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
  type SuperAdminProfile,
} from "../services/authService";
import { setClinicContext, clearClinicContext } from "../services/clinicContext";

type Profile = PatientProfile | PhysioProfile | SecretaryProfile | PhysicianProfile | SuperAdminProfile | null;

interface AuthContextValue {
  user:       Profile;
  loading:    boolean;
  clinicId:   string;
  clinicSlug: string;
  logout:     () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user:       null,
  loading:    true,
  clinicId:   "",
  clinicSlug: "",
  logout:     async () => {},
});

// ── localStorage profile cache ─────────────────────────────────────────────────

const CACHE_KEY = "phub_profile_v1";

// Read cache without knowing the uid — used to hydrate state synchronously on
// the very first render so the app never shows a loading screen.
// The auth listener will evict it if the uid doesn't match (e.g. different user).
function readCacheAny(): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.clinicId)   parsed.clinicId   = "";
    if (!parsed.clinicSlug) parsed.clinicSlug = "";
    return parsed as unknown as Profile;
  } catch { return null; }
}

function readCache(uid: string): Profile | null {
  const p = readCacheAny();
  return p?.uid === uid ? p : null;
}

function writeCache(profile: Profile): void {
  try {
    if (profile) localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch { /* storage quota exceeded */ }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("phub_profile_v2");
  } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate from localStorage synchronously — no loading flash on return visits
  const [user,    setUser]    = useState<Profile>(() => readCacheAny());
  const [loading, setLoading] = useState(() => readCacheAny() === null);

  const applyProfile = useCallback((profile: Profile) => {
    setUser(profile);
    if (profile) {
      setClinicContext(profile.clinicId ?? "", profile.clinicSlug ?? "");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        // Serve cached profile instantly
        const cached = readCache(firebaseUser.uid);
        if (cached) {
          applyProfile(cached);
          setLoading(false);
        }

        // Always refresh from Firestore in the background
        try {
          const profile = await loadUserProfile(firebaseUser);
          applyProfile(profile);
          writeCache(profile);
        } catch {
          if (!cached) applyProfile(null);
        } finally {
          setLoading(false);
        }
      } else {
        clearCache();
        clearClinicContext();
        setUser(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [applyProfile]);

  const logout = useCallback(async () => {
    setUser(null);
    clearCache();
    clearClinicContext();
    await firebaseLogout();
  }, []);

  const clinicId   = user?.clinicId   ?? "";
  const clinicSlug = user?.clinicSlug ?? "";

  return (
    <AuthContext.Provider value={{ user, loading, clinicId, clinicSlug, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
