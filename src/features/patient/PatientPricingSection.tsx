// FILE: src/features/patient/PatientPricingSection.tsx
// Visible only to clinic_manager and secretary (when enabled by manager).

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Check, X, Eye, EyeOff, Package, ClipboardList, MessageCircle } from "lucide-react";
import { phoneForLink } from "../../utils/phone";
import {
  subscribeToBillingSettings,
  saveBillingSettings,
  subscribeToSessionPrices,
  setSessionPrice,
  deleteSessionPrice,
  subscribeToPatientPackages,
  addSessionPackage,
  updateSessionPackage,
  deleteSessionPackage,
  type SessionPrice,
  type SessionPackage,
} from "../../services/priceService";
import {
  subscribeToPatientAllAppointments,
  fmtHour12,
  type Appointment,
} from "../../services/appointmentService";

// ─── Props ────────────────────────────────────────────────────────────────────

interface PatientPricingSectionProps {
  patientId:    string;
  isManager:    boolean;
  isSecretary:  boolean;
  patientName:  string;
  patientPhone?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PACKAGE_SIZES = [6, 12, 24];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatientPricingSection({
  patientId,
  isManager,
  isSecretary,
  patientName,
  patientPhone = "",
}: PatientPricingSectionProps) {

// ── Session prices ──────────────────────────────────────────────────────────
  const [sessionPrices, setSessionPrices] = useState<SessionPrice[]>([]);
  const [completedAppts, setCompletedAppts] = useState<Appointment[]>([]);
  const [apptLoading,    setApptLoading]    = useState(true);

  // ── Packages ────────────────────────────────────────────────────────────────
  const [packages,     setPackages]     = useState<SessionPackage[]>([]);
  const [pkgLoading,   setPkgLoading]   = useState(true);

  // ── Visibility ─────────────────────────────────────────────────────────────
  const [secretaryCanView, setSecretaryCanView] = useState(true);
  const [togglingVis,      setTogglingVis]      = useState(false);

  // ── Session price form ──────────────────────────────────────────────────────
  const [sessionPriceAppt,   setSessionPriceAppt]   = useState<Appointment | null>(null);
  const [sessionPriceForm,   setSessionPriceForm]   = useState({ amount: "", discountType: "none" as "none" | "pct" | "fixed", discountValue: "", paid: false, paidDate: "", packageId: "", notes: "", sessionType: "", physioName: "" });
  const [sessionPriceSaving, setSessionPriceSaving] = useState(false);
  const [sessionPriceError,  setSessionPriceError]  = useState<string | null>(null);
  const [deletingSpId,       setDeletingSpId]       = useState<string | null>(null);
  const [deletingSp,         setDeletingSp]         = useState(false);

  // ── Package form ────────────────────────────────────────────────────────────
  const EMPTY_PKG = { packageSize: 6, priceMode: "per" as "per" | "total", pricePerSession: "", totalPrice: "", discountType: "none" as "none" | "pct" | "fixed", discountValue: "", startDate: new Date().toISOString().slice(0, 10), paidAmount: "", notes: "", active: true, sessionsUsed: "0" };
  const [showPkgForm,   setShowPkgForm]   = useState(false);
  const [editPkg,       setEditPkg]       = useState<SessionPackage | null>(null);
  const [pkgForm,       setPkgForm]       = useState({ ...EMPTY_PKG, packageSize: 6 as number });
  const [customSizeMode, setCustomSizeMode] = useState(false);
  const [pkgSaving,     setPkgSaving]     = useState(false);
  const [pkgError,      setPkgError]      = useState<string | null>(null);
  const [deletingPkgId, setDeletingPkgId] = useState<string | null>(null);
  const [deletingPkg,   setDeletingPkg]   = useState(false);

  // ── WhatsApp reminder editor ─────────────────────────────────────────────────
  const [editingMsgPkgId, setEditingMsgPkgId] = useState<string | null>(null);
  const [editingMsg,      setEditingMsg]      = useState("");

  const defaultMsg = (name: string) =>
    `Hi ${name}, this is a reminder that you have 1 session remaining in your current package. Please contact us to renew and continue your treatment. Thank you! 🙏`;

  // ── Toast ────────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Subscriptions ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!patientId) return;
    return subscribeToSessionPrices(patientId, setSessionPrices);
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    setApptLoading(true);
    return subscribeToPatientAllAppointments(
      patientId,
      (appts) => {
        setCompletedAppts(appts.filter((a) => a.status === "completed"));
        setApptLoading(false);
      },
      () => setApptLoading(false)
    );
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    setPkgLoading(true);
    return subscribeToPatientPackages(patientId, (p) => { setPackages(p); setPkgLoading(false); }, () => setPkgLoading(false));
  }, [patientId]);

  useEffect(() => {
    return subscribeToBillingSettings((s) => setSecretaryCanView(s.secretaryCanView), () => {});
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activePackages  = packages.filter((p) => p.active);
  const sessionPriceMap = new Map(sessionPrices.map((sp) => [sp.appointmentId, sp]));
  const sessionTotal    = sessionPrices.reduce((s, sp) => s + sp.amount, 0);
  const sessionPaid     = sessionPrices.filter((sp) => sp.paid).reduce((s, sp) => s + sp.amount, 0);

  // ── Visibility toggle ────────────────────────────────────────────────────────
  const handleToggleVisibility = async () => {
    setTogglingVis(true);
    const next = !secretaryCanView;
    await saveBillingSettings({ secretaryCanView: next });
    setTogglingVis(false);
    showToast(next ? "Secretary can now view pricing" : "Pricing hidden from secretary");
  };

  // ── Session price CRUD ───────────────────────────────────────────────────────
  const openSessionPrice = (appt: Appointment) => {
    const existing = sessionPriceMap.get(appt.id);
    setSessionPriceForm({
      amount:        existing ? String(existing.amount) : "",
      discountType:  "none",
      discountValue: "",
      paid:          existing?.paid ?? false,
      paidDate:      existing?.paidDate ?? "",
      packageId:     existing?.packageId ?? "",
      notes:         existing?.notes ?? "",
      sessionType:   existing?.sessionType ?? appt.sessionType ?? "",
      physioName:    existing?.physioName  ?? appt.physioName  ?? "",
    });
    setSessionPriceAppt(appt);
    setSessionPriceError(null);
  };

  const handleSaveSessionPrice = async () => {
    if (!sessionPriceAppt) return;
    const baseAmount = parseFloat(sessionPriceForm.amount);
    if (isNaN(baseAmount) || baseAmount < 0) { setSessionPriceError("Please enter a valid amount."); return; }
    const finalAmount = spFinalAmount();
    const discountNote = sessionPriceForm.discountType !== "none"
      ? ` [Discount: ${sessionPriceForm.discountType === "pct" ? sessionPriceForm.discountValue + "%" : fmt(parseFloat(sessionPriceForm.discountValue) || 0) + " off"}]`
      : "";
    setSessionPriceSaving(true); setSessionPriceError(null);
    const result = await setSessionPrice({
      patientId,
      appointmentId: sessionPriceAppt.id,
      date:        sessionPriceAppt.date,
      sessionType: sessionPriceForm.sessionType || sessionPriceAppt.sessionType,
      physioName:  sessionPriceForm.physioName  || sessionPriceAppt.physioName,
      amount:      finalAmount,
      paid:        sessionPriceForm.paid,
      paidDate:    sessionPriceForm.paid ? (sessionPriceForm.paidDate || sessionPriceAppt.date) : "",
      packageId:   sessionPriceForm.packageId,
      notes:       (sessionPriceForm.notes.trim() + discountNote).trim(),
    });
    setSessionPriceSaving(false);
    if ("error" in result && result.error) { setSessionPriceError(result.error); return; }
    // If linked to a package, increment sessionsUsed
    if (sessionPriceForm.packageId) {
      const pkg = packages.find((p) => p.id === sessionPriceForm.packageId);
      if (pkg) {
        const existing = sessionPriceMap.get(sessionPriceAppt.id);
        if (!existing?.packageId || existing.packageId !== sessionPriceForm.packageId) {
          await updateSessionPackage(pkg.id, { sessionsUsed: pkg.sessionsUsed + 1 });
        }
      }
    }
    showToast("Session price saved");
    setSessionPriceAppt(null);
  };

  const handleDeleteSessionPrice = async (id: string) => {
    setDeletingSp(true);
    await deleteSessionPrice(id);
    setDeletingSp(false); setDeletingSpId(null);
    showToast("Session price removed");
  };

  // ── Package CRUD ─────────────────────────────────────────────────────────────
  // ── Package price helpers ────────────────────────────────────────────────────
  const calcDiscount = (base: number, type: "none" | "pct" | "fixed", val: string): number => {
    if (type === "pct")   return base * (parseFloat(val) / 100);
    if (type === "fixed") return parseFloat(val) || 0;
    return 0;
  };
  const pkgBaseTotal = (): number => {
    if (pkgForm.priceMode === "total") return parseFloat(pkgForm.totalPrice) || 0;
    return (parseFloat(pkgForm.pricePerSession) || 0) * pkgForm.packageSize;
  };
  const pkgDiscount = (): number => calcDiscount(pkgBaseTotal(), pkgForm.discountType, pkgForm.discountValue);
  const pkgFinalTotal = (): number => Math.max(0, pkgBaseTotal() - pkgDiscount());
  const pkgPPS = (): number => pkgForm.packageSize > 0 ? pkgFinalTotal() / pkgForm.packageSize : 0;

  const spBaseAmount = (): number => parseFloat(sessionPriceForm.amount) || 0;
  const spDiscount = (): number => calcDiscount(spBaseAmount(), sessionPriceForm.discountType, sessionPriceForm.discountValue);
  const spFinalAmount = (): number => Math.max(0, spBaseAmount() - spDiscount());

  const openAddPkg = () => {
    setPkgForm({ ...EMPTY_PKG, packageSize: 6 });
    setCustomSizeMode(false);
    setEditPkg(null); setPkgError(null); setShowPkgForm(true);
  };

  const openEditPkg = (pkg: SessionPackage) => {
    setPkgForm({ packageSize: pkg.packageSize, priceMode: "per", pricePerSession: String(pkg.pricePerSession), totalPrice: String(pkg.totalAmount), discountType: "none", discountValue: "", startDate: pkg.startDate, paidAmount: String(pkg.paidAmount), notes: pkg.notes, active: pkg.active, sessionsUsed: String(pkg.sessionsUsed) });
    setEditPkg(pkg); setPkgError(null); setShowPkgForm(true);
  };

  const handleSavePkg = async () => {
    const finalTotal = pkgFinalTotal();
    const pps        = pkgPPS();
    const paid = parseFloat(String(pkgForm.paidAmount) || "0");
    if (finalTotal <= 0) { setPkgError("Please enter a valid price."); return; }
    setPkgSaving(true); setPkgError(null);
    const totalAmount = finalTotal;
    const payload = {
      patientId,
      packageSize:     pkgForm.packageSize,
      pricePerSession: pps,
      totalAmount,
      paidAmount:      isNaN(paid) ? 0 : paid,
      startDate:       pkgForm.startDate,
      sessionsUsed:    editPkg ? (parseInt(pkgForm.sessionsUsed, 10) || 0) : 0,
      active:          pkgForm.active,
      notes:           `${pkgForm.notes.trim()}${pkgForm.discountType !== "none" ? ` [Discount: ${pkgForm.discountType === "pct" ? pkgForm.discountValue + "%" : fmt(parseFloat(pkgForm.discountValue) || 0) + " off"}]` : ""}`.trim(),
    };
    if (editPkg) {
      const { error } = await updateSessionPackage(editPkg.id, payload);
      if (error) { setPkgError(error); setPkgSaving(false); return; }
      showToast("Package updated");
    } else {
      const result = await addSessionPackage(payload);
      if ("error" in result && result.error) { setPkgError(result.error); setPkgSaving(false); return; }
      showToast("Package added");
    }
    setPkgSaving(false); setShowPkgForm(false); setEditPkg(null);
  };

  const handleDeletePkg = async (id: string) => {
    setDeletingPkg(true);
    await deleteSessionPackage(id);
    setDeletingPkg(false); setDeletingPkgId(null);
    showToast("Package deleted");
  };

  return (
    <>
      <style>{`
        .pps-wrap { font-family: 'Outfit', sans-serif; }

        .pps-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
        .pps-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 500; color: #1a1a1a; }
        .pps-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        .pps-vis-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; border: 1.5px solid; white-space: nowrap;
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

        /* Inner tabs */
        .pps-section { margin-bottom: 32px; }
        .pps-section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #f0ede8; flex-wrap: wrap; }
        .pps-section-title { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700; color: #1a1a1a; font-family: 'Outfit', sans-serif; }
        .pps-section-meta { font-size: 12px; color: #9a9590; }
        .pps-section-empty { display: flex; align-items: center; gap: 8px; padding: 18px 16px; background: #fafaf8; border-radius: 12px; border: 1.5px dashed #e5e0d8; font-size: 13px; color: #c0bbb4; }
        .pps-inner-tabs { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
        .pps-inner-tab {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 100px; border: 1.5px solid #e5e0d8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; background: #fff; color: #5a5550;
        }
        .pps-inner-tab:hover { border-color: #2E8BC0; color: #2E8BC0; }
        .pps-inner-tab.active { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }

        /* Summary cards */
        .pps-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        @media (max-width: 540px) { .pps-summary { grid-template-columns: 1fr; } }
        .pps-card { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px; padding: 14px 16px; }
        .pps-card.accent-blue  { border-top: 3px solid #2E8BC0; }
        .pps-card.accent-green { border-top: 3px solid #52b788; }
        .pps-card.accent-red   { border-top: 3px solid #e07a5f; }
        .pps-card.accent-purple{ border-top: 3px solid #7c3aed; }
        .pps-card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 700; margin-bottom: 4px; }
        .pps-card-value { font-family: 'Playfair Display', serif; font-size: 24px; color: #1a1a1a; }
        .pps-card-sub   { font-size: 11px; color: #9a9590; margin-top: 2px; }

        /* Table */
        .pps-table-wrap { overflow-x: auto; border-radius: 14px; border: 1.5px solid #e5e0d8; }
        .pps-table { width: 100%; border-collapse: collapse; font-family: 'Outfit', sans-serif; }
        .pps-table th { background: #f5f3ef; padding: 11px 14px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; border-bottom: 1.5px solid #e5e0d8; white-space: nowrap; text-align: left; }
        .pps-table td { padding: 12px 14px; border-bottom: 1px solid #f0ede8; font-size: 13.5px; color: #1a1a1a; vertical-align: middle; }
        .pps-table tr:last-child td { border-bottom: none; }
        .pps-table tr:hover td { background: #fafaf8; }
        .pps-table tfoot td { border-top: 2px solid #e5e0d8; }

        .pps-desc   { font-weight: 500; }
        .pps-notes  { font-size: 12px; color: #9a9590; margin-top: 2px; }
        .pps-amount { font-weight: 600; font-family: 'Playfair Display', serif; font-size: 15px; white-space: nowrap; }

        .pps-paid-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px;
          white-space: nowrap; cursor: pointer; transition: all 0.15s; border: 1.5px solid;
        }
        .pps-paid-badge.paid   { background: #f0fdf4; color: #1b4332; border-color: #b7e4c7; }
        .pps-paid-badge.paid:hover { background: #d8f3dc; }
        .pps-paid-badge.unpaid { background: #fff5f5; color: #991b1b; border-color: #fca5a5; }
        .pps-paid-badge.unpaid:hover { background: #fee2e2; }
        .pps-no-price { font-size: 12px; color: #c0bbb4; font-style: italic; }

        .pps-action-row { display: flex; align-items: center; gap: 5px; }
        .pps-edit-btn, .pps-del-btn, .pps-set-price-btn {
          display: inline-flex; align-items: center; gap: 4px;
          height: 28px; padding: 0 10px; border-radius: 7px;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; border: 1.5px solid; white-space: nowrap;
        }
        .pps-set-price-btn { border-color: #B3DEF0; background: #EAF5FC; color: #2E8BC0; }
        .pps-set-price-btn:hover { background: #D6EEF8; }
        .pps-edit-btn { border-color: #B3DEF0; background: #EAF5FC; color: #2E8BC0; }
        .pps-edit-btn:hover { background: #D6EEF8; }
        .pps-del-btn  { border-color: #e5e0d8; background: #fafaf8; color: #c0bbb4; }
        .pps-del-btn:hover:not(:disabled) { border-color: #fca5a5; color: #b91c1c; background: #fff5f5; }
        .pps-del-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .pps-pkg-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 100px; background: #ede9fe; color: #4c1d95; white-space: nowrap; }

        .pps-empty { text-align: center; padding: 48px 20px; color: #c0bbb4; font-size: 14px; }
        .pps-empty-icon { margin: 0 auto 12px; opacity: 0.4; }

        .pps-sec-banner { background: #fff8f0; border: 1.5px solid #fcd34d; border-radius: 12px; padding: 12px 16px; font-size: 13px; color: #92400e; display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }

        /* Package cards */
        .pps-pkg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .pps-pkg-card { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 16px; padding: 18px; }
        .pps-pkg-card.active-pkg  { border-color: #2E8BC0; border-top: 3px solid #2E8BC0; }
        .pps-pkg-card.inactive-pkg { opacity: 0.7; }
        .pps-pkg-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .pps-pkg-size { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 500; color: #1a1a1a; }
        .pps-pkg-size span { font-size: 13px; font-family: 'Outfit', sans-serif; color: #9a9590; font-weight: 400; }
        .pps-pkg-active-badge { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 100px; background: #D6EEF8; color: #0C3C60; }
        .pps-pkg-inactive-badge { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 100px; background: #f5f3ef; color: #9a9590; }
        .pps-pkg-progress-wrap { margin-bottom: 12px; }
        .pps-pkg-progress-label { display: flex; justify-content: space-between; font-size: 12px; color: #5a5550; margin-bottom: 5px; }
        .pps-pkg-progress-track { height: 7px; border-radius: 7px; background: #f0ede8; overflow: hidden; }
        .pps-pkg-progress-fill { height: 100%; border-radius: 7px; background: linear-gradient(90deg, #2E8BC0, #5BC0BE); transition: width 0.5s cubic-bezier(0.34,1.2,0.64,1); }
        .pps-pkg-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .pps-pkg-stat { background: #f5f3ef; border-radius: 8px; padding: 8px 10px; }
        .pps-pkg-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #c0bbb4; font-weight: 700; margin-bottom: 2px; }
        .pps-pkg-stat-value { font-family: 'Playfair Display', serif; font-size: 16px; color: #1a1a1a; }
        .pps-pkg-notes { font-size: 12px; color: #9a9590; margin-bottom: 12px; }
        .pps-wa-reminder {
          background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 8px;
          padding: 10px 12px; margin-bottom: 10px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .pps-wa-reminder-top {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .pps-wa-reminder-text { font-size: 11.5px; font-weight: 600; color: #b91c1c; }
        .pps-wa-edit-btn {
          font-size: 11px; font-weight: 500; color: #2E8BC0;
          background: none; border: none; cursor: pointer; padding: 0;
          text-decoration: underline; text-underline-offset: 2px; white-space: nowrap;
        }
        .pps-wa-msg-editor {
          width: 100%; border: 1.5px solid #fecaca; border-radius: 6px;
          padding: 8px 10px; font-family: 'Outfit', sans-serif; font-size: 12.5px;
          color: #1a1a1a; background: #fff; resize: vertical; line-height: 1.5;
          outline: none;
        }
        .pps-wa-msg-editor:focus { border-color: #f87171; }
        .pps-wa-remind-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 14px; border-radius: 6px;
          background: #25D366; border: none;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 700;
          color: #fff; cursor: pointer; text-decoration: none; white-space: nowrap;
          transition: background 0.15s; align-self: flex-start;
        }
        .pps-wa-remind-btn:hover { background: #128C7E; }
        .pps-wa-no-phone { font-size: 11px; color: #c0bbb4; }
        .pps-pkg-actions { display: flex; gap: 6px; }
        .pps-pkg-use-btn {
          flex: 1; padding: 7px 10px; border-radius: 8px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: background 0.15s; text-align: center;
        }
        .pps-pkg-use-btn:hover:not(:disabled) { background: #0C3C60; }
        .pps-pkg-use-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Overlay / Modal */
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
        @keyframes ppsModalIn { from { opacity:0; transform: scale(0.95) translateY(10px); } to { opacity:1; transform: scale(1) translateY(0); } }
        .pps-modal-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 500; color: #1a1a1a; margin-bottom: 4px; }
        .pps-modal-sub   { font-size: 13px; color: #9a9590; margin-bottom: 22px; }
        .pps-field { margin-bottom: 14px; }
        .pps-label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #5a5550; margin-bottom: 6px; }
        .pps-input { width: 100%; padding: 10px 13px; border-radius: 10px; box-sizing: border-box; border: 1.5px solid #e5e0d8; background: #fafaf8; font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a; outline: none; transition: border-color 0.15s; min-height: 42px; }
        .pps-input:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.1); }
        .pps-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 480px) { .pps-field-row { grid-template-columns: 1fr; } }
        .pps-checkbox-row { display: flex; align-items: center; gap: 10px; padding: 10px 13px; background: #fafaf8; border: 1.5px solid #e5e0d8; border-radius: 10px; cursor: pointer; transition: border-color 0.15s; }
        .pps-checkbox-row:hover { border-color: #2E8BC0; }
        .pps-checkbox-row input { width: 16px; height: 16px; cursor: pointer; accent-color: #2E8BC0; }
        .pps-checkbox-row label { font-size: 14px; color: #1a1a1a; cursor: pointer; }
        .pps-pkg-size-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .pps-pkg-custom-input { width: 100%; padding: 6px 8px; border: 1.5px solid #2E8BC0; border-radius: 8px; font-size: 15px; font-weight: 700; color: #2E8BC0; text-align: center; outline: none; font-family: inherit; background: #EAF5FC; }
        .pps-pkg-size-opt { padding: 10px; border-radius: 10px; border: 1.5px solid #e5e0d8; text-align: center; cursor: pointer; transition: all 0.15s; font-family: 'Outfit', sans-serif; }
        .pps-pkg-size-opt:hover { border-color: #2E8BC0; color: #2E8BC0; }
        .pps-pkg-size-opt.selected { border-color: #2E8BC0; background: #EAF5FC; color: #2E8BC0; font-weight: 700; }
        .pps-pkg-size-opt-label { font-size: 18px; font-weight: 700; font-family: 'Playfair Display', serif; }
        .pps-pkg-size-opt-sub { font-size: 11px; color: #9a9590; }
        .pps-pkg-size-opt.selected .pps-pkg-size-opt-sub { color: #2E8BC0; }

        /* Price mode toggle */
        .pps-mode-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 0; }
        .pps-mode-opt {
          padding: 9px 12px; border-radius: 10px; border: 1.5px solid #e5e0d8;
          text-align: center; cursor: pointer; transition: all 0.15s;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500; color: #5a5550;
        }
        .pps-mode-opt:hover { border-color: #2E8BC0; color: #2E8BC0; }
        .pps-mode-opt.selected { border-color: #2E8BC0; background: #EAF5FC; color: #2E8BC0; font-weight: 700; }

        /* Discount row */
        .pps-discount-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .pps-discount-type {
          width: 100%; padding: 10px 13px; border-radius: 10px; box-sizing: border-box;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          outline: none; appearance: none; cursor: pointer; min-height: 42px;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px;
          transition: border-color 0.15s;
        }
        .pps-discount-type:focus { border-color: #2E8BC0; }
        .pps-final-row {
          display: flex; align-items: center; justify-content: space-between;
          background: #f0fdf4; border: 1.5px solid #b7e4c7; border-radius: 10px;
          padding: 10px 14px; margin-top: 2px;
        }
        .pps-final-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #1b4332; }
        .pps-final-value { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 600; color: #1b4332; }
        .pps-final-sub   { font-size: 11px; color: #52b788; text-align: right; }

        .pps-modal-error { font-size: 13px; color: #b91c1c; margin-bottom: 10px; }
        .pps-modal-actions { display: flex; gap: 8px; margin-top: 20px; }
        .pps-modal-cancel { padding: 11px 18px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500; color: #5a5550; cursor: pointer; }
        .pps-modal-cancel:hover { background: #f5f3ef; }
        .pps-modal-save { flex: 1; padding: 11px; border-radius: 10px; border: none; background: #2E8BC0; color: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
        .pps-modal-save:hover:not(:disabled) { background: #0C3C60; }
        .pps-modal-save:disabled { opacity: 0.55; cursor: not-allowed; }

        /* Delete confirm */
        .pps-del-overlay { position: fixed; inset: 0; z-index: 1200; background: rgba(10,15,10,0.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 24px; }
        .pps-del-modal { background: #fff; border-radius: 16px; padding: 28px; width: min(360px, 100%); box-shadow: 0 16px 60px rgba(0,0,0,0.18); font-family: 'Outfit', sans-serif; text-align: center; }
        .pps-del-title { font-size: 17px; font-weight: 600; color: #1a1a1a; margin-bottom: 8px; }
        .pps-del-sub   { font-size: 13px; color: #9a9590; margin-bottom: 22px; }
        .pps-del-actions { display: flex; gap: 8px; justify-content: center; }
        .pps-del-confirm { padding: 10px 20px; border-radius: 10px; border: none; background: #b91c1c; color: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
        .pps-del-confirm:hover:not(:disabled) { background: #991b1b; }
        .pps-del-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
        .pps-del-back { padding: 10px 20px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500; color: #5a5550; cursor: pointer; }

        /* Toast */
        .pps-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); background: #0C3C60; color: #fff; padding: 12px 22px; border-radius: 12px; font-size: 14px; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 2000; white-space: nowrap; animation: ppsToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both; display: flex; align-items: center; gap: 8px; }
        @keyframes ppsToastIn { from { opacity:0; transform: translateX(-50%) translateY(12px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        @keyframes ppsShimmer { to { background-position: -200% 0; } }
      `}</style>

      <div className="pps-wrap">
        {/* Header */}
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
          </div>
        </div>

        {/* Secretary-hidden notice */}
        {isManager && !secretaryCanView && (
          <div className="pps-sec-banner">
            <EyeOff size={15} strokeWidth={2} />
            Pricing is currently hidden from secretary accounts.
          </div>
        )}

        {/* ── UNIFIED PRICING VIEW ── */}

        {/* ── PACKAGES SECTION ── */}
        <div className="pps-section">
          <div className="pps-section-header">
            <div className="pps-section-title"><Package size={15} strokeWidth={2} /> Packages</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="pps-section-meta">{activePackages.length} active · {activePackages.reduce((s, p) => s + (p.packageSize - p.sessionsUsed), 0)} sessions remaining</span>
              <button className="pps-add-btn" onClick={openAddPkg}><Plus size={13} strokeWidth={2.5} /> Add Package</button>
            </div>
          </div>
          {pkgLoading ? (
            <div style={{ height: 80, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "ppsShimmer 1.4s ease infinite", borderRadius: 14 }} />
          ) : packages.length === 0 ? (
            <div className="pps-section-empty"><Package size={22} strokeWidth={1.5} /> No packages yet</div>
          ) : (
            <div className="pps-pkg-grid">
              {packages.map((pkg) => {
                const pct = Math.min(100, (pkg.sessionsUsed / pkg.packageSize) * 100);
                const remaining = pkg.packageSize - pkg.sessionsUsed;
                const balanceDue = pkg.totalAmount - pkg.paidAmount;
                return (
                  <div key={pkg.id} className={`pps-pkg-card ${pkg.active ? "active-pkg" : "inactive-pkg"}`}>
                    <div className="pps-pkg-card-header">
                      <div className="pps-pkg-size">{pkg.packageSize} <span>sessions</span></div>
                      {pkg.active ? <span className="pps-pkg-active-badge">Active</span> : <span className="pps-pkg-inactive-badge">Completed</span>}
                    </div>
                    <div className="pps-pkg-progress-wrap">
                      <div className="pps-pkg-progress-label"><span>{pkg.sessionsUsed} used</span><span style={{ color: remaining === 1 ? "#b91c1c" : undefined, fontWeight: remaining === 1 ? 700 : undefined }}>{remaining} left</span></div>
                      <div className="pps-pkg-progress-track"><div className="pps-pkg-progress-fill" style={{ width: `${pct}%`, background: remaining === 1 ? "#f87171" : undefined }} /></div>
                    </div>
                    {remaining === 1 && pkg.active && (() => {
                      const ph = phoneForLink(patientPhone);
                      const isEditing = editingMsgPkgId === pkg.id;
                      const currentMsg = isEditing ? editingMsg : defaultMsg(patientName);
                      return (
                        <div className="pps-wa-reminder">
                          <div className="pps-wa-reminder-top">
                            <span className="pps-wa-reminder-text">⚠️ Last session remaining</span>
                            {ph ? (
                              <button
                                className="pps-wa-edit-btn"
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingMsgPkgId(null);
                                  } else {
                                    setEditingMsgPkgId(pkg.id);
                                    setEditingMsg(defaultMsg(patientName));
                                  }
                                }}
                              >
                                {isEditing ? "Cancel" : "Edit message"}
                              </button>
                            ) : null}
                          </div>
                          {ph ? (
                            <>
                              {isEditing && (
                                <textarea
                                  className="pps-wa-msg-editor"
                                  value={editingMsg}
                                  onChange={(e) => setEditingMsg(e.target.value)}
                                  rows={4}
                                />
                              )}
                              <a
                                className="pps-wa-remind-btn"
                                href={`https://wa.me/${ph}?text=${encodeURIComponent(currentMsg)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <MessageCircle size={12} strokeWidth={2.5} /> Send on WhatsApp
                              </a>
                            </>
                          ) : (
                            <span className="pps-wa-no-phone">No phone on file — add it in the patient profile to enable this.</span>
                          )}
                        </div>
                      );
                    })()}
                    <div className="pps-pkg-stats">
                      <div className="pps-pkg-stat"><div className="pps-pkg-stat-label">Per Session</div><div className="pps-pkg-stat-value">{fmt(pkg.pricePerSession)}</div></div>
                      <div className="pps-pkg-stat"><div className="pps-pkg-stat-label">Total</div><div className="pps-pkg-stat-value">{fmt(pkg.totalAmount)}</div></div>
                      <div className="pps-pkg-stat"><div className="pps-pkg-stat-label">Paid</div><div className="pps-pkg-stat-value" style={{ color: "#1b4332" }}>{fmt(pkg.paidAmount)}</div></div>
                      <div className="pps-pkg-stat"><div className="pps-pkg-stat-label">Balance</div><div className="pps-pkg-stat-value" style={{ color: balanceDue > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(balanceDue)}</div></div>
                    </div>
                    {pkg.notes && <div className="pps-pkg-notes">{pkg.notes}</div>}
                    <div style={{ fontSize: 11, color: "#c0bbb4", marginBottom: 10 }}>Started {pkg.startDate}</div>
                    <div className="pps-pkg-actions">
                      <button className="pps-edit-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => openEditPkg(pkg)}>Edit</button>
                      {(isManager || isSecretary) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f5f3ef", borderRadius: 8, padding: "3px 6px" }}>
                          <button style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: pkg.sessionsUsed > 0 ? "#e8e3dc" : "#f0ede8", color: pkg.sessionsUsed > 0 ? "#1a1a1a" : "#c0bbb4", fontSize: 16, cursor: pkg.sessionsUsed > 0 ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 700 }}
                            disabled={pkg.sessionsUsed === 0}
                            onClick={async () => { const n = Math.max(0, pkg.sessionsUsed - 1); await updateSessionPackage(pkg.id, { sessionsUsed: n, active: true }); showToast(`Sessions used: ${n}/${pkg.packageSize}`); }}>−</button>
                          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: "center", color: "#1a1a1a" }}>{pkg.sessionsUsed}/{pkg.packageSize}</span>
                          <button style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: remaining > 0 ? "#1a3a2a" : "#f0ede8", color: remaining > 0 ? "#fff" : "#c0bbb4", fontSize: 16, cursor: remaining > 0 ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 700 }}
                            disabled={remaining === 0}
                            onClick={async () => { const n = Math.min(pkg.packageSize, pkg.sessionsUsed + 1); await updateSessionPackage(pkg.id, { sessionsUsed: n, active: n < pkg.packageSize }); showToast(n < pkg.packageSize ? `Sessions used: ${n}/${pkg.packageSize}` : `Package complete — all ${pkg.packageSize} sessions used`); }}>+</button>
                        </div>
                      )}
                      {(isManager || isSecretary) && (
                        <button className="pps-del-btn" onClick={() => setDeletingPkgId(pkg.id)} disabled={deletingPkg && deletingPkgId === pkg.id}><Trash2 size={12} strokeWidth={2} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── SESSION PRICING SECTION ── */}
        <div className="pps-section">
          <div className="pps-section-header">
            <div className="pps-section-title"><ClipboardList size={15} strokeWidth={2} /> Session Charges</div>
            <span className="pps-section-meta">{completedAppts.length} sessions · {fmt(sessionTotal)} billed · {fmt(sessionPaid)} paid</span>
          </div>
          {apptLoading ? (
            <div style={{ height: 80, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "ppsShimmer 1.4s ease infinite", borderRadius: 14 }} />
          ) : completedAppts.length === 0 ? (
            <div className="pps-section-empty"><ClipboardList size={22} strokeWidth={1.5} /> No completed sessions yet</div>
          ) : (
            <div className="pps-table-wrap">
              <table className="pps-table">
                <thead>
                  <tr><th>Date</th><th>Session Type</th><th>Physiotherapist</th><th>Price</th><th>Status</th><th>Package</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {completedAppts.map((appt) => {
                    const sp = sessionPriceMap.get(appt.id);
                    const pkg = sp?.packageId ? packages.find((p) => p.id === sp.packageId) : null;
                    return (
                      <tr key={appt.id}>
                        <td style={{ whiteSpace: "nowrap", color: "#5a5550" }}>{appt.date}</td>
                        <td><div className="pps-desc">{appt.sessionType || "—"}</div></td>
                        <td style={{ color: "#5a5550", fontSize: 13 }}>{appt.physioName || "—"}</td>
                        <td>
                          {sp ? <span className="pps-amount">{fmt(sp.amount)}</span> : <span className="pps-no-price">Not set</span>}
                          {sp?.notes && <div className="pps-notes">{sp.notes}</div>}
                        </td>
                        <td>
                          {sp ? (
                            <button className={`pps-paid-badge ${sp.paid ? "paid" : "unpaid"}`} onClick={async () => {
                              const paid = !sp.paid;
                              const paidDate = paid ? (sp.paidDate || new Date().toISOString().slice(0, 10)) : "";
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              const { id: _id, createdAt: _ca, ...spRest } = sp;
                              await setSessionPrice({ ...spRest, paid, paidDate });
                              showToast(paid ? "Marked as paid" : "Marked as unpaid");
                            }}>
                              {sp.paid ? <><Check size={10} strokeWidth={3} /> Paid</> : <><X size={10} strokeWidth={3} /> Unpaid</>}
                            </button>
                          ) : <span style={{ color: "#c0bbb4", fontSize: 12 }}>—</span>}
                        </td>
                        <td>{pkg ? <span className="pps-pkg-badge">{pkg.packageSize}-session pkg</span> : <span style={{ color: "#c0bbb4", fontSize: 12 }}>—</span>}</td>
                        <td>
                          <div className="pps-action-row">
                            <button className="pps-set-price-btn" onClick={() => openSessionPrice(appt)}>{sp ? "Edit" : "Set Price"}</button>
                            {sp && (isManager || isSecretary) && (
                              <button className="pps-del-btn" onClick={() => setDeletingSpId(sp.id)} disabled={deletingSp && deletingSpId === sp.id}><Trash2 size={12} strokeWidth={2} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 600, fontSize: 13, color: "#5a5550" }}>Total</td>
                    <td><span className="pps-amount">{fmt(sessionTotal)}</span></td>
                    <td><span style={{ fontSize: 12, color: "#1b4332", fontWeight: 600 }}>{fmt(sessionPaid)} paid</span></td>
                    <td /><td><span style={{ fontSize: 12, color: sessionTotal - sessionPaid > 0 ? "#b91c1c" : "#1b4332", fontWeight: 700 }}>{sessionTotal - sessionPaid > 0 ? `${fmt(sessionTotal - sessionPaid)} due` : "✓ Settled"}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Session Price Modal ── */}
      {sessionPriceAppt && createPortal(
        <div className="pps-overlay" onClick={(e) => { if (e.target === e.currentTarget && !sessionPriceSaving) setSessionPriceAppt(null); }}>
          <div className="pps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pps-modal-title">Session Price</div>
            <div className="pps-modal-sub">{sessionPriceAppt.date} · {fmtHour12(sessionPriceAppt.hour)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div className="pps-field" style={{ marginBottom: 0 }}>
                <label className="pps-label">Session Type</label>
                <input className="pps-input" type="text" placeholder="e.g. Physiotherapy" value={sessionPriceForm.sessionType} onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, sessionType: e.target.value })} />
              </div>
              <div className="pps-field" style={{ marginBottom: 0 }}>
                <label className="pps-label">Physiotherapist</label>
                <input className="pps-input" type="text" placeholder="Name" value={sessionPriceForm.physioName} onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, physioName: e.target.value })} />
              </div>
            </div>
            <div className="pps-field">
              <label className="pps-label">Amount Charged</label>
              <input className="pps-input" type="number" min="0" step="0.01" placeholder="0.00" value={sessionPriceForm.amount} onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, amount: e.target.value })} />
            </div>
            {activePackages.length > 0 && (
              <div className="pps-field">
                <label className="pps-label">Link to Package (optional)</label>
                <select className="pps-input" style={{ cursor: "pointer", appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 36 }}
                  value={sessionPriceForm.packageId} onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, packageId: e.target.value })}>
                  <option value="">— No package —</option>
                  {activePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.packageSize}-session package · {p.packageSize - p.sessionsUsed} remaining
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="pps-field">
              <label className="pps-label">Discount</label>
              <div className="pps-discount-row">
                <select className="pps-discount-type" value={sessionPriceForm.discountType} onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, discountType: e.target.value as "none"|"pct"|"fixed", discountValue: "" })}>
                  <option value="none">No Discount</option>
                  <option value="pct">Percentage (%)</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                {sessionPriceForm.discountType !== "none" && (
                  <input className="pps-input" type="number" min="0" step="0.01"
                    placeholder={sessionPriceForm.discountType === "pct" ? "e.g. 10" : "e.g. 50.00"}
                    value={sessionPriceForm.discountValue}
                    onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, discountValue: e.target.value })} />
                )}
              </div>
            </div>
            {(spBaseAmount() > 0 || sessionPriceForm.discountType !== "none") && (
              <div className="pps-final-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="pps-final-label">Final Amount</div>
                  {sessionPriceForm.discountType !== "none" && spDiscount() > 0 && (
                    <div className="pps-final-sub">− {fmt(spDiscount())} discount</div>
                  )}
                </div>
                <div className="pps-final-value">{fmt(spFinalAmount())}</div>
              </div>
            )}
            <div className="pps-field">
              <label className="pps-label">Notes (optional)</label>
              <input className="pps-input" type="text" placeholder="e.g. Package session 3 of 12..." value={sessionPriceForm.notes} onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, notes: e.target.value })} />
            </div>
            <div className="pps-field">
              <div className="pps-checkbox-row" onClick={() => setSessionPriceForm({ ...sessionPriceForm, paid: !sessionPriceForm.paid, paidDate: !sessionPriceForm.paid ? (sessionPriceForm.paidDate || new Date().toISOString().slice(0, 10)) : "" })}>
                <input type="checkbox" checked={sessionPriceForm.paid} readOnly />
                <label>Mark as Paid</label>
              </div>
            </div>
            {sessionPriceForm.paid && (
              <div className="pps-field">
                <label className="pps-label">Paid On</label>
                <input className="pps-input" type="date" value={sessionPriceForm.paidDate} onChange={(e) => setSessionPriceForm({ ...sessionPriceForm, paidDate: e.target.value })} />
              </div>
            )}
            {sessionPriceError && <div className="pps-modal-error">{sessionPriceError}</div>}
            <div className="pps-modal-actions">
              <button className="pps-modal-cancel" onClick={() => setSessionPriceAppt(null)}>Cancel</button>
              <button className="pps-modal-save" disabled={sessionPriceSaving} onClick={handleSaveSessionPrice}>{sessionPriceSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Package Add/Edit Modal ── */}
      {showPkgForm && createPortal(
        <div className="pps-overlay" onClick={(e) => { if (e.target === e.currentTarget && !pkgSaving) setShowPkgForm(false); }}>
          <div className="pps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pps-modal-title">{editPkg ? "Edit Package" : "Add Session Package"}</div>
            <div className="pps-modal-sub">{patientName}</div>
            {!editPkg && (
              <div className="pps-field">
                <label className="pps-label">Package Size</label>
                <div className="pps-pkg-size-grid">
                  {PACKAGE_SIZES.map((size) => (
                    <div
                      key={size}
                      className={`pps-pkg-size-opt ${!customSizeMode && pkgForm.packageSize === size ? "selected" : ""}`}
                      onClick={() => { setCustomSizeMode(false); setPkgForm({ ...pkgForm, packageSize: size }); }}
                    >
                      <div className="pps-pkg-size-opt-label">{size}</div>
                      <div className="pps-pkg-size-opt-sub">sessions</div>
                    </div>
                  ))}
                  <div
                    className={`pps-pkg-size-opt ${customSizeMode ? "selected" : ""}`}
                    onClick={() => { setCustomSizeMode(true); setPkgForm({ ...pkgForm, packageSize: customSizeMode ? pkgForm.packageSize : 0 }); }}
                  >
                    {customSizeMode ? (
                      <input
                        className="pps-pkg-custom-input"
                        type="number" min="1" step="1"
                        placeholder="?"
                        value={pkgForm.packageSize || ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setPkgForm({ ...pkgForm, packageSize: Math.max(1, parseInt(e.target.value, 10) || 0) })}
                        autoFocus
                      />
                    ) : (
                      <>
                        <div className="pps-pkg-size-opt-label" style={{ fontSize: 15 }}>Custom</div>
                        <div className="pps-pkg-size-opt-sub">sessions</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Price entry mode */}
            <div className="pps-field">
              <label className="pps-label">Enter Price As</label>
              <div className="pps-mode-toggle">
                <div className={`pps-mode-opt ${pkgForm.priceMode === "per" ? "selected" : ""}`} onClick={() => setPkgForm({ ...pkgForm, priceMode: "per", totalPrice: "" })}>
                  Per Session
                </div>
                <div className={`pps-mode-opt ${pkgForm.priceMode === "total" ? "selected" : ""}`} onClick={() => setPkgForm({ ...pkgForm, priceMode: "total", pricePerSession: "" })}>
                  Total Package Price
                </div>
              </div>
            </div>

            {pkgForm.priceMode === "per" ? (
              <div className="pps-field-row">
                <div className="pps-field">
                  <label className="pps-label">Price Per Session</label>
                  <input className="pps-input" type="number" min="0" step="0.01" placeholder="0.00" value={pkgForm.pricePerSession} onChange={(e) => setPkgForm({ ...pkgForm, pricePerSession: e.target.value })} />
                </div>
                <div className="pps-field">
                  <label className="pps-label">Subtotal</label>
                  <input className="pps-input" readOnly value={fmt((parseFloat(pkgForm.pricePerSession) || 0) * pkgForm.packageSize)} style={{ background: "#f0ede8", color: "#5a5550" }} />
                </div>
              </div>
            ) : (
              <div className="pps-field">
                <label className="pps-label">Total Package Price</label>
                <input className="pps-input" type="number" min="0" step="0.01" placeholder="0.00" value={pkgForm.totalPrice} onChange={(e) => setPkgForm({ ...pkgForm, totalPrice: e.target.value })} />
              </div>
            )}

            {/* Discount */}
            <div className="pps-field">
              <label className="pps-label">Discount</label>
              <div className="pps-discount-row">
                <select className="pps-discount-type" value={pkgForm.discountType} onChange={(e) => setPkgForm({ ...pkgForm, discountType: e.target.value as "none"|"pct"|"fixed", discountValue: "" })}>
                  <option value="none">No Discount</option>
                  <option value="pct">Percentage (%)</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                {pkgForm.discountType !== "none" && (
                  <input className="pps-input" type="number" min="0" step="0.01"
                    placeholder={pkgForm.discountType === "pct" ? "e.g. 10" : "e.g. 100.00"}
                    value={pkgForm.discountValue}
                    onChange={(e) => setPkgForm({ ...pkgForm, discountValue: e.target.value })} />
                )}
              </div>
            </div>

            {/* Final total preview */}
            {pkgBaseTotal() > 0 && (
              <div className="pps-final-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="pps-final-label">Final Total</div>
                  {pkgForm.discountType !== "none" && pkgDiscount() > 0 && (
                    <div className="pps-final-sub">− {fmt(pkgDiscount())} discount · {fmt(pkgPPS())} / session</div>
                  )}
                  {pkgForm.discountType === "none" && (
                    <div className="pps-final-sub">{fmt(pkgPPS())} per session</div>
                  )}
                </div>
                <div className="pps-final-value">{fmt(pkgFinalTotal())}</div>
              </div>
            )}

            <div className="pps-field-row">
              <div className="pps-field">
                <label className="pps-label">Amount Paid</label>
                <input className="pps-input" type="number" min="0" step="0.01" placeholder="0.00" value={pkgForm.paidAmount} onChange={(e) => setPkgForm({ ...pkgForm, paidAmount: e.target.value })} />
              </div>
              <div className="pps-field">
                <label className="pps-label">Start Date</label>
                <input className="pps-input" type="date" value={pkgForm.startDate} onChange={(e) => setPkgForm({ ...pkgForm, startDate: e.target.value })} />
              </div>
            </div>
            <div className="pps-field">
              <label className="pps-label">Notes (optional)</label>
              <input className="pps-input" type="text" placeholder="Any notes about this package..." value={pkgForm.notes} onChange={(e) => setPkgForm({ ...pkgForm, notes: e.target.value })} />
            </div>
            {editPkg && (
              <>
                <div className="pps-field">
                  <label className="pps-label">Sessions Used (manually correct if needed)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input className="pps-input" type="number" min="0" max={pkgForm.packageSize} step="1"
                      value={pkgForm.sessionsUsed}
                      onChange={(e) => {
                        const v = Math.min(pkgForm.packageSize, Math.max(0, parseInt(e.target.value, 10) || 0));
                        setPkgForm({ ...pkgForm, sessionsUsed: String(v), active: v < pkgForm.packageSize });
                      }}
                      style={{ maxWidth: 100 }}
                    />
                    <span style={{ fontSize: 13, color: "#9a9590" }}>/ {pkgForm.packageSize} sessions</span>
                  </div>
                </div>
                <div className="pps-field">
                  <div className="pps-checkbox-row" onClick={() => setPkgForm({ ...pkgForm, active: !pkgForm.active })}>
                    <input type="checkbox" checked={pkgForm.active} readOnly />
                    <label>Package is Active</label>
                  </div>
                </div>
              </>
            )}
            {pkgError && <div className="pps-modal-error">{pkgError}</div>}
            <div className="pps-modal-actions">
              <button className="pps-modal-cancel" onClick={() => setShowPkgForm(false)}>Cancel</button>
              <button className="pps-modal-save" disabled={pkgSaving} onClick={handleSavePkg}>{pkgSaving ? "Saving…" : editPkg ? "Save Changes" : "Add Package"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete confirms ── */}
      {deletingSpId && createPortal(
        <div className="pps-del-overlay">
          <div className="pps-del-modal">
            <div className="pps-del-title">Remove Session Price?</div>
            <div className="pps-del-sub">The price record for this session will be deleted.</div>
            <div className="pps-del-actions">
              <button className="pps-del-back" onClick={() => setDeletingSpId(null)}>Cancel</button>
              <button className="pps-del-confirm" disabled={deletingSp} onClick={() => handleDeleteSessionPrice(deletingSpId)}>{deletingSp ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deletingPkgId && createPortal(
        <div className="pps-del-overlay">
          <div className="pps-del-modal">
            <div className="pps-del-title">Delete Package?</div>
            <div className="pps-del-sub">This session package and all its data will be permanently removed.</div>
            <div className="pps-del-actions">
              <button className="pps-del-back" onClick={() => setDeletingPkgId(null)}>Cancel</button>
              <button className="pps-del-confirm" disabled={deletingPkg} onClick={() => handleDeletePkg(deletingPkgId)}>{deletingPkg ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="pps-toast"><Check size={14} strokeWidth={2.5} />{toast}</div>,
        document.body
      )}
    </>
  );
}
