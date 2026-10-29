// FILE: src/features/analytics/PatientPicker.tsx
// Searchable patient picker for linking an inquiry to a patient record.
// Type a name or phone; with an empty box it suggests patients matching the
// inquiry's own phone / name. The list renders in a portal so table scroll
// containers can't clip it.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { Patient } from "../../services/patientService";
import { fullName, searchPatients, suggestPatients } from "./patientSearch";

interface Props {
  patients: Patient[];
  value: string;                      // linked patient uid, "" if none
  onChange: (patientId: string) => void;
  suggestName?: string;
  suggestPhone?: string;
}

export default function PatientPicker({ patients, value, onChange, suggestName = "", suggestPhone = "" }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const linked = value ? patients.find((p) => p.uid === value) : undefined;
  const suggestions = q.trim() ? [] : suggestPatients(patients, suggestName, suggestPhone);
  const results = q.trim() ? searchPatients(patients, q) : suggestions;

  // Close when the page scrolls or resizes: the fixed-position list would drift.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  const show = () => { if (inputRef.current) setRect(inputRef.current.getBoundingClientRect()); setOpen(true); setActive(0); };
  const pick = (id: string) => { onChange(id); setQ(""); setOpen(false); };

  if (value) {
    return (
      <div className="pp-linked">
        <span className="pp-linked-name">{linked ? fullName(linked) : "Unknown patient"}</span>
        {linked?.phone && <span className="pp-linked-phone">{linked.phone}</span>}
        <button type="button" className="pp-unlink" title="Unlink" onClick={() => onChange("")}><X size={12} /></button>
        <style>{CSS}</style>
      </div>
    );
  }

  return (
    <div className="pp-wrap">
      <style>{CSS}</style>
      <Search size={13} className="pp-icon" />
      <input
        ref={inputRef}
        className="pp-input"
        placeholder="Search name or phone…"
        value={q}
        onChange={(e) => { setQ(e.target.value); show(); }}
        onFocus={show}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { show(); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active].uid); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && rect && createPortal(
        <div className="pp-list" style={{ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260) }} onMouseDown={(e) => e.preventDefault()}>
          <style>{CSS}</style>
          {!q.trim() && results.length > 0 && <div className="pp-head">Suggested from this inquiry</div>}
          {results.map((p, i) => (
            <button type="button" key={p.uid} className={`pp-item ${i === active ? "on" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => pick(p.uid)}>
              <span className="pp-name">{fullName(p)}</span>
              <span className="pp-phone">{p.phone || ""}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="pp-empty">{q.trim() ? "No patient matches. Check the spelling or try the phone number." : "Type a name or phone number to search."}</div>
          )}
        </div>, document.body)}
    </div>
  );
}

const CSS = `
.pp-wrap { position: relative; min-width: 200px; }
.pp-icon { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: #9a9590; pointer-events: none; }
.pp-input { width: 100%; border: 1.5px solid #e5e0d8; border-radius: 9px; padding: 7px 9px 7px 28px; font-family: inherit; font-size: 13px; background: #fff; box-sizing: border-box; }
.pp-input:focus { outline: none; border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,.12); }
.pp-list { position: fixed; z-index: 1200; background: #fff; border: 1px solid #e5e0d8; border-radius: 12px; box-shadow: 0 12px 32px rgba(12,60,96,.16); padding: 6px; max-height: 300px; overflow-y: auto; font-family: 'Outfit', sans-serif; }
.pp-head { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #9a9590; padding: 6px 8px 4px; }
.pp-item { display: flex; justify-content: space-between; gap: 10px; width: 100%; text-align: left; border: none; background: none; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 13px; color: #1a1a1a; }
.pp-item.on { background: #EAF5FC; }
.pp-name { font-weight: 600; } .pp-phone { color: #9a9590; font-size: 12px; white-space: nowrap; }
.pp-empty { padding: 10px; font-size: 12.5px; color: #9a9590; }
.pp-linked { display: inline-flex; align-items: center; gap: 6px; padding: 5px 6px 5px 10px; border-radius: 100px; background: #ecfdf3; border: 1px solid #b7e4c7; font-size: 13px; max-width: 100%; }
.pp-linked-name { font-weight: 600; color: #1b4332; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-linked-phone { color: #5a8a6e; font-size: 12px; white-space: nowrap; }
.pp-unlink { border: none; background: #fff; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #6b7280; flex-shrink: 0; }
.pp-unlink:hover { background: #fee2e2; color: #b91c1c; }
`;
