// src/App.tsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { type ReactNode, lazy, Suspense } from "react";

import { AuthProvider, useAuth } from "./hooks/useAuth";
import { LanguageProvider } from "./contexts/LanguageContext";
import LoginPage    from "./features/auth/LoginPage";
import RegisterPage from "./features/auth/RegisterPage";

const PatientDashboard   = lazy(() => import("./features/patient/PatientDashboard"));
const PhysioDashboard    = lazy(() => import("./features/physio/PhysioDashboard"));
const PhysicianDashboard = lazy(() => import("./features/physician/PhysicianDashboard"));
const PartnerDashboard   = lazy(() => import("./features/partner/PartnerDashboard"));
const ViewerDashboard    = lazy(() => import("./features/viewer/ViewerDashboard"));

function AppLoader() {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#fafaf8",
    }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2E8BC0"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: "spin 0.9s linear infinite" }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Role → destination helper ────────────────────────────────────────────────

function roleDestination(role: string): string {
  if (role === "patient")   return "/patient";
  if (role === "physician") return "/physician";
  if (role === "partner")   return "/partner";
  if (role === "viewer")    return "/viewer";
  return "/physio";
}

// ─── Public route — redirects logged-in users to their portal ─────────────────

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoader />;
  if (user)    return <Navigate to={roleDestination(user.role)} replace />;
  return <>{children}</>;
}

// ─── Protected route ──────────────────────────────────────────────────────────

const PHYSIO_ROLES    = new Set(["physiotherapist", "clinic_manager", "secretary"]);
const PHYSICIAN_ROLES = new Set(["physician"]);
const PARTNER_ROLES   = new Set(["partner"]);

type PortalKind = "physio" | "patient" | "physician" | "partner" | "viewer";

function ProtectedRoute({ children, portal }: { children: ReactNode; portal: PortalKind }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoader />;
  if (!user)   return <Navigate to="/login" replace />;

  const role = user.role;
  const allowed =
    portal === "physio"    ? PHYSIO_ROLES.has(role)    :
    portal === "physician" ? PHYSICIAN_ROLES.has(role) :
    portal === "partner"   ? PARTNER_ROLES.has(role)   :
    portal === "viewer"    ? role === "viewer"          :
    role === "patient";

  if (!allowed) return <Navigate to={roleDestination(role)} replace />;
  return <>{children}</>;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Suspense fallback={<AppLoader />}>
      <Routes>
        <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        <Route path="/physio" element={
          <ProtectedRoute portal="physio"><PhysioDashboard /></ProtectedRoute>
        } />
        <Route path="/patient" element={
          <ProtectedRoute portal="patient"><PatientDashboard /></ProtectedRoute>
        } />
        <Route path="/physician" element={
          <ProtectedRoute portal="physician"><PhysicianDashboard /></ProtectedRoute>
        } />
        <Route path="/partner" element={
          <ProtectedRoute portal="partner"><PartnerDashboard /></ProtectedRoute>
        } />
        <Route path="/viewer" element={
          <ProtectedRoute portal="viewer"><ViewerDashboard /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
