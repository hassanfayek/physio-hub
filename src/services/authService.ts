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

export type UserRole = "patient" | "physiotherapist" | "clinic_manager" | "secretary" | "physician";

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

export interface PhysicianProfile extends UserProfile {
  role:           "physician";
  firstName:      string;
  lastName:       string;
  phone:          string;
  specialization: string;
  clinicName:     string;
}

export interface RegisterPhysicianData {
  email:          string;
  password:       string;
  firstName:      string;
  lastName:       string;
  phone:          string;
  specialization: string;
  clinicName:     string;
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

// ─── Patient code helpers ─────────────────────────────────────────────────────

/** Generates a human-readable 8-char code, e.g. "PH-A3K9F2" */
export function generatePatientCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/1/I to avoid confusion
  let code = "PH-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Internal email derived from a patient code — patients never see this */
export function codeToEmail(code: string): string {
  return `${code.replace("-", "").toLowerCase()}@ph.internal`;
}

/** Sign a patient in using their 8-char access code */
export async function loginWithCode(code: string): Promise<PatientProfile> {
  const normalised = code.trim().toUpperCase();
  const email      = codeToEmail(normalised);
  // The password is always the code itself (uppercased, with dash)
  await signInWithEmailAndPassword(auth, email, normalised);

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Login failed.");

  // Load profile from Firestore
  const userSnap = await getDoc(doc(db, "users", currentUser.uid));
  if (!userSnap.exists()) throw new Error("Patient profile not found.");

  const userData = userSnap.data() as DocumentData;
  const patSnap  = await getDoc(doc(db, "patients", currentUser.uid));
  const patData  = patSnap.exists() ? patSnap.data() as DocumentData : {};

  return {
    uid:              currentUser.uid,
    email:            userData.email ?? email,
    role:             "patient",
    displayName:      userData.displayName ?? "",
    firstName:        patData.firstName ?? "",
    lastName:         patData.lastName  ?? "",
    dateOfBirth:      patData.dateOfBirth ?? "",
    phone:            patData.phone ?? "",
    assignedPhysioId: patData.assignedPhysioId ?? null,
    status:           patData.status ?? "active",
    createdAt:        null,
    updatedAt:        null,
  };
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
    email:            data.email,
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
): Promise<PatientProfile | PhysioProfile | SecretaryProfile | PhysicianProfile> {
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

/**
 * Retry a Firestore getDoc up to `attempts` times when the client is offline.
 * Kept intentionally short — Firebase SDK handles reconnection internally;
 * we only need a brief window for iOS to re-establish its WebSocket.
 */
async function getDocWithRetry(
  ref: Parameters<typeof getDoc>[0],
  attempts = 2,
  delayMs  = 700
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

// Maps each role to its Firestore collection name
const ROLE_COLLECTION: Partial<Record<UserRole, string>> = {
  patient:          "patients",
  physiotherapist:  "physiotherapists",
  clinic_manager:   "physiotherapists",
  secretary:        "secretaries",
  physician:        "physicians",
};

export async function loadUserProfile(
  user: User
): Promise<PatientProfile | PhysioProfile | SecretaryProfile | PhysicianProfile | null> {
  // ── Read /users/{uid} and try to resolve the role-specific doc in parallel ──
  // We fire the user doc first, and as soon as we get the role we immediately
  // kick off the role-collection read. On a fast connection both complete at
  // roughly the same time; on a slow/reconnecting connection we save one full
  // RTT compared to strict sequential reads.

  const userDocRef = doc(db, "users", user.uid);
  const userSnap   = await getDocWithRetry(userDocRef);

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

  const collection = ROLE_COLLECTION[role];
  if (!collection) return null;

  const roleSnap = await getDocWithRetry(doc(db, collection, user.uid));
  if (!roleSnap.exists()) return null;
  const p = roleSnap.data() as DocumentData;

  if (role === "patient") {
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
    return {
      ...base,
      role:      "secretary",
      firstName: p.firstName,
      lastName:  p.lastName,
      phone:     p.phone ?? "",
    } as SecretaryProfile;
  }

  if (role === "physician") {
    return {
      ...base,
      role:           "physician",
      firstName:      p.firstName,
      lastName:       p.lastName,
      phone:          p.phone ?? "",
      specialization: p.specialization ?? "",
      clinicName:     p.clinicName ?? "",
    } as PhysicianProfile;
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

  const now = serverTimestamp();

  await setDoc(doc(db, "users", user.uid), {
    email:       data.email,
    role:        "secretary" as UserRole,
    displayName,
    createdAt:   now,
    updatedAt:   now,
  });

  await setDoc(doc(db, "secretaries", user.uid), {
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

// ─── Register physician (manager-initiated) ───────────────────────────────────

export async function registerPhysician(
  data: RegisterPhysicianData
): Promise<PhysicianProfile> {
  const credential = await createUserWithEmailAndPassword(
    secondaryAuth,
    data.email,
    data.password
  );

  const { user } = credential;
  const displayName = `Dr. ${data.firstName} ${data.lastName}`;

  await updateProfile(user, { displayName });

  const now = serverTimestamp();

  await setDoc(doc(db, "users", user.uid), {
    email:       data.email,
    role:        "physician" as UserRole,
    displayName,
    createdAt:   now,
    updatedAt:   now,
  });

  await setDoc(doc(db, "physicians", user.uid), {
    firstName:      data.firstName,
    lastName:       data.lastName,
    phone:          data.phone,
    email:          data.email,
    specialization: data.specialization,
    clinicName:     data.clinicName,
    createdAt:      now,
  });

  await secondaryAuth.signOut();

  return {
    uid:            user.uid,
    email:          data.email,
    role:           "physician",
    displayName,
    firstName:      data.firstName,
    lastName:       data.lastName,
    phone:          data.phone,
    specialization: data.specialization,
    clinicName:     data.clinicName,
    createdAt:      null,
    updatedAt:      null,
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
