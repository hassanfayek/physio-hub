// src/App.tsx
// ─────────────────────────────────────────────────────────────────────────────
// SaaS-enabled routing. One login for all users — role + clinicSlug determine
// where each person lands after authentication.
//
// Route structure:
//   /                     → LandingPage       (public marketing)
//   /login                → LoginPage         (public)
//   /signup               → ClinicRegistration (public, new clinic onboarding)
//   /setup                → ClinicSetupPage   (existing managers without clinicId)
//   /admin                → SuperAdminDashboard (superadmin only)
//   /c/:slug/physio       → PhysioDashboard   (manager / physio / secretary)
//   /c/:slug/patient      → PatientDashboard  (patient)
//   /c/:slug/physician    → PhysicianDashboard
//   /c/:slug/partner      → PartnerDashboard
// ─────────────────────────────────────────────────────────────────────────────

import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { type ReactNode, lazy, Suspense } from "react";

import { AuthProvider, useAuth } from "./hooks/useAuth";
import { LanguageProvider } from "./contexts/LanguageContext";
import LoginPage              from "./features/auth/LoginPage";
import LandingPage            from "./features/landing/LandingPage";
import ClinicRegistrationPage from "./features/auth/ClinicRegistrationPage";
import ClinicSetupPage        from "./features/auth/ClinicSetupPage";
const PatientDashboard    = lazy(() => import("./features/patient/PatientDashboard"));
const PhysioDashboard     = lazy(() => import("./features/physio/PhysioDashboard"));
const PhysicianDashboard  = lazy(() => import("./features/physician/PhysicianDashboard"));
const PartnerDashboard    = lazy(() => import("./features/partner/PartnerDashboard"));
const SuperAdminDashboard = lazy(() => import("./features/admin/SuperAdminDashboard"));

// ─── Role → destination helper ────────────────────────────────────────────────

function roleDestination(role: string, clinicSlug: string): string {
  if (role === "superadmin") return "/admin";

  // No clinic slug yet → send clinic staff to the one-time setup wizard.
  // Patients and physicians use slug-less fallback routes until their clinic is linked.
  if (!clinicSlug) {
    if (role === "patient")   return "/patient";
    if (role === "physician") return "/physician";
    if (role === "partner")   return "/partner";
    return "/setup";
  }

  if (role === "patient")   return `/c/${clinicSlug}/patient`;
  if (role === "physician") return `/c/${clinicSlug}/physician`;
  if (role === "partner")   return `/c/${clinicSlug}/partner`;
  return `/c/${clinicSlug}/physio`;
}

// ─── Public route — redirects logged-in users to their portal ─────────────────

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading, clinicSlug } = useAuth();
  // Don't block rendering while auth resolves — show the page immediately.
  // Only redirect once we positively know a user is logged in.
  if (!loading && user) return <Navigate to={roleDestination(user.role, clinicSlug)} replace />;
  return <>{children}</>;
}

// ─── Protected route ──────────────────────────────────────────────────────────

const PHYSIO_ROLES    = new Set(["physiotherapist", "clinic_manager", "secretary"]);
const PHYSICIAN_ROLES = new Set(["physician"]);
const PARTNER_ROLES   = new Set(["partner"]);

type PortalKind = "physio" | "patient" | "physician" | "partner" | "admin";

function ProtectedRoute({ children, portal }: { children: ReactNode; portal: PortalKind }) {
  const { user, loading, clinicId, clinicSlug } = useAuth();
  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;

  // Existing manager with no clinicId yet → one-time setup wizard
  if (!clinicId && user.role !== "superadmin" && user.role !== "patient") {
    return <Navigate to="/setup" replace />;
  }

  const role = user.role;
  const allowed =
    portal === "admin"     ? role === "superadmin"         :
    portal === "physio"    ? PHYSIO_ROLES.has(role)        :
    portal === "physician" ? PHYSICIAN_ROLES.has(role)     :
    portal === "partner"   ? PARTNER_ROLES.has(role)       :
    role === "patient";

  if (!allowed) return <Navigate to={roleDestination(role, clinicSlug)} replace />;

  // Validate the slug in the URL matches the user's clinic (prevents URL spoofing)
  return <SlugGuard clinicSlug={clinicSlug}>{children}</SlugGuard>;
}

function SlugGuard({ clinicSlug, children }: { clinicSlug: string; children: ReactNode }) {
  const { slug } = useParams<{ slug?: string }>();
  // If there's a slug in the URL and it doesn't match the user's clinic, redirect
  if (slug && clinicSlug && slug !== clinicSlug) {
    return <Navigate to={`/c/${clinicSlug}/physio`} replace />;
  }
  return <>{children}</>;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Public — marketing + auth */}
        <Route path="/"       element={<PublicRoute><LandingPage /></PublicRoute>} />
        <Route path="/login"  element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><ClinicRegistrationPage /></PublicRoute>} />

        {/* Clinic setup (existing managers migrating to multi-tenant) */}
        <Route path="/setup"  element={<ClinicSetupPage />} />

        {/* Super-admin */}
        <Route path="/admin"  element={
          <ProtectedRoute portal="admin">
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />

        {/* Clinic portals — scoped under /c/:slug/ */}
        <Route path="/c/:slug/physio" element={
          <ProtectedRoute portal="physio">
            <PhysioDashboard />
          </ProtectedRoute>
        } />
        <Route path="/c/:slug/patient" element={
          <ProtectedRoute portal="patient">
            <PatientDashboard />
          </ProtectedRoute>
        } />
        <Route path="/c/:slug/physician" element={
          <ProtectedRoute portal="physician">
            <PhysicianDashboard />
          </ProtectedRoute>
        } />
        <Route path="/c/:slug/partner" element={
          <ProtectedRoute portal="partner">
            <PartnerDashboard />
          </ProtectedRoute>
        } />

        {/* Slug-less fallbacks — users whose clinic isn't linked yet, or old bookmarks */}
        <Route path="/physio"    element={<LegacyRedirect to="physio"    />} />
        <Route path="/patient"   element={
          <ProtectedRoute portal="patient"><PatientDashboard /></ProtectedRoute>
        } />
        <Route path="/physician" element={
          <ProtectedRoute portal="physician"><PhysicianDashboard /></ProtectedRoute>
        } />
        <Route path="/partner"   element={
          <ProtectedRoute portal="partner"><PartnerDashboard /></ProtectedRoute>
        } />
        <Route path="/register"  element={<Navigate to="/signup" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function LegacyRedirect({ to }: { to: string }) {
  const { user, loading, clinicSlug } = useAuth();
  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;
  return <Navigate to={`/c/${clinicSlug || "_"}/${to}`} replace />;
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
