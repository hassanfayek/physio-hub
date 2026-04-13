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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await loadUserProfile(firebaseUser);
          setUser(profile);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Clears React state FIRST (synchronous), then tells Firebase to sign out.
  // This prevents the race condition where navigate() fires before the session clears.
  const logout = useCallback(async () => {
    setUser(null);
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
