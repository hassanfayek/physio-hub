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

// Keep v1 key so existing users don't lose their cached profile.
// Missing new fields (clinicId/clinicSlug) are back-filled with defaults so
// the cache still produces an instant render; the background refresh fills them in.
const CACHE_KEY = "phub_profile_v1";

function readCache(uid: string): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.uid !== uid) return null;
    // Back-fill fields added in the SaaS migration so old cache entries still type-check
    if (!parsed.clinicId)   parsed.clinicId   = "";
    if (!parsed.clinicSlug) parsed.clinicSlug = "";
    return parsed as unknown as Profile;
  } catch { return null; }
}

function writeCache(profile: Profile): void {
  try {
    if (profile) localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch { /* storage quota exceeded */ }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem("phub_profile_v2"); // clean up the briefly-used v2 key
  } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

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
