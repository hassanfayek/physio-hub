// src/services/authService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Physio+ Hub — Authentication & Firestore profile service
//
// Firestore data model:
//
//   /users/{uid}
//     email:         string
//     role:          "patient" | "physiotherapist"
//     displayName:   string
//     createdAt:     Timestamp
//     updatedAt:     Timestamp
//
//   /patients/{uid}
//     firstName:          string
//     lastName:           string
//     dateOfBirth:        string   (ISO 8601)
//     phone:              string
//     primaryCondition:   string
//     assignedPhysioId:   string | null
//     status:             "active" | "discharged" | "on_hold"
//     createdAt:          Timestamp
//
//   /physiotherapists/{uid}
//     firstName:       string
//     lastName:        string
//     licenseNumber:   string
//     specializations: string[]
//     clinicName:      string
//     phone:           string
//     createdAt:       Timestamp
// ─────────────────────────────────────────────────────────────────────────────

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  type User,
  type UserCredential,
} from "firebase/auth";

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";

import { auth, db, secondaryAuth } from "../firebase";
import { getFirestore } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "patient" | "physiotherapist" | "clinic_manager" | "secretary";

export interface UserProfile {
  uid:         string;
  email:       string;
  role:        UserRole;
  displayName: string;
  createdAt:   Date | null;
  updatedAt:   Date | null;
}

export interface PatientProfile extends UserProfile {
  role: "patient";
  firstName:        string;
  lastName:         string;
  dateOfBirth:      string;
  phone:            string;
  primaryCondition?: string;
  assignedPhysioId: string | null;
  status:           "active" | "discharged" | "on_hold";
}

export interface PhysioProfile extends UserProfile {
  role: "physiotherapist" | "clinic_manager";
  firstName:       string;
  lastName:        string;
  licenseNumber:   string;
  specializations: string[];
  clinicName:      string;
  phone:           string;
}

export interface SecretaryProfile extends UserProfile {
  role:      "secretary";
  firstName: string;
  lastName:  string;
  phone:     string;
}

export interface RegisterSecretaryData {
  email:     string;
  password:  string;
  firstName: string;
  lastName:  string;
  phone:     string;
}

export interface RegisterPatientData {
  email:            string;
  password:         string;
  firstName:        string;
  lastName:         string;
  dateOfBirth:      string;
  phone:            string;
}

export interface RegisterPhysioData {
  email:           string;
  password:        string;
  firstName:       string;
  lastName:        string;
  licenseNumber:   string;
  specializations: string[];
  clinicName:      string;
  phone:           string;
}

export interface AuthError {
  code:    string;
  message: string;
}

// ─── Error normaliser ─────────────────────────────────────────────────────────

export function parseFirebaseError(error: unknown): AuthError {
  const e = error as { code?: string; message?: string };
  const code = e.code ?? "unknown";

  const messages: Record<string, string> = {
    "auth/email-already-in-use":    "This email address is already registered.",
    "auth/invalid-email":           "Please enter a valid email address.",
    "auth/weak-password":           "Password must be at least 6 characters.",
    "auth/user-not-found":          "No account found with this email address.",
    "auth/wrong-password":          "Incorrect password. Please try again.",
    "auth/too-many-requests":       "Too many failed attempts. Please try again later.",
    "auth/network-request-failed":  "Network error. Please check your connection.",
    "auth/user-disabled":           "This account has been disabled. Contact support.",
    "auth/invalid-credential":      "Invalid credentials. Please check your email and password.",
  };

  return {
    code,
    message: messages[code] ?? e.message ?? "An unexpected error occurred.",
  };
}

// ─── Register patient ─────────────────────────────────────────────────────────

export async function registerPatient(
  data: RegisterPatientData
): Promise<PatientProfile> {
  // Use secondaryAuth so the current user session is NOT replaced.
  // After creating the account we sign out of secondaryAuth immediately.
  const credential: UserCredential = await createUserWithEmailAndPassword(
    secondaryAuth,
    data.email,
    data.password
  );

  const { user } = credential;
  const displayName = `${data.firstName} ${data.lastName}`;

  // Update display name on secondary auth user
  await updateProfile(user, { displayName });

  // Use the SECONDARY app's Firestore so the new patient writes their own docs.
  // This guarantees isOwner(uid) passes in Firestore rules.
  const secondaryApp = secondaryAuth.app;
  const secondaryDb  = getFirestore(secondaryApp);
  const now = serverTimestamp();

  await setDoc(doc(secondaryDb, "users", user.uid), {
    email:       data.email,
    role:        "patient" as UserRole,
    displayName,
    createdAt:   now,
    updatedAt:   now,
  });

  await setDoc(doc(secondaryDb, "patients", user.uid), {
    firstName:        data.firstName,
    lastName:         data.lastName,
    dateOfBirth:      data.dateOfBirth,
    phone:            data.phone,
    assignedPhysioId: null,
    status:           "active",
    createdAt:        now,
  });

  // NOW sign out of secondaryAuth — all writes are done
  await secondaryAuth.signOut();

  // Log the new patient into the MAIN auth so they are immediately signed in
  await signInWithEmailAndPassword(auth, data.email, data.password);

  return {
    uid:              user.uid,
    email:            data.email,
    role:             "patient",
    displayName,
    firstName:        data.firstName,
    lastName:         data.lastName,
    dateOfBirth:      data.dateOfBirth,
    phone:            data.phone,
    assignedPhysioId: null,
    status:           "active",
    createdAt:        null,
    updatedAt:        null,
  };
}

// ─── Register physiotherapist ─────────────────────────────────────────────────

export async function registerPhysio(
  data: RegisterPhysioData
): Promise<PhysioProfile> {
  const credential: UserCredential = await createUserWithEmailAndPassword(
    secondaryAuth,
    data.email,
    data.password
  );

  const { user } = credential;
  const displayName = `Dr. ${data.firstName} ${data.lastName}`;

  await updateProfile(user, { displayName });

  const secondaryApp2 = secondaryAuth.app;
  const secondaryDb2  = getFirestore(secondaryApp2);
  const now = serverTimestamp();

  await setDoc(doc(secondaryDb2, "users", user.uid), {
    email:       data.email,
    role:        "physiotherapist" as UserRole,
    displayName,
    createdAt:   now,
    updatedAt:   now,
  });

  await setDoc(doc(secondaryDb2, "physiotherapists", user.uid), {
    firstName:       data.firstName,
    lastName:        data.lastName,
    licenseNumber:   data.licenseNumber,
    specializations: data.specializations,
    clinicName:      data.clinicName,
    phone:           data.phone,
    createdAt:       now,
  });

  await secondaryAuth.signOut();

  // Log the new physio into the MAIN auth
  await signInWithEmailAndPassword(auth, data.email, data.password);

  return {
    uid:             user.uid,
    email:           data.email,
    role:            "physiotherapist",
    displayName,
    firstName:       data.firstName,
    lastName:        data.lastName,
    licenseNumber:   data.licenseNumber,
    specializations: data.specializations,
    clinicName:      data.clinicName,
    phone:           data.phone,
    createdAt:       null,
    updatedAt:       null,
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string
): Promise<PatientProfile | PhysioProfile | SecretaryProfile> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile    = await loadUserProfile(credential.user);

  if (!profile) {
    throw { code: "profile/not-found", message: "User profile not found." };
  }

  return profile;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await signOut(auth);
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ─── Load full user profile ───────────────────────────────────────────────────
// Reads /users/{uid} for the role, then fetches the role-specific collection.

/** Retry a Firestore getDoc up to `attempts` times when the client is offline. */
async function getDocWithRetry(
  ref: Parameters<typeof getDoc>[0],
  attempts = 4,
  delayMs  = 1500
): ReturnType<typeof getDoc> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await getDoc(ref);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      const isOffline = code === "unavailable" || code === "failed-precondition" ||
        (err instanceof Error && err.message.toLowerCase().includes("offline"));
      if (isOffline && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  // unreachable but satisfies TypeScript
  return getDoc(ref);
}

export async function loadUserProfile(
  user: User
): Promise<PatientProfile | PhysioProfile | SecretaryProfile | null> {
  const userSnap = await getDocWithRetry(doc(db, "users", user.uid));

  if (!userSnap.exists()) return null;

  const userData = userSnap.data() as DocumentData;
  const role: UserRole = userData.role;

  const base: UserProfile = {
    uid:         user.uid,
    email:       userData.email,
    role,
    displayName: userData.displayName,
    createdAt:   userData.createdAt?.toDate() ?? null,
    updatedAt:   userData.updatedAt?.toDate() ?? null,
  };

  if (role === "patient") {
    const patSnap = await getDocWithRetry(doc(db, "patients", user.uid));
    if (!patSnap.exists()) return null;
    const p = patSnap.data() as DocumentData;

    return {
      ...base,
      role:             "patient",
      firstName:        p.firstName,
      lastName:         p.lastName,
      dateOfBirth:      p.dateOfBirth,
      phone:            p.phone,
      primaryCondition: p.primaryCondition,
      assignedPhysioId: p.assignedPhysioId ?? null,
      status:           p.status ?? "active",
    } as PatientProfile;
  }

  if (role === "physiotherapist" || role === "clinic_manager") {
    const phSnap = await getDocWithRetry(doc(db, "physiotherapists", user.uid));
    if (!phSnap.exists()) return null;
    const p = phSnap.data() as DocumentData;

    return {
      ...base,
      role:            role as "physiotherapist" | "clinic_manager",
      firstName:       p.firstName,
      lastName:        p.lastName,
      licenseNumber:   p.licenseNumber,
      specializations: p.specializations ?? [],
      clinicName:      p.clinicName,
      phone:           p.phone,
    } as PhysioProfile;
  }

  if (role === "secretary") {
    const secSnap = await getDocWithRetry(doc(db, "secretaries", user.uid));
    if (!secSnap.exists()) return null;
    const s = secSnap.data() as DocumentData;

    return {
      ...base,
      role:      "secretary",
      firstName: s.firstName,
      lastName:  s.lastName,
      phone:     s.phone ?? "",
    } as SecretaryProfile;
  }

  return null;
}

// ─── Register secretary (manager-initiated) ───────────────────────────────────

export async function registerSecretary(
  data: RegisterSecretaryData
): Promise<SecretaryProfile> {
  const credential = await createUserWithEmailAndPassword(
    secondaryAuth,
    data.email,
    data.password
  );

  const { user } = credential;
  const displayName = `${data.firstName} ${data.lastName}`;

  await updateProfile(user, { displayName });

  const secondaryApp = secondaryAuth.app;
  const secondaryDb  = getFirestore(secondaryApp);
  const now = serverTimestamp();

  await setDoc(doc(secondaryDb, "users", user.uid), {
    email:       data.email,
    role:        "secretary" as UserRole,
    displayName,
    createdAt:   now,
    updatedAt:   now,
  });

  await setDoc(doc(secondaryDb, "secretaries", user.uid), {
    firstName: data.firstName,
    lastName:  data.lastName,
    phone:     data.phone,
    email:     data.email,
    createdAt: now,
  });

  await secondaryAuth.signOut();

  return {
    uid:         user.uid,
    email:       data.email,
    role:        "secretary",
    displayName,
    firstName:   data.firstName,
    lastName:    data.lastName,
    phone:       data.phone,
    createdAt:   null,
    updatedAt:   null,
  };
}

// ─── Update user profile ──────────────────────────────────────────────────────

export async function updateUserProfile(
  uid: string,
  updates: Partial<Record<string, unknown>>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

// ─── Auth state observer ──────────────────────────────────────────────────────
// Returns an unsubscribe function. Use inside useEffect.
//
// Example:
//   useEffect(() => {
//     return onAuthStateChange(async (user) => {
//       if (user) {
//         const profile = await loadUserProfile(user);
//         setCurrentUser(profile);
//       } else {
//         setCurrentUser(null);
//       }
//     });
//   }, []);

export function onAuthStateChange(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

// ─── Get current Firebase user (synchronous) ─────────────────────────────────

export function getCurrentFirebaseUser(): User | null {
  return auth.currentUser;
}
