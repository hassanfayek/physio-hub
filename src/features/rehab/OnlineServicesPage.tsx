// FILE: src/features/rehab/OnlineServicesPage.tsx
// Wrapper that groups Online Rehabilitation and Nutrition Plans under one tab.

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import OnlineRehabPage from "./OnlineRehabPage";
import NutritionTab    from "../patient/NutritionTab";
import {
  subscribeToAllPatients,
  subscribeToPhysioPatients,
  type Patient,
} from "../../services/patientService";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  physioId:   string;
  physioName: string;
  isManager:  boolean;
  isSenior?:  boolean;
}

// ─── Sub-tab type ─────────────────────────────────────────────────────────────

type ServiceTab = "rehab" | "nutrition";

// ─── Nutrition patient list ───────────────────────────────────────────────────

function NutritionServicePage({
  physioId,
  isManager,
}: {
  physioId:  string;
  isManager: boolean;
}) {
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<Patient | null>(null);

  useEffect(() => {
    if (isManager) {
      return subscribeToAllPatients(setPatients);
    }
    return subscribeToPhysioPatients(physioId, setPatients);
  }, [physioId, isManager]);

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q)
    );
  });

  if (selected) {
    return (
      <div>
        <button
          className="reh-back-btn"
          onClick={() => setSelected(null)}
        >
          <ArrowLeft size={14} strokeWidth={2} /> Back to patients
        </button>

        <div className="reh-patient-hdr" style={{ marginBottom: 20 }}>
          <div className="reh-patient-avatar">
            {selected.firstName[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="reh-patient-info">
            <div className="reh-patient-name">
              {selected.firstName} {selected.lastName}
            </div>
            <div className="reh-patient-meta">Nutrition Plan</div>
          </div>
        </div>

        <NutritionTab
          patientId={selected.uid}
          patientName={`${selected.firstName} ${selected.lastName}`}
          canEdit={true}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="reh-hdr">
        <div>
          <div className="reh-title">Nutrition Plans</div>
          <div className="reh-sub">
            View and manage personalised nutrition plans for each patient
          </div>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search patients…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "9px 14px",
          borderRadius: 10,
          border: "1.5px solid #e5e0d8",
          fontFamily: "'Outfit', sans-serif",
          fontSize: 13,
          marginBottom: 16,
          outline: "none",
          boxSizing: "border-box",
          background: "#fafaf8",
        }}
      />

      {filtered.length === 0 ? (
        <div className="reh-empty">
          <div className="reh-empty-icon">🥗</div>
          <div className="reh-empty-title">
            {search ? "No patients match your search" : "No patients yet"}
          </div>
          <div className="reh-empty-sub">
            Patients will appear here once they are added to the system.
          </div>
        </div>
      ) : (
        <div className="reh-grid">
          {filtered.map((p) => (
            <div
              key={p.uid}
              className="reh-card"
              onClick={() => setSelected(p)}
            >
              <div className="reh-card-avatar">
                {p.firstName[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="reh-card-info">
                <div className="reh-card-name">
                  {p.firstName} {p.lastName}
                </div>
                <div className="reh-card-meta">
                  {p.status === "active"
                    ? "Active"
                    : p.status === "discharged"
                    ? "Discharged"
                    : "On Hold"}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#9a9590",
                  fontFamily: "'Outfit', sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                Open plan →
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnlineServicesPage({
  physioId,
  physioName,
  isManager,
  isSenior = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<ServiceTab>("rehab");

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Sub-tab toggle */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          background: "#f5f2ee",
          borderRadius: 12,
          padding: 4,
          width: "fit-content",
        }}
      >
        {(
          [
            { id: "rehab",     label: "Online Rehabilitation" },
            { id: "nutrition", label: "Nutrition Plans"        },
          ] as { id: ServiceTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: "8px 18px",
              borderRadius: 9,
              border: "none",
              fontFamily: "'Outfit', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
              background: activeTab === id ? "#fff" : "transparent",
              color:      activeTab === id ? "#1a1a1a" : "#9a9590",
              boxShadow:  activeTab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "rehab" && (
        <OnlineRehabPage
          physioId={physioId}
          physioName={physioName}
          isManager={isManager}
          isSenior={isSenior}
        />
      )}
      {activeTab === "nutrition" && (
        <NutritionServicePage
          physioId={physioId}
          isManager={isManager}
        />
      )}
    </div>
  );
}
