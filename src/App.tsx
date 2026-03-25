// src/App.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Root application with Firebase auth integration, protected routes, and
// role-based redirects.
//
// Route structure:
//   /            → LoginPage       (public)
//   /register    → RegisterPage    (public)
//   /patient     → PatientDashboard (protected, role: patient)
//   /physio      → PhysioDashboard  (protected, role: physiotherapist)
// ─────────────────────────────────────────────────────────────────────────────

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { type ReactNode } from "react";

import { AuthProvider, useAuth } from "./hooks/useAuth";
import LoginPage    from "./features/auth/LoginPage";
import RegisterPage from "./features/auth/RegisterPage";
import logo from "./assets/physio-logo.svg";

// Lazy-import dashboards to keep the auth bundle lean
import PatientDashboard from "./features/patient/PatientDashboard";
import PhysioDashboard  from "./features/physio/PhysioDashboard";

// ─── Loading screen (shown while Firebase resolves auth state) ────────────────

function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 0,
      background: "#ffffff",
      fontFamily: "'Outfit', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');

        @keyframes ls-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ls-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes ls-bar {
          0%   { width: 0%; }
          60%  { width: 75%; }
          85%  { width: 88%; }
          100% { width: 95%; }
        }
        @keyframes ls-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1);   opacity: 1;   }
        }

        .ls-wrap {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 0;
          animation: ls-fade-in 0.5s ease both;
        }
        .ls-logo {
          height: 64px; width: auto;
          margin-bottom: 40px;
          filter: drop-shadow(0 4px 16px rgba(46,139,192,0.15));
        }
        .ls-bar-track {
          width: 180px; height: 3px;
          background: #f0ede8; border-radius: 100px;
          overflow: hidden; margin-bottom: 28px;
        }
        .ls-bar-fill {
          height: 100%; border-radius: 100px;
          background: linear-gradient(90deg, #2E8BC0, #5BC0BE);
          animation: ls-bar 2.4s cubic-bezier(0.4, 0, 0.2, 1) both;
        }
        .ls-dots {
          display: flex; gap: 6px; align-items: center;
        }
        .ls-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #2E8BC0;
          animation: ls-dot 1.2s ease-in-out infinite;
        }
        .ls-dot:nth-child(2) { animation-delay: 0.2s; }
        .ls-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      <div className="ls-wrap">
        <img src={logo} alt="Physio+ Hub" className="ls-logo" />
        <div className="ls-bar-track">
          <div className="ls-bar-fill" />
        </div>
        <div className="ls-dots">
          <div className="ls-dot" />
          <div className="ls-dot" />
          <div className="ls-dot" />
        </div>
      </div>
    </div>
  );
}

// ─── Protected route ──────────────────────────────────────────────────────────
// Redirects to "/" if no user is logged in.
// Optionally enforces a required role — sends wrong-role users to their portal.

// Roles that can access the /physio portal
const PHYSIO_PORTAL_ROLES = new Set(["physiotherapist", "clinic_manager", "secretary"]);

function ProtectedRoute({
  children,
  requiredRole,
}: {
  children:      ReactNode;
  requiredRole?: "patient" | "physiotherapist";
}) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/" replace />;

  if (requiredRole) {
    // "physiotherapist" gate also admits clinic_manager
    const allowed =
      requiredRole === "physiotherapist"
        ? PHYSIO_PORTAL_ROLES.has(user.role)
        : user.role === requiredRole;

    if (!allowed) {
      return <Navigate to={user.role === "patient" ? "/patient" : "/physio"} replace />;
    }
  }

  return <>{children}</>;
}

// ─── Public route ─────────────────────────────────────────────────────────────
// Redirects already-authenticated users to their portal.

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (user) {
    return <Navigate to={user.role === "patient" ? "/patient" : "/physio"} replace />;
  }

  return <>{children}</>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={
        <PublicRoute><LoginPage /></PublicRoute>
      } />
      <Route path="/register" element={
        <PublicRoute><RegisterPage /></PublicRoute>
      } />

      {/* Protected */}
      <Route path="/patient" element={
        <ProtectedRoute requiredRole="patient">
          <PatientDashboard />
        </ProtectedRoute>
      } />
      <Route path="/physio" element={
        <ProtectedRoute requiredRole="physiotherapist">
          <PhysioDashboard />
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
