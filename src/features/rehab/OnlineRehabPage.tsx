// FILE: src/features/rehab/OnlineRehabPage.tsx
// Online rehabilitation — assign patients, build & print weekly exercise programs.

import React, { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Printer, ChevronDown, Pencil, X } from "lucide-react";
import {
  subscribeToEnrollments, enrollPatient, deleteEnrollment, updateEnrollmentStatus,
  subscribeToPatientPrograms, createProgram, updateProgram, deleteProgram,
  type OnlineRehabEnrollment, type WeeklyProgram, type DayPlan, type RehabExercise, type DayKey,
} from "../../services/onlineRehabService";
import {
  subscribeToAllPatients, subscribeToPhysioPatients, type Patient,
} from "../../services/patientService";
import {
  subscribeToExerciseLibrary, type LibraryExercise,
} from "../../services/exerciseService";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: DayKey[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];
const DAY_LABEL: Record<DayKey, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};
const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function uid(): string { return Math.random().toString(36).slice(2); }

function blankExercise(): RehabExercise {
  return { id: uid(), name: "", sets: "3", reps: "10", duration: "", rest: "60 sec", notes: "" };
}

function blankDayPlan(day: DayKey): DayPlan {
  return { day, isRest: false, exercises: [] };
}

function blankForm() {
  return { weekLabel: "", weekStart: "", days: DAYS.map(blankDayPlan) };
}

function weekEnd(start: string): string {
  if (!start) return "";
  const d = new Date(start + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function fmtShort(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtLong(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function dayDate(weekStart: string, offset: number): string {
  if (!weekStart) return "";
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + offset);
  return fmtLong(d.toISOString().slice(0, 10));
}

function activeDayCount(days: DayPlan[]): number {
  return days.filter((d) => !d.isRest && d.exercises.length > 0).length;
}

// ─── Print PDF ────────────────────────────────────────────────────────────────

function printProgram(
  program:     WeeklyProgram,
  patientName: string,
  physioName:  string,
) {
  const end       = program.weekEnd || weekEnd(program.weekStart);
  const dateRange = program.weekStart
    ? `${fmtLong(program.weekStart)} – ${fmtLong(end)}`
    : "";
  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const daySections = program.days.map((day, i) => {
    const dateStr  = dayDate(program.weekStart, i);
    const hdr      = `${DAY_LABEL[day.day]}${dateStr ? ` — ${dateStr}` : ""}`;
    const hdrClass = day.isRest || day.exercises.length === 0 ? "day-hdr rest-hdr" : "day-hdr";

    if (day.isRest || day.exercises.length === 0) {
      const msg = day.isRest
        ? "REST DAY — Recovery, light stretching & hydration"
        : "No exercises scheduled";
      return `
        <div class="day-sec">
          <div class="${hdrClass}">${hdr}</div>
          <div class="rest-body">${msg}</div>
        </div>`;
    }

    const rows = day.exercises.map((ex) => `
      <tr>
        <td class="ex-name">${ex.name || "<em>—</em>"}</td>
        <td class="c">${ex.sets || "—"}</td>
        <td class="c">${ex.reps || "—"}</td>
        <td class="c">${ex.duration || "—"}</td>
        <td class="c">${ex.rest || "—"}</td>
        <td>${ex.notes || ""}</td>
        <td class="c"><span class="chk"></span></td>
      </tr>`).join("");

    return `
      <div class="day-sec">
        <div class="${hdrClass}">${hdr}</div>
        <table>
          <thead>
            <tr>
              <th style="width:27%">Exercise</th>
              <th class="c" style="width:7%">Sets</th>
              <th class="c" style="width:10%">Reps</th>
              <th class="c" style="width:10%">Duration</th>
              <th class="c" style="width:9%">Rest</th>
              <th>Notes / Instructions</th>
              <th class="c" style="width:5%">✓</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${patientName} — ${program.weekLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a1a;background:#fff;padding:22px 28px;}
  .hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;padding-bottom:14px;border-bottom:3px solid #2E8BC0;}
  .logo{height:46px;}
  .hdr-right{text-align:right;}
  .prog-title{font-size:18px;font-weight:bold;color:#2E8BC0;}
  .prog-sub{font-size:11px;color:#666;margin-top:4px;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px;background:#f5f3ef;border-radius:8px;padding:12px 16px;margin-bottom:18px;}
  .info-label{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#9a9590;margin-bottom:2px;}
  .info-val{font-size:13px;font-weight:500;}
  .day-sec{margin-bottom:14px;page-break-inside:avoid;}
  .day-hdr{background:#2E8BC0;color:#fff;padding:7px 14px;font-size:10px;font-weight:bold;letter-spacing:.07em;text-transform:uppercase;border-radius:6px 6px 0 0;}
  .rest-hdr{background:#9a9590;}
  .rest-body{background:#f5f3ef;padding:10px 14px;color:#5a5550;font-style:italic;border-radius:0 0 6px 6px;border:1px solid #e5e0d8;border-top:none;}
  table{width:100%;border-collapse:collapse;border:1px solid #e5e0d8;border-top:none;}
  th{background:#EAF5FC;color:#0C3C60;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;padding:6px 9px;border:1px solid #d0e8f4;text-align:left;}
  td{padding:6px 9px;border:1px solid #ebe8e3;vertical-align:top;font-size:11.5px;}
  tr:nth-child(even) td{background:#fafaf8;}
  .ex-name{font-weight:600;}
  .c{text-align:center;}
  .chk{display:inline-block;width:14px;height:14px;border:1.5px solid #999;border-radius:3px;}
  .sig-row{margin-top:26px;padding-top:14px;border-top:1px solid #e5e0d8;display:flex;justify-content:space-between;}
  .sig-blk{display:flex;flex-direction:column;gap:22px;width:190px;}
  .sig-lbl{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#5a5550;}
  .sig-line{border-bottom:1px solid #555;padding-top:22px;}
  .sig-name{font-size:10px;color:#9a9590;margin-top:3px;}
  .note-box{margin-top:16px;background:#fffbe6;border:1px solid #ffe082;border-radius:6px;padding:10px 14px;font-size:10.5px;color:#5a4000;}
  .footer{margin-top:16px;text-align:center;font-size:9px;color:#c0bbb4;}
  @media print{body{padding:8mm 10mm;}.day-sec{page-break-inside:avoid;}}
</style>
</head>
<body>
<div class="hdr">
  <img src="${window.location.origin}/physio-logo.svg" class="logo" alt="Physio+"/>
  <div class="hdr-right">
    <div class="prog-title">Online Rehabilitation Program</div>
    <div class="prog-sub">${program.weekLabel}${dateRange ? " · " + dateRange : ""}</div>
  </div>
</div>

<div class="info-grid">
  <div><div class="info-label">Patient</div><div class="info-val">${patientName}</div></div>
  <div><div class="info-label">Physiotherapist</div><div class="info-val">${physioName}</div></div>
  <div><div class="info-label">Program / Phase</div><div class="info-val">${program.weekLabel}</div></div>
  <div><div class="info-label">Date Issued</div><div class="info-val">${today}</div></div>
</div>

${daySections}

<div class="note-box">
  <strong>Important:</strong> Perform each exercise with full control. Stop if you feel sharp pain and contact your physiotherapist immediately. This program is designed specifically for you — do not share or modify it without guidance.
</div>

<div class="sig-row">
  <div class="sig-blk">
    <div class="sig-lbl">Physiotherapist</div>
    <div class="sig-line"></div>
    <div class="sig-name">${physioName}</div>
  </div>
  <div class="sig-blk">
    <div class="sig-lbl">Patient Signature</div>
    <div class="sig-line"></div>
  </div>
  <div class="sig-blk">
    <div class="sig-lbl">Date Reviewed</div>
    <div class="sig-line"></div>
  </div>
</div>

<div class="footer">
  Generated by Physio+ &bull; Online Rehabilitation Program for ${patientName} &bull; ${today}
</div>

<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up blocked. Please allow pop-ups for this site and try again."); return; }
  w.document.write(html);
  w.document.close();
}

// ─── ProgramCard ──────────────────────────────────────────────────────────────

function ProgramCard({
  program, patientName, physioName, onEdit, onDelete,
}: {
  program:     WeeklyProgram;
  patientName: string;
  physioName:  string;
  onEdit:      () => void;
  onDelete:    () => void;
}) {
  const [open, setOpen] = useState(false);
  const active   = activeDayCount(program.days);
  const restDays = program.days.filter((d) => d.isRest).length;
  const end      = program.weekEnd || weekEnd(program.weekStart);

  return (
    <div className="reh-prog-card">
      <div className="reh-prog-hdr" onClick={() => setOpen((o) => !o)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="reh-prog-label">{program.weekLabel}</div>
          <div className="reh-prog-meta">
            {program.weekStart ? `${fmtShort(program.weekStart)} – ${fmtShort(end)} · ` : ""}
            {active} exercise {active === 1 ? "day" : "days"}, {restDays} rest
          </div>
        </div>
        <div className="reh-prog-acts" onClick={(e) => e.stopPropagation()}>
          <button
            className="reh-act-btn print"
            onClick={() => printProgram(program, patientName, physioName)}
            title="Print PDF"
          >
            <Printer size={13} strokeWidth={2} />
          </button>
          <button className="reh-act-btn edit" onClick={onEdit} title="Edit">
            <Pencil size={13} strokeWidth={2} />
          </button>
          <button className="reh-act-btn del" onClick={onDelete} title="Delete">
            <Trash2 size={13} strokeWidth={2} />
          </button>
          <ChevronDown
            size={15} strokeWidth={2.5}
            style={{ color: "#9a9590", flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}
          />
        </div>
      </div>

      {open && (
        <div className="reh-prog-body">
          {program.days.map((day, i) => {
            const empty = !day.isRest && day.exercises.length === 0;
            return (
              <div key={day.day} className={`reh-day-row${day.isRest ? " rest" : ""}${empty ? " empty" : ""}`}>
                <div className="reh-day-tag">
                  <div className="reh-day-tag-short">{DAY_SHORT[day.day]}</div>
                  {program.weekStart && (
                    <div className="reh-day-tag-num">
                      {new Date(new Date(program.weekStart + "T00:00:00").setDate(
                        new Date(program.weekStart + "T00:00:00").getDate() + i
                      )).getDate()}
                    </div>
                  )}
                </div>
                <div className="reh-day-content">
                  {day.isRest ? (
                    <span className="reh-rest-chip">REST</span>
                  ) : day.exercises.length === 0 ? (
                    <span style={{ color: "#c0bbb4", fontSize: 12, fontStyle: "italic" }}>No exercises</span>
                  ) : (
                    day.exercises.map((ex, j) => (
                      <div key={j} className="reh-ex-chip">
                        <span className="reh-ex-chip-name">{ex.name || "Unnamed"}</span>
                        {(ex.sets || ex.reps) && (
                          <span className="reh-ex-chip-detail">
                            {ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : ex.sets || ex.reps}
                            {ex.duration ? ` · ${ex.duration}` : ""}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  .reh-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .reh-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 500; color: #1a1a1a; margin-bottom: 3px; }
  .reh-sub   { font-size: 13px; color: #9a9590; }

  .reh-enroll-btn {
    display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px;
    border-radius: 11px; border: none; background: #2E8BC0; color: #fff;
    font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: background 0.15s; min-height: 42px; white-space: nowrap;
  }
  .reh-enroll-btn:hover { background: #0C3C60; }

  /* ── Empty state ── */
  .reh-empty { text-align: center; padding: 48px 16px; }
  .reh-empty-icon { font-size: 36px; margin-bottom: 12px; }
  .reh-empty-title { font-size: 16px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px; }
  .reh-empty-sub   { font-size: 13px; color: #9a9590; max-width: 320px; margin: 0 auto; }

  /* ── Enrollment grid ── */
  .reh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .reh-card {
    background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
    padding: 16px; display: flex; align-items: flex-start; gap: 13px;
    cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .reh-card:hover { border-color: #B3DEF0; box-shadow: 0 2px 12px rgba(46,139,192,0.08); }
  .reh-card-avatar {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, #2E8BC0, #5BC0BE);
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 700; color: #fff;
  }
  .reh-card-info   { flex: 1; min-width: 0; }
  .reh-card-name   { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
  .reh-card-meta   { font-size: 12px; color: #9a9590; margin-bottom: 4px; }
  .reh-card-notes  { font-size: 12px; color: #5a5550; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .reh-card-status {
    font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 100px;
    flex-shrink: 0; align-self: flex-start;
  }
  .reh-card-status.active    { background: #d8f3dc; color: #1b4332; }
  .reh-card-status.completed { background: #f3f4f6; color: #374151; }

  /* ── Back button ── */
  .reh-back-btn {
    display: inline-flex; align-items: center; gap: 7px; margin-bottom: 18px;
    padding: 7px 14px; border-radius: 10px; border: 1.5px solid #e5e0d8;
    background: #fff; font-family: 'Outfit', sans-serif; font-size: 13.5px;
    font-weight: 500; color: #5a5550; cursor: pointer; transition: all 0.15s;
  }
  .reh-back-btn:hover { border-color: #B3DEF0; color: #2E8BC0; }

  /* ── Patient header ── */
  .reh-patient-hdr {
    background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
    padding: 16px 20px; display: flex; align-items: center; gap: 14px;
    margin-bottom: 22px; flex-wrap: wrap;
  }
  .reh-patient-avatar {
    width: 50px; height: 50px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, #2E8BC0, #5BC0BE);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 700; color: #fff;
  }
  .reh-patient-info    { flex: 1; min-width: 0; }
  .reh-patient-name    { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
  .reh-patient-meta    { font-size: 12.5px; color: #9a9590; }
  .reh-patient-notes   { font-size: 12.5px; color: #5a5550; margin-top: 3px; font-style: italic; }

  .reh-status-select {
    padding: 7px 12px; border-radius: 9px; border: 1.5px solid #e5e0d8;
    background: #fafaf8; font-family: 'Outfit', sans-serif; font-size: 13px;
    color: #1a1a1a; cursor: pointer; outline: none;
  }
  .reh-status-select:focus { border-color: #2E8BC0; }

  .reh-del-enroll-btn {
    width: 36px; height: 36px; border-radius: 9px; border: 1.5px solid #e5e0d8;
    background: #fff; display: flex; align-items: center; justify-content: center;
    color: #9a9590; cursor: pointer; transition: all 0.15s;
  }
  .reh-del-enroll-btn:hover { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }

  /* ── Programs section header ── */
  .reh-prog-section-hdr {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
  }
  .reh-prog-section-title { font-size: 15px; font-weight: 600; color: #1a1a1a; }

  /* ── Program card ── */
  .reh-prog-card {
    background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
    margin-bottom: 10px; overflow: hidden; transition: border-color 0.15s;
  }
  .reh-prog-card:hover { border-color: #B3DEF0; }
  .reh-prog-hdr {
    display: flex; align-items: center; gap: 12px; padding: 14px 16px;
    cursor: pointer;
  }
  .reh-prog-label { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
  .reh-prog-meta  { font-size: 12px; color: #9a9590; }
  .reh-prog-acts  { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .reh-act-btn {
    width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid #e5e0d8;
    background: #fff; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.15s; color: #9a9590;
  }
  .reh-act-btn.print:hover { background: #EAF5FC; border-color: #B3DEF0; color: #2E8BC0; }
  .reh-act-btn.edit:hover  { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
  .reh-act-btn.del:hover   { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }

  /* ── Program card body (expanded day view) ── */
  .reh-prog-body {
    border-top: 1px solid #f0ede8; padding: 4px 0;
    animation: rehSlide 0.18s ease both;
  }
  @keyframes rehSlide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

  .reh-day-row {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 8px 16px; border-bottom: 1px solid #f5f3ef;
  }
  .reh-day-row:last-child { border-bottom: none; }
  .reh-day-row.rest   { background: #fafaf8; }
  .reh-day-row.empty  { opacity: 0.5; }
  .reh-day-tag        { display: flex; flex-direction: column; align-items: center; width: 36px; flex-shrink: 0; padding-top: 2px; }
  .reh-day-tag-short  { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9a9590; }
  .reh-day-tag-num    { font-size: 18px; font-weight: 700; color: #1a1a1a; line-height: 1.1; }
  .reh-day-content    { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-top: 2px; }
  .reh-rest-chip {
    font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 100px;
    background: #f0ede8; color: #9a9590; letter-spacing: 0.06em;
  }
  .reh-ex-chip {
    background: #EAF5FC; border: 1px solid #B3DEF0; border-radius: 8px;
    padding: 4px 10px; display: flex; align-items: center; gap: 6px;
  }
  .reh-ex-chip-name   { font-size: 12.5px; font-weight: 600; color: #0C3C60; }
  .reh-ex-chip-detail { font-size: 11px; color: #2E8BC0; }

  /* ─── Modals ─────────────────────────────────────────────────────────── */
  .reh-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    z-index: 300; backdrop-filter: blur(3px);
    padding: 16px;
  }
  .reh-modal {
    background: #fff; border-radius: 20px; padding: 28px;
    width: min(460px, 100%); max-height: 90vh; overflow-y: auto;
    box-shadow: 0 24px 80px rgba(0,0,0,0.18);
    animation: rehModal 0.22s cubic-bezier(0.16,1,0.3,1) both;
  }
  .reh-prog-modal { width: min(680px, 100%); }
  @keyframes rehModal { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }

  .reh-modal-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 500; color: #1a1a1a; margin-bottom: 4px; }
  .reh-modal-sub   { font-size: 13px; color: #9a9590; margin-bottom: 20px; }

  .reh-field     { margin-bottom: 14px; }
  .reh-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .reh-label {
    display: block; font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #9a9590; margin-bottom: 5px;
  }
  .reh-input {
    width: 100%; padding: 9px 12px; border-radius: 9px;
    border: 1.5px solid #e5e0d8; background: #fafaf8;
    font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
    outline: none; transition: border-color 0.15s;
  }
  .reh-input:focus { border-color: #2E8BC0; background: #fff; }

  .reh-modal-acts { display: flex; gap: 10px; margin-top: 20px; }
  .reh-cancel-btn {
    padding: 10px 20px; border-radius: 10px; border: 1.5px solid #e5e0d8;
    background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px;
    color: #5a5550; cursor: pointer; transition: background 0.15s;
  }
  .reh-cancel-btn:hover { background: #f5f3ef; }
  .reh-save-btn {
    flex: 1; padding: 10px; border-radius: 10px; border: none;
    background: #2E8BC0; color: #fff; font-family: 'Outfit', sans-serif;
    font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s;
  }
  .reh-save-btn:hover:not(:disabled) { background: #0C3C60; }
  .reh-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .reh-error { font-size: 13px; color: #b91c1c; margin-top: 10px; }

  /* Enroll modal — patient pick list */
  .reh-pick-list {
    max-height: 200px; overflow-y: auto; border: 1.5px solid #e5e0d8;
    border-radius: 10px; margin-bottom: 14px;
  }
  .reh-pick-item {
    padding: 10px 13px; cursor: pointer; border-bottom: 1px solid #f0ede8;
    transition: background 0.12s;
  }
  .reh-pick-item:last-child { border-bottom: none; }
  .reh-pick-item:hover      { background: #EAF5FC; }
  .reh-pick-item.sel        { background: #D6EEF8; }
  .reh-pick-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
  .reh-pick-meta { font-size: 12px; color: #9a9590; }
  .reh-pick-empty { padding: 16px; text-align: center; font-size: 13px; color: #9a9590; }

  /* ─── Program modal — day pills ── */
  .reh-day-pills {
    display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .reh-day-pill {
    position: relative; padding: 7px 12px; border-radius: 9px; border: 1.5px solid #e5e0d8;
    background: #fafaf8; font-family: 'Outfit', sans-serif; font-size: 13px;
    font-weight: 500; color: #9a9590; cursor: pointer; transition: all 0.15s;
    display: flex; align-items: center; gap: 5px;
  }
  .reh-day-pill:hover      { border-color: #B3DEF0; color: #2E8BC0; }
  .reh-day-pill.active     { background: #2E8BC0; color: #fff; border-color: #2E8BC0; }
  .reh-day-pill.has-ex     { border-color: #2E8BC0; color: #2E8BC0; }
  .reh-day-pill.is-rest    { border-color: #e5e0d8; color: #c0bbb4; }
  .reh-day-pill.active.is-rest { background: #9a9590; border-color: #9a9590; color: #fff; }
  .reh-pill-count {
    background: rgba(255,255,255,0.3); border-radius: 100px;
    font-size: 10px; font-weight: 700; padding: 1px 5px; min-width: 18px; text-align: center;
  }
  .reh-pill-rest-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.05em; }

  /* ─── Day body in program modal ── */
  .reh-day-body {
    background: #fafaf8; border: 1.5px solid #e5e0d8; border-radius: 12px;
    padding: 14px 16px; margin-bottom: 16px; min-height: 100px;
  }
  .reh-day-label-row {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
  }
  .reh-day-label { font-size: 15px; font-weight: 600; color: #1a1a1a; }
  .reh-rest-toggle {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 500; color: #5a5550; cursor: pointer;
  }
  .reh-rest-placeholder {
    font-size: 13px; color: #9a9590; font-style: italic; text-align: center; padding: 16px 0;
  }
  .reh-no-ex {
    font-size: 13px; color: #c0bbb4; font-style: italic; text-align: center; padding: 8px 0 12px;
  }

  /* ─── Exercise rows in program modal ── */
  .reh-ex-row {
    background: #fff; border: 1.5px solid #e5e0d8; border-radius: 10px;
    padding: 12px; margin-bottom: 8px;
  }
  .reh-ex-row-top {
    display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
  }
  .reh-ex-num {
    width: 22px; height: 22px; border-radius: 50%; background: #2E8BC0; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .reh-ex-name-input { flex: 1; }
  .reh-ex-del {
    width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid #e5e0d8;
    background: #fff; display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #9a9590; transition: all 0.15s; flex-shrink: 0;
  }
  .reh-ex-del:hover { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
  .reh-ex-fields {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px;
  }
  .reh-ex-field-lbl {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #9a9590; margin-bottom: 3px;
  }
  .reh-ex-mini { padding: 7px 9px; font-size: 13px; }

  /* ─── Exercise picker ── */
  .reh-add-row { display: flex; gap: 8px; margin-top: 8px; }
  .reh-add-lib-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
    border-radius: 9px; border: 1.5px solid #2E8BC0; background: #EAF5FC;
    font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
    color: #2E8BC0; cursor: pointer; transition: all 0.15s;
  }
  .reh-add-lib-btn:hover { background: #D6EEF8; }
  .reh-add-custom-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
    border-radius: 9px; border: 1.5px solid #e5e0d8; background: #fff;
    font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
    color: #5a5550; cursor: pointer; transition: all 0.15s;
  }
  .reh-add-custom-btn:hover { border-color: #c0bbb4; }
  .reh-picker {
    background: #fff; border: 1.5px solid #e5e0d8; border-radius: 10px;
    margin-top: 8px; overflow: hidden;
  }
  .reh-picker-input { border: none; border-bottom: 1px solid #f0ede8; border-radius: 0; }
  .reh-picker-input:focus { border-color: #B3DEF0; }
  .reh-picker-list { max-height: 180px; overflow-y: auto; }
  .reh-picker-item {
    padding: 9px 13px; cursor: pointer; border-bottom: 1px solid #f5f3ef;
    transition: background 0.12s;
  }
  .reh-picker-item:last-child { border-bottom: none; }
  .reh-picker-item:hover { background: #EAF5FC; }
  .reh-picker-name { font-size: 13.5px; font-weight: 600; color: #1a1a1a; }
  .reh-picker-meta { font-size: 11.5px; color: #9a9590; }
  .reh-picker-empty { padding: 14px; text-align: center; font-size: 13px; color: #9a9590; }
`;

// ─── Main component ───────────────────────────────────────────────────────────

interface OnlineRehabPageProps {
  physioId:   string;
  physioName: string;
  isManager:  boolean;
  isSenior?:  boolean;
}

export default function OnlineRehabPage({
  physioId, physioName, isManager, isSenior = false,
}: OnlineRehabPageProps) {
  // ── View state ────────────────────────────────────────────────────────────
  const [view,       setView]       = useState<"list" | "patient">("list");
  const [selected,   setSelected]   = useState<OnlineRehabEnrollment | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [enrollments, setEnrollments] = useState<OnlineRehabEnrollment[]>([]);
  const [programs,    setPrograms]    = useState<WeeklyProgram[]>([]);
  const [patients,    setPatients]    = useState<Patient[]>([]);
  const [library,     setLibrary]     = useState<LibraryExercise[]>([]);

  // ── Enroll modal ──────────────────────────────────────────────────────────
  const [showEnroll,   setShowEnroll]   = useState(false);
  const [enrollSearch, setEnrollSearch] = useState("");
  const [enrollTarget, setEnrollTarget] = useState<Patient | null>(null);
  const [enrollNotes,  setEnrollNotes]  = useState("");
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollErr,    setEnrollErr]    = useState<string | null>(null);

  // ── Program modal ─────────────────────────────────────────────────────────
  const [showProg,   setShowProg]   = useState(false);
  const [editProgId, setEditProgId] = useState<string | null>(null);
  const [form,       setForm]       = useState(blankForm());
  const [activeDay,  setActiveDay]  = useState(0);
  const [progSaving, setProgSaving] = useState(false);
  const [progErr,    setProgErr]    = useState<string | null>(null);

  // ── Exercise picker ───────────────────────────────────────────────────────
  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // ── Subscriptions ─────────────────────────────────────────────────────────
  useEffect(() => subscribeToEnrollments(setEnrollments), []);
  useEffect(() => subscribeToExerciseLibrary(setLibrary), []);
  useEffect(() => {
    if (isManager || isSenior) {
      return subscribeToAllPatients(setPatients, () => {});
    }
    return subscribeToPhysioPatients(physioId, setPatients, () => {});
  }, [physioId, isManager, isSenior]);

  useEffect(() => {
    if (!selected) return;
    return subscribeToPatientPrograms(selected.patientId, setPrograms);
  }, [selected?.patientId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const enrolledIds     = new Set(enrollments.map((e) => e.patientId));
  const availPatients   = patients.filter((p) => !enrolledIds.has(p.uid));
  const filteredPatients = availPatients.filter((p) => {
    const s = enrollSearch.toLowerCase();
    return !s || `${p.firstName} ${p.lastName}`.toLowerCase().includes(s);
  });
  const filteredLibrary = library.filter(
    (l) => !pickerSearch || l.name.toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  // ── Enroll handler ────────────────────────────────────────────────────────
  const handleEnroll = async () => {
    if (!enrollTarget) { setEnrollErr("Please select a patient."); return; }
    setEnrollSaving(true); setEnrollErr(null);
    const result = await enrollPatient({
      patientId:      enrollTarget.uid,
      patientName:    `${enrollTarget.firstName} ${enrollTarget.lastName}`,
      assignedBy:     physioId,
      assignedByName: physioName,
      notes:          enrollNotes,
    });
    if ("error" in result) { setEnrollErr(result.error); setEnrollSaving(false); return; }
    setShowEnroll(false);
    setEnrollTarget(null); setEnrollSearch(""); setEnrollNotes("");
    setEnrollSaving(false);
  };

  // ── Program form helpers ──────────────────────────────────────────────────
  const openCreate = () => {
    setEditProgId(null);
    setForm(blankForm());
    setActiveDay(0); setPickerOpen(false); setProgErr(null);
    setShowProg(true);
  };

  const openEdit = (prog: WeeklyProgram) => {
    setEditProgId(prog.id);
    setForm({
      weekLabel: prog.weekLabel,
      weekStart: prog.weekStart,
      days:      prog.days.map((d) => ({ ...d, exercises: d.exercises.map((ex) => ({ ...ex })) })),
    });
    setActiveDay(0); setPickerOpen(false); setProgErr(null);
    setShowProg(true);
  };

  const updateDay = (i: number, day: DayPlan) =>
    setForm((f) => { const days = [...f.days]; days[i] = day; return { ...f, days }; });

  const addEx = (i: number, ex: RehabExercise) => {
    const day = form.days[i];
    updateDay(i, { ...day, exercises: [...day.exercises, ex] });
  };

  const updEx = (di: number, ei: number, field: keyof RehabExercise, val: string) => {
    const day = { ...form.days[di], exercises: [...form.days[di].exercises] };
    day.exercises[ei] = { ...day.exercises[ei], [field]: val };
    updateDay(di, day);
  };

  const delEx = (di: number, ei: number) => {
    const day = { ...form.days[di] };
    day.exercises = day.exercises.filter((_, j) => j !== ei);
    updateDay(di, day);
  };

  const handleSaveProg = async () => {
    if (!selected) return;
    if (!form.weekLabel.trim()) { setProgErr("Week label is required."); return; }
    setProgSaving(true); setProgErr(null);
    const payload = {
      patientId:     selected.patientId,
      weekLabel:     form.weekLabel.trim(),
      weekStart:     form.weekStart,
      weekEnd:       weekEnd(form.weekStart),
      createdBy:     physioId,
      createdByName: physioName,
      days:          form.days,
    };
    const result = editProgId
      ? await updateProgram(editProgId, payload)
      : await createProgram(payload);
    if ("error" in result && result.error) {
      setProgErr(result.error);
    } else {
      setShowProg(false);
    }
    setProgSaving(false);
  };

  const curDay = form.days[activeDay];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>

      {/* ══ Enrollment list ══════════════════════════════════════════════════ */}
      {view === "list" && (
        <div>
          <div className="reh-hdr">
            <div>
              <div className="reh-title">Online Rehabilitation</div>
              <div className="reh-sub">Remote exercise programs — personalised weekly plans for each patient</div>
            </div>
            <button className="reh-enroll-btn" onClick={() => { setEnrollErr(null); setShowEnroll(true); }}>
              <Plus size={14} strokeWidth={2.5} /> Enroll Patient
            </button>
          </div>

          {enrollments.length === 0 ? (
            <div className="reh-empty">
              <div className="reh-empty-icon">🏋️</div>
              <div className="reh-empty-title">No patients enrolled yet</div>
              <div className="reh-empty-sub">
                Enroll a patient to start creating personalised weekly rehabilitation programs.
              </div>
            </div>
          ) : (
            <div className="reh-grid">
              {enrollments.map((en) => (
                <div
                  key={en.id}
                  className="reh-card"
                  onClick={() => { setSelected(en); setPrograms([]); setView("patient"); }}
                >
                  <div className="reh-card-avatar">{en.patientName[0] ?? "?"}</div>
                  <div className="reh-card-info">
                    <div className="reh-card-name">{en.patientName}</div>
                    <div className="reh-card-meta">
                      {en.assignedByName}
                      {en.assignedAt ? ` · ${fmtShort(en.assignedAt.toDate().toISOString().slice(0, 10))}` : ""}
                    </div>
                    {en.notes && <div className="reh-card-notes">{en.notes}</div>}
                  </div>
                  <div className={`reh-card-status ${en.status}`}>
                    {en.status === "active" ? "Active" : "Completed"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Patient detail view ══════════════════════════════════════════════ */}
      {view === "patient" && selected && (
        <div>
          <button className="reh-back-btn" onClick={() => { setView("list"); setSelected(null); }}>
            <ArrowLeft size={14} strokeWidth={2} /> Back
          </button>

          {/* Patient header */}
          <div className="reh-patient-hdr">
            <div className="reh-patient-avatar">{selected.patientName[0] ?? "?"}</div>
            <div className="reh-patient-info">
              <div className="reh-patient-name">{selected.patientName}</div>
              <div className="reh-patient-meta">
                Enrolled by {selected.assignedByName}
                {selected.assignedAt ? ` · ${fmtShort(selected.assignedAt.toDate().toISOString().slice(0, 10))}` : ""}
              </div>
              {selected.notes && <div className="reh-patient-notes">{selected.notes}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
              <select
                className="reh-status-select"
                value={selected.status}
                onChange={async (e) => {
                  const s = e.target.value as "active" | "completed";
                  await updateEnrollmentStatus(selected.id, s);
                  setSelected({ ...selected, status: s });
                }}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
              <button
                className="reh-del-enroll-btn"
                title="Remove from online rehab"
                onClick={async () => {
                  if (!window.confirm(`Remove ${selected.patientName} from online rehabilitation?`)) return;
                  await deleteEnrollment(selected.id);
                  setView("list"); setSelected(null);
                }}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Programs */}
          <div className="reh-prog-section-hdr">
            <div className="reh-prog-section-title">Weekly Programs ({programs.length})</div>
            <button className="reh-enroll-btn" onClick={openCreate}>
              <Plus size={14} strokeWidth={2.5} /> New Week Plan
            </button>
          </div>

          {programs.length === 0 ? (
            <div className="reh-empty" style={{ padding: "28px 0" }}>
              <div className="reh-empty-title">No programs yet</div>
              <div className="reh-empty-sub">
                Create the first weekly exercise plan for {selected.patientName}.
              </div>
            </div>
          ) : (
            <div>
              {programs.map((prog) => (
                <ProgramCard
                  key={prog.id}
                  program={prog}
                  patientName={selected.patientName}
                  physioName={physioName}
                  onEdit={() => openEdit(prog)}
                  onDelete={async () => {
                    if (!window.confirm(`Delete "${prog.weekLabel}"?`)) return;
                    await deleteProgram(prog.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Enroll modal ═════════════════════════════════════════════════════ */}
      {showEnroll && (
        <div className="reh-overlay" onClick={() => !enrollSaving && setShowEnroll(false)}>
          <div className="reh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reh-modal-title">Enroll Patient</div>
            <div className="reh-modal-sub">Choose a patient to add to the online rehabilitation programme.</div>

            <div className="reh-field">
              <label className="reh-label">Search Patient</label>
              <input
                className="reh-input"
                value={enrollSearch}
                onChange={(e) => setEnrollSearch(e.target.value)}
                placeholder="Type a name…"
              />
            </div>

            <div className="reh-pick-list">
              {filteredPatients.length === 0 ? (
                <div className="reh-pick-empty">
                  {enrollSearch ? "No matching patients found." : "All patients are already enrolled."}
                </div>
              ) : (
                filteredPatients.map((p) => (
                  <div
                    key={p.uid}
                    className={`reh-pick-item${enrollTarget?.uid === p.uid ? " sel" : ""}`}
                    onClick={() => setEnrollTarget(enrollTarget?.uid === p.uid ? null : p)}
                  >
                    <div className="reh-pick-name">{p.firstName} {p.lastName}</div>
                    <div className="reh-pick-meta">{p.occupation || p.status}</div>
                  </div>
                ))
              )}
            </div>

            <div className="reh-field">
              <label className="reh-label">Notes (optional)</label>
              <textarea
                className="reh-input"
                rows={2}
                value={enrollNotes}
                onChange={(e) => setEnrollNotes(e.target.value)}
                placeholder="e.g. Post-op knee, started April 2026 …"
                style={{ resize: "vertical" }}
              />
            </div>

            {enrollErr && <div className="reh-error">{enrollErr}</div>}
            <div className="reh-modal-acts">
              <button className="reh-cancel-btn" onClick={() => setShowEnroll(false)}>Cancel</button>
              <button
                className="reh-save-btn"
                disabled={enrollSaving || !enrollTarget}
                onClick={handleEnroll}
              >
                {enrollSaving ? "Enrolling…" : "Enroll Patient"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Program modal ════════════════════════════════════════════════════ */}
      {showProg && (
        <div className="reh-overlay" onClick={() => !progSaving && setShowProg(false)}>
          <div className="reh-modal reh-prog-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reh-modal-title">{editProgId ? "Edit Week Plan" : "Create Week Plan"}</div>
            <div className="reh-modal-sub">{selected?.patientName} — assign exercises to each day</div>

            {/* Week info */}
            <div className="reh-field-row">
              <div className="reh-field">
                <label className="reh-label">Week / Phase Label</label>
                <input
                  className="reh-input"
                  value={form.weekLabel}
                  onChange={(e) => setForm((f) => ({ ...f, weekLabel: e.target.value }))}
                  placeholder="e.g. Week 1, Phase 2 – Week 3"
                />
              </div>
              <div className="reh-field">
                <label className="reh-label">Week Start Date</label>
                <input
                  className="reh-input"
                  type="date"
                  value={form.weekStart}
                  onChange={(e) => setForm((f) => ({ ...f, weekStart: e.target.value }))}
                />
              </div>
            </div>

            {/* Day pills */}
            <div className="reh-day-pills">
              {DAYS.map((dk, i) => {
                const d       = form.days[i];
                const hasEx   = !d.isRest && d.exercises.length > 0;
                const isRest  = d.isRest;
                const isActive = activeDay === i;
                return (
                  <button
                    key={dk}
                    className={[
                      "reh-day-pill",
                      isActive ? "active" : "",
                      isRest   ? "is-rest" : "",
                      hasEx && !isActive ? "has-ex" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => { setActiveDay(i); setPickerOpen(false); setPickerSearch(""); }}
                  >
                    {DAY_SHORT[dk]}
                    {hasEx && (
                      <span className="reh-pill-count">{d.exercises.length}</span>
                    )}
                    {isRest && <span className="reh-pill-rest-lbl">R</span>}
                  </button>
                );
              })}
            </div>

            {/* Day body */}
            <div className="reh-day-body">
              <div className="reh-day-label-row">
                <div className="reh-day-label">{DAY_LABEL[curDay.day]}</div>
                <label className="reh-rest-toggle">
                  <input
                    type="checkbox"
                    checked={curDay.isRest}
                    onChange={(e) =>
                      updateDay(activeDay, { ...curDay, isRest: e.target.checked })
                    }
                  />
                  Mark as rest day
                </label>
              </div>

              {curDay.isRest ? (
                <div className="reh-rest-placeholder">
                  Rest day — the patient will see a recovery reminder in their program.
                </div>
              ) : (
                <>
                  {curDay.exercises.length === 0 && (
                    <div className="reh-no-ex">No exercises yet. Add from the library or create a custom one.</div>
                  )}

                  {curDay.exercises.map((ex, ei) => (
                    <div key={ex.id} className="reh-ex-row">
                      <div className="reh-ex-row-top">
                        <span className="reh-ex-num">{ei + 1}</span>
                        <input
                          className="reh-input reh-ex-name-input"
                          value={ex.name}
                          onChange={(e) => updEx(activeDay, ei, "name", e.target.value)}
                          placeholder="Exercise name"
                        />
                        <button className="reh-ex-del" onClick={() => delEx(activeDay, ei)} title="Remove">
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                      <div className="reh-ex-fields">
                        {(
                          [
                            { lbl: "Sets",     k: "sets",     ph: "3"       },
                            { lbl: "Reps",     k: "reps",     ph: "10–12"   },
                            { lbl: "Duration", k: "duration", ph: "30 sec"  },
                            { lbl: "Rest",     k: "rest",     ph: "60 sec"  },
                          ] as { lbl: string; k: keyof RehabExercise; ph: string }[]
                        ).map(({ lbl, k, ph }) => (
                          <div key={k}>
                            <div className="reh-ex-field-lbl">{lbl}</div>
                            <input
                              className="reh-input reh-ex-mini"
                              value={(ex[k] as string) ?? ""}
                              onChange={(e) => updEx(activeDay, ei, k, e.target.value)}
                              placeholder={ph}
                            />
                          </div>
                        ))}
                      </div>
                      <input
                        className="reh-input"
                        value={ex.notes}
                        onChange={(e) => updEx(activeDay, ei, "notes", e.target.value)}
                        placeholder="Coaching notes / instructions (optional)"
                        style={{ marginTop: 6 }}
                      />
                    </div>
                  ))}

                  {/* Add exercise row */}
                  <div className="reh-add-row">
                    <button
                      className="reh-add-lib-btn"
                      onClick={() => { setPickerOpen((o) => !o); setPickerSearch(""); }}
                    >
                      <Plus size={13} strokeWidth={2.5} /> From Library
                    </button>
                    <button
                      className="reh-add-custom-btn"
                      onClick={() => { addEx(activeDay, blankExercise()); setPickerOpen(false); }}
                    >
                      + Custom
                    </button>
                  </div>

                  {pickerOpen && (
                    <div className="reh-picker">
                      <input
                        className="reh-input reh-picker-input"
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder="Search exercise library…"
                        autoFocus
                      />
                      <div className="reh-picker-list">
                        {filteredLibrary.length === 0 ? (
                          <div className="reh-picker-empty">No matching exercises.</div>
                        ) : (
                          filteredLibrary.map((lex) => (
                            <div
                              key={lex.id}
                              className="reh-picker-item"
                              onClick={() => {
                                addEx(activeDay, {
                                  id:         uid(),
                                  exerciseId: lex.id,
                                  name:       lex.name,
                                  sets:       String(lex.defaultSets  || 3),
                                  reps:       String(lex.defaultReps  || 10),
                                  duration:   lex.defaultHoldTime ? `${lex.defaultHoldTime} sec` : "",
                                  rest:       "60 sec",
                                  notes:      lex.notes || "",
                                  videoId:    lex.videoId || undefined,
                                });
                                setPickerOpen(false);
                                setPickerSearch("");
                              }}
                            >
                              <div className="reh-picker-name">{lex.name}</div>
                              <div className="reh-picker-meta">
                                {lex.category}{lex.equipment ? ` · ${lex.equipment}` : ""}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {progErr && <div className="reh-error">{progErr}</div>}
            <div className="reh-modal-acts">
              <button className="reh-cancel-btn" onClick={() => setShowProg(false)}>Cancel</button>
              <button className="reh-save-btn" disabled={progSaving} onClick={handleSaveProg}>
                {progSaving
                  ? "Saving…"
                  : editProgId ? "Save Changes" : "Create Program"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
