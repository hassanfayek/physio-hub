// FILE: src/components/VideoShowbox.tsx
// Full-screen exercise viewer: video player + how-to details, with previous /
// next across the list (arrow keys too) and Esc to close. Regular YouTube
// videos play inline; Shorts can't be embedded, so they show a portrait poster
// that opens YouTube in a new tab. Used by the library, the patient sheet and
// the patient app.

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, ExternalLink, AlertTriangle, Dumbbell, Play } from "lucide-react";
import type { VideoInfo } from "../utils/youtube";

export interface ShowboxItem {
  key:          string;
  title:        string;
  video:        VideoInfo | null;
  dosage?:      string;          // "3 sets · 10 reps · 5s hold"
  tags?:        string[];        // category, equipment…
  difficulty?:  string;          // "" | easy | moderate | hard
  description?: string;
  precautions?: string;
  notes?:       string;          // physio's note for this patient
  notesLabel?:  string;
}

interface Props {
  items:    ShowboxItem[];
  index:    number;
  onIndex:  (i: number) => void;
  onClose:  () => void;
  footer?:  (item: ShowboxItem) => ReactNode;
}

const DIFF_LABEL: Record<string, string> = { easy: "Easy", moderate: "Moderate", hard: "Hard" };

export default function VideoShowbox({ items, index, onIndex, onClose, footer }: Props) {
  const item = items[index];
  const hasPrev = index > 0, hasNext = index < items.length - 1;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  if (!item) return null;
  const v = item.video;

  return createPortal(
    <div className="vsb-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div className="vsb" role="dialog" aria-modal="true" aria-label={item.title}>
        <div className="vsb-top">
          {items.length > 1 && <span className="vsb-count">{index + 1} / {items.length}</span>}
          <button className="vsb-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className={`vsb-stage ${v?.isShort ? "short" : ""}`}>
          {v && v.embedUrl ? (
            <iframe key={v.id} src={v.embedUrl} title={item.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : v ? (
            <a className="vsb-short" href={v.watchUrl} target="_blank" rel="noopener noreferrer">
              <img src={v.thumb} alt="" />
              <span className="vsb-short-cta"><span className="vsb-play"><Play size={22} fill="currentColor" /></span>Watch on YouTube<small>Shorts open in YouTube <ExternalLink size={11} /></small></span>
            </a>
          ) : (
            <div className="vsb-novideo"><Dumbbell size={34} /><span>No video for this exercise yet</span></div>
          )}
          {hasPrev && <button className="vsb-nav l" onClick={() => onIndex(index - 1)} aria-label="Previous"><ChevronLeft size={22} /></button>}
          {hasNext && <button className="vsb-nav r" onClick={() => onIndex(index + 1)} aria-label="Next"><ChevronRight size={22} /></button>}
        </div>

        <div className="vsb-info">
          <div className="vsb-title">{item.title}</div>
          <div className="vsb-chips">
            {item.difficulty && DIFF_LABEL[item.difficulty] && <span className={`vsb-chip d-${item.difficulty}`}>{DIFF_LABEL[item.difficulty]}</span>}
            {(item.tags ?? []).filter(Boolean).map((t) => <span key={t} className="vsb-chip">{t}</span>)}
          </div>
          {item.dosage && <div className="vsb-dosage">{item.dosage}</div>}
          {item.notes && <div className="vsb-note"><b>{item.notesLabel ?? "Your physio's note"}</b>{item.notes}</div>}
          {item.description && <div className="vsb-desc"><b>How to do it</b>{item.description}</div>}
          {item.precautions && <div className="vsb-caution"><AlertTriangle size={15} /><div><b>Precautions</b>{item.precautions}</div></div>}
          {v && v.embedUrl && <a className="vsb-yt" href={v.watchUrl} target="_blank" rel="noopener noreferrer">Open on YouTube <ExternalLink size={12} /></a>}
          {footer && <div className="vsb-footer">{footer(item)}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

const CSS = `
.vsb-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(6,14,22,.82); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 24px; animation: vsbIn .18s ease both; font-family: 'Outfit', sans-serif; }
@keyframes vsbIn { from { opacity: 0; } to { opacity: 1; } }
.vsb { position: relative; width: 100%; max-width: 1040px; max-height: calc(100dvh - 48px); display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); background: #0b1620; border-radius: 22px; overflow: hidden; box-shadow: 0 30px 90px rgba(0,0,0,.45); animation: vsbPop .25s cubic-bezier(.16,1,.3,1) both; }
@keyframes vsbPop { from { transform: scale(.96) translateY(10px); opacity: 0; } to { transform: none; opacity: 1; } }
.vsb-top { position: absolute; top: 12px; right: 12px; z-index: 3; display: flex; align-items: center; gap: 8px; }
.vsb-count { font-size: 12px; font-weight: 700; color: #fff; background: rgba(12,24,36,.6); padding: 5px 10px; border-radius: 100px; }
.vsb-x { width: 36px; height: 36px; border-radius: 50%; border: none; background: rgba(12,24,36,.6); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.vsb-x:hover { background: rgba(12,24,36,.85); }
.vsb-stage { position: relative; background: #000; display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 9; align-self: center; width: 100%; }
.vsb-stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; }
.vsb-stage.short { aspect-ratio: auto; height: 100%; min-height: 420px; background: radial-gradient(circle at 50% 40%, #16324a, #000 75%); }
.vsb-short { position: relative; display: block; height: min(70dvh, 560px); aspect-ratio: 9 / 16; border-radius: 16px; overflow: hidden; text-decoration: none; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
.vsb-short img { width: 100%; height: 100%; object-fit: cover; filter: brightness(.7); }
.vsb-short-cta { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #fff; font-weight: 700; font-size: 15px; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
.vsb-short-cta small { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; opacity: .85; }
.vsb-play { width: 64px; height: 64px; border-radius: 50%; background: #ff0033; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 6px 24px rgba(255,0,51,.45); padding-left: 4px; transition: transform .15s; }
.vsb-short:hover .vsb-play { transform: scale(1.08); }
.vsb-novideo { display: flex; flex-direction: column; align-items: center; gap: 10px; color: #6b8296; font-size: 13.5px; }
.vsb-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%; border: none; background: rgba(255,255,255,.16); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; }
.vsb-nav:hover { background: rgba(255,255,255,.3); }
.vsb-nav.l { left: 12px; } .vsb-nav.r { right: 12px; }
.vsb-info { background: #fff; padding: 56px 22px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.vsb-title { font-family: 'Playfair Display', serif; font-size: 22px; color: #1a1a1a; line-height: 1.2; letter-spacing: -.01em; }
.vsb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vsb-chip { font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 100px; background: #EAF5FC; color: #0C3C60; }
.vsb-chip.d-easy { background: #dcfce7; color: #166534; } .vsb-chip.d-moderate { background: #fef3c7; color: #92400e; } .vsb-chip.d-hard { background: #fee2e2; color: #991b1b; }
.vsb-dosage { font-size: 15px; font-weight: 700; color: #0C3C60; background: #f5fbff; border: 1px solid #D6EEF8; border-radius: 12px; padding: 10px 12px; }
.vsb-desc, .vsb-note { font-size: 13.5px; color: #3a3530; line-height: 1.55; white-space: pre-wrap; }
.vsb-desc b, .vsb-note b, .vsb-caution b { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: #9a9590; margin-bottom: 3px; }
.vsb-note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 10px 12px; color: #78350f; }
.vsb-note b { color: #92400e; }
.vsb-caution { display: flex; gap: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 10px 12px; font-size: 13px; color: #7f1d1d; line-height: 1.5; white-space: pre-wrap; }
.vsb-caution svg { color: #dc2626; flex-shrink: 0; margin-top: 2px; } .vsb-caution b { color: #b91c1c; }
.vsb-yt { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: #2E8BC0; text-decoration: none; }
.vsb-footer { margin-top: auto; padding-top: 6px; }
@media (max-width: 760px) {
  .vsb-overlay { padding: 0; align-items: stretch; }
  .vsb { max-height: none; height: 100dvh; border-radius: 0; grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .vsb-stage.short { min-height: 0; height: auto; padding: 56px 0 16px; }
  .vsb-short { height: min(52dvh, 460px); }
  .vsb-info { padding: 18px 16px 24px; }
  .vsb-nav { width: 36px; height: 36px; }
}
`;
