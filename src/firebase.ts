// src/firebase.ts
// ─────────────────────────────────────────────────────────────────────────────
// Firebase initialisation for Physio+ Hub
// Replace the firebaseConfig values with your own project credentials from:
//   Firebase Console → Project Settings → Your apps → Web app → SDK config
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth }      from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDFmZ5-htu9Q_qICH2mPWZaIYvObuYE3P0",
  authDomain: "physio-hub-ae4c9.firebaseapp.com",
  projectId: "physio-hub-ae4c9",
  storageBucket: "physio-hub-ae4c9.firebasestorage.app",
  messagingSenderId: "894965126364",
  appId: "1:894965126364:web:7df96f6bac212a4b6d1019",
  measurementId: "G-SS4JKGE150"
};

// Prevent duplicate initialisation during hot-module reloads (Vite dev server)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;

// ─────────────────────────────────────────────────────────────────────────────
// Required .env.local file at project root:
//
//   VITE_FIREBASE_API_KEY=AIza...
//   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
//   VITE_FIREBASE_PROJECT_ID=your-project-id
//   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
//   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
//   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
//
// Install dependencies:
//   npm install firebase
// ─────────────────────────────────────────────────────────────────────────────
