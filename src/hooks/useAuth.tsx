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
import {
  writeProfileCache,
  readProfileCacheAny,
  readProfileCache,
  clearProfileCache,
} from "../services/profileCache";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from cache — no loading flash on return visits
  const [user,    setUser]    = useState<Profile>(() => readProfileCacheAny() as Profile | null);
  const [loading, setLoading] = useState(() => readProfileCacheAny() === null);

  const applyProfile = useCallback((profile: Profile) => {
    setUser(profile);
    if (profile) setClinicContext(profile.clinicId ?? "", profile.clinicSlug ?? "");
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        // login() in authService writes to cache before navigating, so this
        // almost always hits immediately — no Firestore wait on sign-in.
        const cached = readProfileCache(firebaseUser.uid) as Profile | null;
        if (cached) {
          applyProfile(cached);
          setLoading(false);
        }

        // Always refresh from Firestore in the background
        try {
          const profile = await loadUserProfile(firebaseUser);
          applyProfile(profile);
          writeProfileCache(profile);
        } catch {
          if (!cached) applyProfile(null);
        } finally {
          setLoading(false);
        }
      } else {
        clearProfileCache();
        clearClinicContext();
        setUser(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [applyProfile]);

  const logout = useCallback(async () => {
    setUser(null);
    clearProfileCache();
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
