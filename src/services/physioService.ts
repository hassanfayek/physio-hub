// FILE: src/services/physioService.ts

import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePhysioPayload {
  firstName:       string;
  lastName:        string;
  email:           string;
  password:        string;
  licenseNumber:   string;
  phone:           string;
  clinicName:      string;
  specializations: string[];
}

export interface CreatePhysioResult {
  uid:   string;
  error?: never;
}

export interface CreatePhysioError {
  uid?:  never;
  error: string;
}

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const map: Record<string, string> = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "permission-denied":         "You do not have permission to perform this action.",
  };
  return map[e.code ?? ""] ?? e.message ?? "An unexpected error occurred.";
}

// ─── Create physiotherapist ───────────────────────────────────────────────────
// Uses a secondary Firebase app so the manager's session is NOT replaced.
// Steps:
//  1. Create Firebase Auth account via secondary app
//  2. Write /physiotherapists/{uid}
//  3. Write /users/{uid} with role "physiotherapist"

export async function createPhysio(
  payload: CreatePhysioPayload
): Promise<CreatePhysioResult | CreatePhysioError> {
  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");

    const SECONDARY_APP_NAME = "physio-creation-worker";
    const secondaryApp =
      getApps().find((a) => a.name === SECONDARY_APP_NAME) ??
      initializeApp(
        (await import("../firebase")).default.options,
        SECONDARY_APP_NAME
      );

    const secondaryAuth: Auth = getAuth(secondaryApp);
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      payload.email,
      payload.password
    );
    const { uid } = credential.user;
    await secondaryAuth.signOut();

    // /physiotherapists/{uid}
    await setDoc(doc(db, "physiotherapists", uid), {
      firstName:       payload.firstName,
      lastName:        payload.lastName,
      email:           payload.email,
      licenseNumber:   payload.licenseNumber,
      phone:           payload.phone,
      clinicName:      payload.clinicName,
      specializations: payload.specializations,
      createdAt:       serverTimestamp(),
    });

    // /users/{uid}
    await setDoc(doc(db, "users", uid), {
      email:       payload.email,
      role:        "physiotherapist",
      displayName: `Dr. ${payload.firstName} ${payload.lastName}`,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });

    return { uid };
  } catch (err) {
    return { error: parseError(err) };
  }
}
