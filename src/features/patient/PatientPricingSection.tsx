// FILE: src/features/patient/PatientPricingSection.tsx
// Visible only to clinic_manager and secretary (when enabled by manager).

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Check, X, Eye, EyeOff, DollarSign, Package, ClipboardList } from "lucide-react";
import {
  subscribeToPatientBilling,
  subscribeToBillingSettings,
  saveBillingSettings,
  addBillingEntry,
  updateBillingEntry,
  deleteBillingEntry,
  subscribeToSessionPrices,
  setSessionPrice,
  deleteSessionPrice,
  subscribeToPatientPackages,
  addSessionPackage,
  updateSessionPackage,
  deleteSessionPackage,
  type BillingEntry,
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
  patientId:   string;
  isManager:   boolean;
  isSecretary: boolean;
  patientName: string;
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
  patientName,
}: PatientPricingSectionProps) {

  // ── Inner tab ───────────────────────────────────────────────────────────────
  const [innerTab, setInnerTab] = useState<"billing" | "sessions" | "packages">("billing");

  // ── Billing entries ─────────────────────────────────────────────────────────
  const [entries,  setEntries]  = useState<BillingEntry[]>([]);
  const [entryLoading, setEntryLoading] = useState(true);

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

  // ── Billing form ────────────────────────────────────────────────────────────
  const EMPTY_FORM = { date: new Date().toISOString().slice(0, 10), description: "", amount: "", paid: false, paidDate: "", notes: "" };
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [editEntry,       setEditEntry]       = useState<BillingEntry | null>(null);
  const [billingForm,     setBillingForm]     = useState({ ...EMPTY_FORM });
  const [billingSaving,   setBillingSaving]   = useState(false);
  const [billingError,    setBillingError]    = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [deletingEntry,   setDeletingEntry]   = useState(false);

  // ── Session price form ──────────────────────────────────────────────────────
  const [sessionPriceAppt,   setSessionPriceAppt]   = useState<Appointment | null>(null);
  const [sessionPriceForm,   setSessionPriceForm]   = useState({ amount: "", discountType: "none" as "none" | "pct" | "fixed", discountValue: "", paid: false, paidDate: "", packageId: "", notes: "" });
  const [sessionPriceSaving, setSessionPriceSaving] = useState(false);
  const [sessionPriceError,  setSessionPriceError]  = useState<string | null>(null);
  const [deletingSpId,       setDeletingSpId]       = useState<string | null>(null);
  const [deletingSp,         setDeletingSp]         = useState(false);

  // ── Package form ────────────────────────────────────────────────────────────
  const EMPTY_PKG = { packageSize: 6, priceMode: "per" as "per" | "total", pricePerSession: "", totalPrice: "", discountType: "none" as "none" | "pct" | "fixed", discountValue: "", startDate: new Date().toISOString().slice(0, 10), paidAmount: "", notes: "", active: true };
  const [showPkgForm,   setShowPkgForm]   = useState(false);
  const [editPkg,       setEditPkg]       = useState<SessionPackage | null>(null);
  const [pkgForm,       setPkgForm]       = useState({ ...EMPTY_PKG, packageSize: 6 as number });
  const [pkgSaving,     setPkgSaving]     = useState(false);
  const [pkgError,      setPkgError]      = useState<string | null>(null);
  const [deletingPkgId, setDeletingPkgId] = useState<string | null>(null);
  const [deletingPkg,   setDeletingPkg]   = useState(false);

  // ── Toast ────────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Subscriptions ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!patientId) return;
    setEntryLoading(true);
    return subscribeToPatientBilling(patientId, (d) => { setEntries(d); setEntryLoading(false); }, () => setEntryLoading(false));
  }, [patientId]);

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
  const totalBilled = entries.reduce((s, e) => s + e.amount, 0);
  const totalPaid   = entries.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
  const balance     = totalBilled - totalPaid;

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

  // ── Billing CRUD ─────────────────────────────────────────────────────────────
  const openAddBilling = () => {
    setBillingForm({ ...EMPTY_FORM });
    setEditEntry(null);
    setBillingError(null);
    setShowBillingForm(true);
  };

  const openEditBilling = (entry: BillingEntry) => {
    setBillingForm({ date: entry.date, description: entry.description, amount: String(entry.amount), paid: entry.paid, paidDate: entry.paidDate, notes: entry.notes });
    setEditEntry(entry);
    setBillingError(null);
    setShowBillingForm(true);
  };

  const handleSaveBilling = async () => {
    if (!billingForm.description.trim() || !billingForm.amount || !billingForm.date) { setBillingError("Date, description and amount are required."); return; }
    const amount = parseFloat(billingForm.amount);
    if (isNaN(amount) || amount < 0) { setBillingError("Please enter a valid amount."); return; }
    setBillingSaving(true); setBillingError(null);
    const payload = { patientId, date: billingForm.date, description: billingForm.description.trim(), amount, paid: billingForm.paid, paidDate: billingForm.paid ? (billingForm.paidDate || billingForm.date) : "", notes: billingForm.notes.trim() };
    if (editEntry) {
      const { error } = await updateBillingEntry(editEntry.id, payload);
      if (error) { setBillingError(error); setBillingSaving(false); return; }
      showToast("Entry updated");
    } else {
      const result = await addBillingEntry(payload);
      if ("error" in result && result.error) { setBillingError(result.error); setBillingSaving(false); return; }
      showToast("Entry added");
    }
    setBillingSaving(false); setShowBillingForm(false); setEditEntry(null);
  };

  const handleToggleBillingPaid = async (entry: BillingEntry) => {
    const paid = !entry.paid;
    const paidDate = paid ? (entry.paidDate || new Date().toISOString().slice(0, 10)) : "";
    await updateBillingEntry(entry.id, { paid, paidDate });
    showToast(paid ? "Marked as paid" : "Marked as unpaid");
  };

  const handleDeleteBilling = async (id: string) => {
    setDeletingEntry(true);
    await deleteBillingEntry(id);
    setDeletingEntry(false); setDeletingEntryId(null);
    showToast("Entry deleted");
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
      sessionType: sessionPriceAppt.sessionType,
      physioName:  sessionPriceAppt.physioName,
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
    setEditPkg(null); setPkgError(null); setShowPkgForm(true);
  };

  const openEditPkg = (pkg: SessionPackage) => {
    setPkgForm({ packageSize: pkg.packageSize, priceMode: "per", pricePerSession: String(pkg.pricePerSession), totalPrice: String(pkg.totalAmount), discountType: "none", discountValue: "", startDate: pkg.startDate, paidAmount: String(pkg.paidAmount), notes: pkg.notes, active: pkg.active });
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
      sessionsUsed:    editPkg ? editPkg.sessionsUsed : 0,
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
        .pps-pkg-size-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
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
            {innerTab === "billing" && (
              <button className="pps-add-btn" onClick={openAddBilling}>
                <Plus size={13} strokeWidth={2.5} /> Add Entry
              </button>
            )}
            {innerTab === "packages" && (
              <button className="pps-add-btn" onClick={openAddPkg}>
                <Plus size={13} strokeWidth={2.5} /> Add Package
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

        {/* Inner tabs */}
        <div className="pps-inner-tabs">
          <button className={`pps-inner-tab ${innerTab === "billing" ? "active" : ""}`} onClick={() => setInnerTab("billing")}>
            <DollarSign size={14} strokeWidth={2} /> Billing Entries
          </button>
          <button className={`pps-inner-tab ${innerTab === "sessions" ? "active" : ""}`} onClick={() => setInnerTab("sessions")}>
            <ClipboardList size={14} strokeWidth={2} /> Session Pricing
          </button>
          <button className={`pps-inner-tab ${innerTab === "packages" ? "active" : ""}`} onClick={() => setInnerTab("packages")}>
            <Package size={14} strokeWidth={2} /> Packages
          </button>
        </div>

        {/* ── BILLING TAB ── */}
        {innerTab === "billing" && (
          <>
            <div className="pps-summary">
              <div className="pps-card accent-blue">
                <div className="pps-card-label">Total Billed</div>
                <div className="pps-card-value">{fmt(totalBilled)}</div>
                <div className="pps-card-sub">{entries.length} entr{entries.length !== 1 ? "ies" : "y"}</div>
              </div>
              <div className="pps-card accent-green">
                <div className="pps-card-label">Total Paid</div>
                <div className="pps-card-value" style={{ color: "#1b4332" }}>{fmt(totalPaid)}</div>
                <div className="pps-card-sub">{entries.filter((e) => e.paid).length} paid</div>
              </div>
              <div className="pps-card accent-red">
                <div className="pps-card-label">Balance Due</div>
                <div className="pps-card-value" style={{ color: balance > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(balance)}</div>
                <div className="pps-card-sub">{entries.filter((e) => !e.paid).length} unpaid</div>
              </div>
            </div>

            {entryLoading ? (
              <div style={{ height: 80, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "ppsShimmer 1.4s ease infinite", borderRadius: 14 }} />
            ) : entries.length === 0 ? (
              <div className="pps-empty">
                <div className="pps-empty-icon"><DollarSign size={36} strokeWidth={1.5} /></div>
                <div>No billing entries yet.</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Entry" to record a charge.</div>
              </div>
            ) : (
              <div className="pps-table-wrap">
                <table className="pps-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Paid On</th><th>Actions</th>
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
                        <td><span className="pps-amount">{fmt(entry.amount)}</span></td>
                        <td>
                          <button className={`pps-paid-badge ${entry.paid ? "paid" : "unpaid"}`} onClick={() => handleToggleBillingPaid(entry)}>
                            {entry.paid ? <><Check size={10} strokeWidth={3} /> Paid</> : <><X size={10} strokeWidth={3} /> Unpaid</>}
                          </button>
                        </td>
                        <td style={{ color: "#9a9590", fontSize: 12 }}>{entry.paidDate || "—"}</td>
                        <td>
                          <div className="pps-action-row">
                            <button className="pps-edit-btn" onClick={() => openEditBilling(entry)}>Edit</button>
                            {isManager && (
                              <button className="pps-del-btn" onClick={() => setDeletingEntryId(entry.id)} disabled={deletingEntry && deletingEntryId === entry.id}>
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
                      <td colSpan={2} style={{ fontWeight: 600, fontSize: 13, color: "#5a5550" }}>Total</td>
                      <td><span className="pps-amount">{fmt(totalBilled)}</span></td>
                      <td><span style={{ fontSize: 12, color: "#1b4332", fontWeight: 600 }}>{fmt(totalPaid)} paid</span></td>
                      <td /><td><span style={{ fontSize: 12, color: balance > 0 ? "#b91c1c" : "#1b4332", fontWeight: 700 }}>{balance > 0 ? `${fmt(balance)} due` : "✓ Settled"}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── SESSIONS TAB ── */}
        {innerTab === "sessions" && (
          <>
            <div className="pps-summary">
              <div className="pps-card accent-blue">
                <div className="pps-card-label">Sessions Done</div>
                <div className="pps-card-value">{completedAppts.length}</div>
                <div className="pps-card-sub">{sessionPrices.length} priced</div>
              </div>
              <div className="pps-card accent-green">
                <div className="pps-card-label">Session Revenue</div>
                <div className="pps-card-value" style={{ color: "#1b4332" }}>{fmt(sessionTotal)}</div>
                <div className="pps-card-sub">{fmt(sessionPaid)} collected</div>
              </div>
              <div className="pps-card accent-red">
                <div className="pps-card-label">Session Balance</div>
                <div className="pps-card-value" style={{ color: sessionTotal - sessionPaid > 0 ? "#b91c1c" : "#1b4332" }}>
                  {fmt(sessionTotal - sessionPaid)}
                </div>
                <div className="pps-card-sub">{sessionPrices.filter((sp) => !sp.paid).length} unpaid sessions</div>
              </div>
            </div>

            {apptLoading ? (
              <div style={{ height: 80, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "ppsShimmer 1.4s ease infinite", borderRadius: 14 }} />
            ) : completedAppts.length === 0 ? (
              <div className="pps-empty">
                <div className="pps-empty-icon"><ClipboardList size={36} strokeWidth={1.5} /></div>
                <div>No completed sessions yet.</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Completed sessions will appear here for pricing.</div>
              </div>
            ) : (
              <div className="pps-table-wrap">
                <table className="pps-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Time</th><th>Session Type</th><th>Physiotherapist</th><th>Price</th><th>Status</th><th>Package</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedAppts.map((appt) => {
                      const sp = sessionPriceMap.get(appt.id);
                      const pkg = sp?.packageId ? packages.find((p) => p.id === sp.packageId) : null;
                      return (
                        <tr key={appt.id}>
                          <td style={{ whiteSpace: "nowrap", color: "#5a5550" }}>{appt.date}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{fmtHour12(appt.hour)}</td>
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
                          <td>
                            {pkg ? <span className="pps-pkg-badge">{pkg.packageSize}-session pkg</span> : <span style={{ color: "#c0bbb4", fontSize: 12 }}>—</span>}
                          </td>
                          <td>
                            <div className="pps-action-row">
                              <button className="pps-set-price-btn" onClick={() => openSessionPrice(appt)}>
                                {sp ? "Edit" : "Set Price"}
                              </button>
                              {sp && isManager && (
                                <button className="pps-del-btn" onClick={() => setDeletingSpId(sp.id)} disabled={deletingSp && deletingSpId === sp.id}>
                                  <Trash2 size={12} strokeWidth={2} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ fontWeight: 600, fontSize: 13, color: "#5a5550" }}>Total</td>
                      <td><span className="pps-amount">{fmt(sessionTotal)}</span></td>
                      <td><span style={{ fontSize: 12, color: "#1b4332", fontWeight: 600 }}>{fmt(sessionPaid)} paid</span></td>
                      <td /><td><span style={{ fontSize: 12, color: sessionTotal - sessionPaid > 0 ? "#b91c1c" : "#1b4332", fontWeight: 700 }}>{sessionTotal - sessionPaid > 0 ? `${fmt(sessionTotal - sessionPaid)} due` : "✓ Settled"}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── PACKAGES TAB ── */}
        {innerTab === "packages" && (
          <>
            <div className="pps-summary">
              <div className="pps-card accent-purple">
                <div className="pps-card-label">Active Packages</div>
                <div className="pps-card-value">{activePackages.length}</div>
                <div className="pps-card-sub">{packages.length} total</div>
              </div>
              <div className="pps-card accent-blue">
                <div className="pps-card-label">Sessions Remaining</div>
                <div className="pps-card-value">{activePackages.reduce((s, p) => s + (p.packageSize - p.sessionsUsed), 0)}</div>
                <div className="pps-card-sub">across active packages</div>
              </div>
              <div className="pps-card accent-green">
                <div className="pps-card-label">Packages Revenue</div>
                <div className="pps-card-value">{fmt(packages.reduce((s, p) => s + p.paidAmount, 0))}</div>
                <div className="pps-card-sub">of {fmt(packages.reduce((s, p) => s + p.totalAmount, 0))} total</div>
              </div>
            </div>

            {pkgLoading ? (
              <div style={{ height: 80, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "ppsShimmer 1.4s ease infinite", borderRadius: 14 }} />
            ) : packages.length === 0 ? (
              <div className="pps-empty">
                <div className="pps-empty-icon"><Package size={36} strokeWidth={1.5} /></div>
                <div>No session packages yet.</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Package" to create a 6, 12, or 24-session bundle.</div>
              </div>
            ) : (
              <div className="pps-pkg-grid">
                {packages.map((pkg) => {
                  const pct = Math.min(100, (pkg.sessionsUsed / pkg.packageSize) * 100);
                  const remaining = pkg.packageSize - pkg.sessionsUsed;
                  const balanceDue = pkg.totalAmount - pkg.paidAmount;
                  return (
                    <div key={pkg.id} className={`pps-pkg-card ${pkg.active ? "active-pkg" : "inactive-pkg"}`}>
                      <div className="pps-pkg-card-header">
                        <div className="pps-pkg-size">
                          {pkg.packageSize} <span>sessions</span>
                        </div>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          {pkg.active
                            ? <span className="pps-pkg-active-badge">Active</span>
                            : <span className="pps-pkg-inactive-badge">Completed</span>
                          }
                        </div>
                      </div>

                      <div className="pps-pkg-progress-wrap">
                        <div className="pps-pkg-progress-label">
                          <span>{pkg.sessionsUsed} used</span>
                          <span>{remaining} left</span>
                        </div>
                        <div className="pps-pkg-progress-track">
                          <div className="pps-pkg-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      <div className="pps-pkg-stats">
                        <div className="pps-pkg-stat">
                          <div className="pps-pkg-stat-label">Per Session</div>
                          <div className="pps-pkg-stat-value">{fmt(pkg.pricePerSession)}</div>
                        </div>
                        <div className="pps-pkg-stat">
                          <div className="pps-pkg-stat-label">Total</div>
                          <div className="pps-pkg-stat-value">{fmt(pkg.totalAmount)}</div>
                        </div>
                        <div className="pps-pkg-stat">
                          <div className="pps-pkg-stat-label">Paid</div>
                          <div className="pps-pkg-stat-value" style={{ color: "#1b4332" }}>{fmt(pkg.paidAmount)}</div>
                        </div>
                        <div className="pps-pkg-stat">
                          <div className="pps-pkg-stat-label">Balance</div>
                          <div className="pps-pkg-stat-value" style={{ color: balanceDue > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(balanceDue)}</div>
                        </div>
                      </div>

                      {pkg.notes && <div className="pps-pkg-notes">{pkg.notes}</div>}
                      <div style={{ fontSize: 11, color: "#c0bbb4", marginBottom: 10 }}>Started {pkg.startDate}</div>

                      <div className="pps-pkg-actions">
                        <button className="pps-edit-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => openEditPkg(pkg)}>Edit</button>
                        {isManager && pkg.active && (
                          <button
                            className="pps-pkg-use-btn"
                            style={{ flex: "none", padding: "7px 12px" }}
                            disabled={remaining === 0}
                            onClick={async () => {
                              await updateSessionPackage(pkg.id, { sessionsUsed: pkg.sessionsUsed + 1, active: pkg.sessionsUsed + 1 < pkg.packageSize });
                              showToast(`Session used — ${remaining - 1} remaining`);
                            }}
                          >
                            Use Session
                          </button>
                        )}
                        {isManager && (
                          <button className="pps-del-btn" onClick={() => setDeletingPkgId(pkg.id)} disabled={deletingPkg && deletingPkgId === pkg.id}>
                            <Trash2 size={12} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Billing Add/Edit Modal ── */}
      {showBillingForm && createPortal(
        <div className="pps-overlay" onClick={(e) => { if (e.target === e.currentTarget && !billingSaving) setShowBillingForm(false); }}>
          <div className="pps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pps-modal-title">{editEntry ? "Edit Entry" : "Add Billing Entry"}</div>
            <div className="pps-modal-sub">{patientName}</div>
            <div className="pps-field-row">
              <div className="pps-field">
                <label className="pps-label">Date</label>
                <input className="pps-input" type="date" value={billingForm.date} onChange={(e) => setBillingForm({ ...billingForm, date: e.target.value })} />
              </div>
              <div className="pps-field">
                <label className="pps-label">Amount</label>
                <input className="pps-input" type="number" min="0" step="0.01" placeholder="0.00" value={billingForm.amount} onChange={(e) => setBillingForm({ ...billingForm, amount: e.target.value })} />
              </div>
            </div>
            <div className="pps-field">
              <label className="pps-label">Description</label>
              <input className="pps-input" type="text" placeholder="e.g. Manual Therapy Session..." value={billingForm.description} onChange={(e) => setBillingForm({ ...billingForm, description: e.target.value })} />
            </div>
            <div className="pps-field">
              <label className="pps-label">Notes (optional)</label>
              <input className="pps-input" type="text" placeholder="Any additional notes..." value={billingForm.notes} onChange={(e) => setBillingForm({ ...billingForm, notes: e.target.value })} />
            </div>
            <div className="pps-field">
              <div className="pps-checkbox-row" onClick={() => setBillingForm({ ...billingForm, paid: !billingForm.paid, paidDate: !billingForm.paid ? (billingForm.paidDate || new Date().toISOString().slice(0, 10)) : "" })}>
                <input type="checkbox" checked={billingForm.paid} readOnly />
                <label>Mark as Paid</label>
              </div>
            </div>
            {billingForm.paid && (
              <div className="pps-field">
                <label className="pps-label">Paid On</label>
                <input className="pps-input" type="date" value={billingForm.paidDate} onChange={(e) => setBillingForm({ ...billingForm, paidDate: e.target.value })} />
              </div>
            )}
            {billingError && <div className="pps-modal-error">{billingError}</div>}
            <div className="pps-modal-actions">
              <button className="pps-modal-cancel" onClick={() => setShowBillingForm(false)}>Cancel</button>
              <button className="pps-modal-save" disabled={billingSaving} onClick={handleSaveBilling}>{billingSaving ? "Saving…" : editEntry ? "Save Changes" : "Add Entry"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Session Price Modal ── */}
      {sessionPriceAppt && createPortal(
        <div className="pps-overlay" onClick={(e) => { if (e.target === e.currentTarget && !sessionPriceSaving) setSessionPriceAppt(null); }}>
          <div className="pps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pps-modal-title">Session Price</div>
            <div className="pps-modal-sub">{sessionPriceAppt.date} · {fmtHour12(sessionPriceAppt.hour)} · {sessionPriceAppt.sessionType || "Session"}</div>
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
                      className={`pps-pkg-size-opt ${pkgForm.packageSize === size ? "selected" : ""}`}
                      onClick={() => setPkgForm({ ...pkgForm, packageSize: size })}
                    >
                      <div className="pps-pkg-size-opt-label">{size}</div>
                      <div className="pps-pkg-size-opt-sub">sessions</div>
                    </div>
                  ))}
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
              <div className="pps-field">
                <div className="pps-checkbox-row" onClick={() => setPkgForm({ ...pkgForm, active: !pkgForm.active })}>
                  <input type="checkbox" checked={pkgForm.active} readOnly />
                  <label>Package is Active</label>
                </div>
              </div>
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
      {deletingEntryId && createPortal(
        <div className="pps-del-overlay">
          <div className="pps-del-modal">
            <div className="pps-del-title">Delete Entry?</div>
            <div className="pps-del-sub">This billing entry will be permanently removed.</div>
            <div className="pps-del-actions">
              <button className="pps-del-back" onClick={() => setDeletingEntryId(null)}>Cancel</button>
              <button className="pps-del-confirm" disabled={deletingEntry} onClick={() => handleDeleteBilling(deletingEntryId)}>{deletingEntry ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
