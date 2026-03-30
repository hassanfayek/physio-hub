// FILE: src/features/patient/PatientPricingSection.tsx
// Visible only to clinic_manager and secretary (when enabled by manager).

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Check, X, Eye, EyeOff, DollarSign } from "lucide-react";
import {
  subscribeToPatientBilling,
  subscribeToBillingSettings,
  saveBillingSettings,
  addBillingEntry,
  updateBillingEntry,
  deleteBillingEntry,
  type BillingEntry,
} from "../../services/priceService";

// ─── Props ────────────────────────────────────────────────────────────────────

interface PatientPricingSectionProps {
  patientId:  string;
  isManager:  boolean;          // clinic_manager
  isSecretary: boolean;
  patientName: string;
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  date:        new Date().toISOString().slice(0, 10),
  description: "",
  amount:      "",
  paid:        false,
  paidDate:    "",
  notes:       "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatientPricingSection({
  patientId,
  isManager,
  patientName,
}: PatientPricingSectionProps) {
  const [entries,           setEntries]          = useState<BillingEntry[]>([]);
  const [loading,           setLoading]          = useState(true);
  const [secretaryCanView,  setSecretaryCanView] = useState(true);
  const [togglingVis,       setTogglingVis]      = useState(false);

  // Modal state
  const [showAdd,    setShowAdd]    = useState(false);
  const [editEntry,  setEditEntry]  = useState<BillingEntry | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Subscriptions ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    return subscribeToPatientBilling(
      patientId,
      (data) => { setEntries(data); setLoading(false); },
      ()     => setLoading(false)
    );
  }, [patientId]);

  useEffect(() => {
    return subscribeToBillingSettings(
      (s) => setSecretaryCanView(s.secretaryCanView),
      () => {}
    );
  }, []);

  // ── Toggle secretary visibility ───────────────────────────────────────────
  const handleToggleVisibility = async () => {
    setTogglingVis(true);
    const next = !secretaryCanView;
    await saveBillingSettings({ secretaryCanView: next });
    setTogglingVis(false);
    showToast(next ? "Secretary can now view pricing" : "Pricing hidden from secretary");
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
  const totalPaid   = entries.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
  const balance     = totalAmount - totalPaid;

  // ── Open add form ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditEntry(null);
    setSaveError(null);
    setShowAdd(true);
  };

  // ── Open edit form ────────────────────────────────────────────────────────
  const openEdit = (entry: BillingEntry) => {
    setForm({
      date:        entry.date,
      description: entry.description,
      amount:      String(entry.amount),
      paid:        entry.paid,
      paidDate:    entry.paidDate,
      notes:       entry.notes,
    });
    setEditEntry(entry);
    setSaveError(null);
    setShowAdd(true);
  };

  // ── Save (add or edit) ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.description.trim() || !form.amount || !form.date) {
      setSaveError("Date, description and amount are required."); return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) {
      setSaveError("Please enter a valid amount."); return;
    }
    setSaving(true); setSaveError(null);

    const payload = {
      patientId,
      date:        form.date,
      description: form.description.trim(),
      amount,
      paid:        form.paid,
      paidDate:    form.paid ? (form.paidDate || form.date) : "",
      notes:       form.notes.trim(),
    };

    if (editEntry) {
      const { error } = await updateBillingEntry(editEntry.id, payload);
      if (error) { setSaveError(error); setSaving(false); return; }
      showToast("Entry updated");
    } else {
      const result = await addBillingEntry(payload);
      if ("error" in result && result.error) { setSaveError(result.error); setSaving(false); return; }
      showToast("Entry added");
    }

    setSaving(false);
    setShowAdd(false);
    setEditEntry(null);
  };

  // ── Toggle paid inline ────────────────────────────────────────────────────
  const handleTogglePaid = async (entry: BillingEntry) => {
    const paid    = !entry.paid;
    const paidDate = paid ? (entry.paidDate || new Date().toISOString().slice(0, 10)) : "";
    await updateBillingEntry(entry.id, { paid, paidDate });
    showToast(paid ? "Marked as paid" : "Marked as unpaid");
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(true);
    await deleteBillingEntry(id);
    setDeleting(false);
    setDeletingId(null);
    showToast("Entry deleted");
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <style>{`
        .pps-wrap { font-family: 'Outfit', sans-serif; }

        /* ── Header row ── */
        .pps-header {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px; margin-bottom: 18px;
        }
        .pps-title {
          font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 500; color: #1a1a1a;
        }
        .pps-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        .pps-vis-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; border: 1.5px solid;
          white-space: nowrap;
        }
        .pps-vis-btn.visible   { border-color: #b7e4c7; color: #1b4332; background: #f0fdf4; }
        .pps-vis-btn.visible:hover { background: #d8f3dc; }
        .pps-vis-btn.hidden    { border-color: #fca5a5; color: #991b1b; background: #fff5f5; }
        .pps-vis-btn.hidden:hover  { background: #fee2e2; }
        .pps-vis-btn:disabled  { opacity: 0.5; cursor: not-allowed; }

        .pps-add-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 9px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: background 0.15s; min-height: 36px;
        }
        .pps-add-btn:hover { background: #0C3C60; }

        /* ── Summary cards ── */
        .pps-summary {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;
        }
        @media (max-width: 540px) { .pps-summary { grid-template-columns: 1fr; } }
        .pps-card {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
          padding: 14px 16px;
        }
        .pps-card.accent-blue  { border-top: 3px solid #2E8BC0; }
        .pps-card.accent-green { border-top: 3px solid #52b788; }
        .pps-card.accent-red   { border-top: 3px solid #e07a5f; }
        .pps-card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 700; margin-bottom: 4px; }
        .pps-card-value { font-family: 'Playfair Display', serif; font-size: 24px; color: #1a1a1a; }
        .pps-card-sub   { font-size: 11px; color: #9a9590; margin-top: 2px; }

        /* ── Table ── */
        .pps-table-wrap { overflow-x: auto; border-radius: 14px; border: 1.5px solid #e5e0d8; }
        .pps-table {
          width: 100%; border-collapse: collapse;
          font-family: 'Outfit', sans-serif;
        }
        .pps-table th {
          background: #f5f3ef; padding: 11px 14px;
          font-size: 10.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: #9a9590;
          border-bottom: 1.5px solid #e5e0d8; white-space: nowrap; text-align: left;
        }
        .pps-table td {
          padding: 12px 14px; border-bottom: 1px solid #f0ede8;
          font-size: 13.5px; color: #1a1a1a; vertical-align: middle;
        }
        .pps-table tr:last-child td { border-bottom: none; }
        .pps-table tr:hover td { background: #fafaf8; }

        .pps-desc     { font-weight: 500; }
        .pps-notes    { font-size: 12px; color: #9a9590; margin-top: 2px; }
        .pps-amount   { font-weight: 600; font-family: 'Playfair Display', serif; font-size: 15px; white-space: nowrap; }

        .pps-paid-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px;
          white-space: nowrap; cursor: pointer; transition: all 0.15s; border: 1.5px solid;
        }
        .pps-paid-badge.paid   { background: #f0fdf4; color: #1b4332; border-color: #b7e4c7; }
        .pps-paid-badge.paid:hover { background: #d8f3dc; }
        .pps-paid-badge.unpaid { background: #fff5f5; color: #991b1b; border-color: #fca5a5; }
        .pps-paid-badge.unpaid:hover { background: #fee2e2; }

        .pps-action-row { display: flex; align-items: center; gap: 5px; }
        .pps-edit-btn, .pps-del-btn {
          display: inline-flex; align-items: center; gap: 4px;
          height: 28px; padding: 0 10px; border-radius: 7px;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; border: 1.5px solid; white-space: nowrap;
        }
        .pps-edit-btn { border-color: #B3DEF0; background: #EAF5FC; color: #2E8BC0; }
        .pps-edit-btn:hover { background: #D6EEF8; }
        .pps-del-btn  { border-color: #e5e0d8; background: #fafaf8; color: #c0bbb4; }
        .pps-del-btn:hover:not(:disabled) { border-color: #fca5a5; color: #b91c1c; background: #fff5f5; }
        .pps-del-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .pps-empty {
          text-align: center; padding: 48px 20px;
          color: #c0bbb4; font-size: 14px;
        }
        .pps-empty-icon { margin: 0 auto 12px; opacity: 0.4; }

        /* ── Secretary-hidden banner ── */
        .pps-sec-banner {
          background: #fff8f0; border: 1.5px solid #fcd34d;
          border-radius: 12px; padding: 12px 16px;
          font-size: 13px; color: #92400e;
          display: flex; align-items: center; gap: 10px; margin-bottom: 18px;
        }

        /* ── Modal ── */
        .pps-overlay {
          position: fixed; inset: 0; z-index: 1100;
          background: rgba(10,15,10,0.45); backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
          animation: ppsOverlayIn 0.15s ease both;
        }
        @keyframes ppsOverlayIn { from { opacity:0; } to { opacity:1; } }

        .pps-modal {
          background: #fff; border-radius: 20px; padding: 28px;
          width: min(480px, 100%); max-height: 90vh; overflow-y: auto;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          animation: ppsModalIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
          font-family: 'Outfit', sans-serif;
        }
        @keyframes ppsModalIn {
          from { opacity:0; transform: scale(0.95) translateY(10px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }
        .pps-modal-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 500; color: #1a1a1a; margin-bottom: 4px; }
        .pps-modal-sub   { font-size: 13px; color: #9a9590; margin-bottom: 22px; }

        .pps-field { margin-bottom: 14px; }
        .pps-label {
          display: block; font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: #5a5550; margin-bottom: 6px;
        }
        .pps-input {
          width: 100%; padding: 10px 13px; border-radius: 10px; box-sizing: border-box;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          outline: none; transition: border-color 0.15s; min-height: 42px;
        }
        .pps-input:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.1); }
        .pps-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 480px) { .pps-field-row { grid-template-columns: 1fr; } }

        .pps-checkbox-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 13px; background: #fafaf8; border: 1.5px solid #e5e0d8;
          border-radius: 10px; cursor: pointer; transition: border-color 0.15s;
        }
        .pps-checkbox-row:hover { border-color: #2E8BC0; }
        .pps-checkbox-row input { width: 16px; height: 16px; cursor: pointer; accent-color: #2E8BC0; }
        .pps-checkbox-row label { font-size: 14px; color: #1a1a1a; cursor: pointer; }

        .pps-modal-error { font-size: 13px; color: #b91c1c; margin-bottom: 10px; }
        .pps-modal-actions { display: flex; gap: 8px; margin-top: 20px; }
        .pps-modal-cancel {
          padding: 11px 18px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: background 0.15s;
        }
        .pps-modal-cancel:hover { background: #f5f3ef; }
        .pps-modal-save {
          flex: 1; padding: 11px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .pps-modal-save:hover:not(:disabled) { background: #0C3C60; }
        .pps-modal-save:disabled { opacity: 0.55; cursor: not-allowed; }

        /* Delete confirm modal */
        .pps-del-overlay {
          position: fixed; inset: 0; z-index: 1200;
          background: rgba(10,15,10,0.5); backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
        }
        .pps-del-modal {
          background: #fff; border-radius: 16px; padding: 28px;
          width: min(360px, 100%);
          box-shadow: 0 16px 60px rgba(0,0,0,0.18);
          font-family: 'Outfit', sans-serif; text-align: center;
        }
        .pps-del-title { font-size: 17px; font-weight: 600; color: #1a1a1a; margin-bottom: 8px; }
        .pps-del-sub   { font-size: 13px; color: #9a9590; margin-bottom: 22px; }
        .pps-del-actions { display: flex; gap: 8px; justify-content: center; }
        .pps-del-confirm {
          padding: 10px 20px; border-radius: 10px; border: none;
          background: #b91c1c; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .pps-del-confirm:hover:not(:disabled) { background: #991b1b; }
        .pps-del-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
        .pps-del-back {
          padding: 10px 20px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer;
        }

        /* Toast */
        .pps-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          background: #0C3C60; color: #fff; padding: 12px 22px; border-radius: 12px;
          font-size: 14px; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 2000; white-space: nowrap;
          animation: ppsToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
          display: flex; align-items: center; gap: 8px;
        }
        @keyframes ppsToastIn {
          from { opacity:0; transform: translateX(-50%) translateY(12px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="pps-wrap">
        {/* ── Header ── */}
        <div className="pps-header">
          <div className="pps-title">Price Sheet — {patientName}</div>
          <div className="pps-header-actions">
            {isManager && (
              <button
                className={`pps-vis-btn ${secretaryCanView ? "visible" : "hidden"}`}
                onClick={handleToggleVisibility}
                disabled={togglingVis}
                title={secretaryCanView ? "Click to hide from secretary" : "Click to allow secretary to view"}
              >
                {secretaryCanView
                  ? <><Eye size={13} strokeWidth={2} /> Secretary: Visible</>
                  : <><EyeOff size={13} strokeWidth={2} /> Secretary: Hidden</>
                }
              </button>
            )}
            <button className="pps-add-btn" onClick={openAdd}>
              <Plus size={13} strokeWidth={2.5} /> Add Entry
            </button>
          </div>
        </div>

        {/* ── Secretary-hidden notice (only shown to manager) ── */}
        {isManager && !secretaryCanView && (
          <div className="pps-sec-banner">
            <EyeOff size={15} strokeWidth={2} />
            Pricing is currently hidden from secretary accounts.
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="pps-summary">
          <div className="pps-card accent-blue">
            <div className="pps-card-label">Total Billed</div>
            <div className="pps-card-value">{fmt(totalAmount)}</div>
            <div className="pps-card-sub">{entries.length} entr{entries.length !== 1 ? "ies" : "y"}</div>
          </div>
          <div className="pps-card accent-green">
            <div className="pps-card-label">Total Paid</div>
            <div className="pps-card-value" style={{ color: "#1b4332" }}>{fmt(totalPaid)}</div>
            <div className="pps-card-sub">{entries.filter((e) => e.paid).length} paid</div>
          </div>
          <div className="pps-card accent-red">
            <div className="pps-card-label">Balance Due</div>
            <div className="pps-card-value" style={{ color: balance > 0 ? "#b91c1c" : "#1b4332" }}>
              {fmt(balance)}
            </div>
            <div className="pps-card-sub">{entries.filter((e) => !e.paid).length} unpaid</div>
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={{ height: 80, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "ppsShimmer 1.4s ease infinite", borderRadius: 14 }} />
        ) : entries.length === 0 ? (
          <div className="pps-empty">
            <div className="pps-empty-icon">
              <DollarSign size={36} strokeWidth={1.5} />
            </div>
            <div>No billing entries yet.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Entry" to record a session charge.</div>
          </div>
        ) : (
          <div className="pps-table-wrap">
            <table className="pps-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap", color: "#5a5550" }}>{entry.date}</td>
                    <td>
                      <div className="pps-desc">{entry.description}</div>
                      {entry.notes && <div className="pps-notes">{entry.notes}</div>}
                    </td>
                    <td>
                      <span className="pps-amount">{fmt(entry.amount)}</span>
                    </td>
                    <td>
                      <button
                        className={`pps-paid-badge ${entry.paid ? "paid" : "unpaid"}`}
                        onClick={() => handleTogglePaid(entry)}
                        title="Click to toggle payment status"
                      >
                        {entry.paid
                          ? <><Check size={10} strokeWidth={3} /> Paid</>
                          : <><X size={10} strokeWidth={3} /> Unpaid</>
                        }
                      </button>
                    </td>
                    <td style={{ color: "#9a9590", fontSize: 12 }}>
                      {entry.paidDate || "—"}
                    </td>
                    <td>
                      <div className="pps-action-row">
                        <button className="pps-edit-btn" onClick={() => openEdit(entry)}>Edit</button>
                        {isManager && (
                          <button
                            className="pps-del-btn"
                            onClick={() => setDeletingId(entry.id)}
                            disabled={deleting && deletingId === entry.id}
                          >
                            <Trash2 size={12} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 600, fontSize: 13, color: "#5a5550", borderTop: "2px solid #e5e0d8" }}>Total</td>
                  <td style={{ borderTop: "2px solid #e5e0d8" }}>
                    <span className="pps-amount">{fmt(totalAmount)}</span>
                  </td>
                  <td style={{ borderTop: "2px solid #e5e0d8" }}>
                    <span style={{ fontSize: 12, color: "#1b4332", fontWeight: 600 }}>
                      {fmt(totalPaid)} paid
                    </span>
                  </td>
                  <td style={{ borderTop: "2px solid #e5e0d8" }} />
                  <td style={{ borderTop: "2px solid #e5e0d8" }}>
                    <span style={{ fontSize: 12, color: balance > 0 ? "#b91c1c" : "#1b4332", fontWeight: 700 }}>
                      {balance > 0 ? `${fmt(balance)} due` : "✓ Settled"}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {showAdd && createPortal(
        <div className="pps-overlay" onClick={(e) => { if (e.target === e.currentTarget && !saving) setShowAdd(false); }}>
          <div className="pps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pps-modal-title">{editEntry ? "Edit Entry" : "Add Billing Entry"}</div>
            <div className="pps-modal-sub">{patientName}</div>

            <div className="pps-field-row">
              <div className="pps-field">
                <label className="pps-label">Date</label>
                <input
                  className="pps-input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="pps-field">
                <label className="pps-label">Amount</label>
                <input
                  className="pps-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>

            <div className="pps-field">
              <label className="pps-label">Description</label>
              <input
                className="pps-input"
                type="text"
                placeholder="e.g. Manual Therapy Session, Consultation..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="pps-field">
              <label className="pps-label">Notes (optional)</label>
              <input
                className="pps-input"
                type="text"
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div className="pps-field">
              <div className="pps-checkbox-row" onClick={() => setForm({ ...form, paid: !form.paid, paidDate: !form.paid ? (form.paidDate || new Date().toISOString().slice(0, 10)) : "" })}>
                <input
                  type="checkbox"
                  checked={form.paid}
                  readOnly
                />
                <label>Mark as Paid</label>
              </div>
            </div>

            {form.paid && (
              <div className="pps-field">
                <label className="pps-label">Paid On</label>
                <input
                  className="pps-input"
                  type="date"
                  value={form.paidDate}
                  onChange={(e) => setForm({ ...form, paidDate: e.target.value })}
                />
              </div>
            )}

            {saveError && <div className="pps-modal-error">{saveError}</div>}

            <div className="pps-modal-actions">
              <button className="pps-modal-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
              <button
                className="pps-modal-save"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? "Saving…" : editEntry ? "Save Changes" : "Add Entry"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete confirm ── */}
      {deletingId && createPortal(
        <div className="pps-del-overlay">
          <div className="pps-del-modal">
            <div className="pps-del-title">Delete Entry?</div>
            <div className="pps-del-sub">This billing entry will be permanently removed.</div>
            <div className="pps-del-actions">
              <button className="pps-del-back" onClick={() => setDeletingId(null)}>Cancel</button>
              <button
                className="pps-del-confirm"
                disabled={deleting}
                onClick={() => handleDelete(deletingId)}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Toast ── */}
      {toast && createPortal(
        <div className="pps-toast">
          <Check size={14} strokeWidth={2.5} />
          {toast}
        </div>,
        document.body
      )}

      <style>{`
        @keyframes ppsShimmer { to { background-position: -200% 0; } }
      `}</style>
    </>
  );
}
