// FILE: src/components/NotificationPanel.tsx

import { useState, useEffect, useRef } from "react";
import {
  Bell,
  Calendar,
  CalendarX,
  CheckCircle,
  UserPlus,
  AlertTriangle,
  CreditCard,
  X,
  CheckCheck,
  Trash2,
} from "lucide-react";
import {
  subscribeToNotifications,
  markNotifRead,
  markAllNotifsRead,
  clearAllNotifs,
  type AppNotification,
  type NotifType,
} from "../services/notificationService";

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationPanelProps {
  userId:                string;
  onNavigateToPatient?:  (patientId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeIcon(type: NotifType) {
  switch (type) {
    case "appointment_booked":    return <Calendar     size={14} strokeWidth={2} />;
    case "appointment_cancelled": return <CalendarX    size={14} strokeWidth={2} />;
    case "patient_confirmed":     return <CheckCircle  size={14} strokeWidth={2} />;
    case "new_patient":           return <UserPlus     size={14} strokeWidth={2} />;
    case "package_expiring":      return <AlertTriangle size={14} strokeWidth={2} />;
    case "unpaid_balance":        return <CreditCard   size={14} strokeWidth={2} />;
  }
}

function typeColor(type: NotifType): string {
  switch (type) {
    case "appointment_booked":    return "#2E8BC0";
    case "appointment_cancelled": return "#b91c1c";
    case "patient_confirmed":     return "#059669";
    case "new_patient":           return "#7c3aed";
    case "package_expiring":      return "#d97706";
    case "unpaid_balance":        return "#dc2626";
  }
}

function relativeTime(ts: AppNotification["createdAt"]): string {
  if (!ts) return "";
  const ms   = (ts as unknown as { toMillis?: () => number }).toMillis?.() ?? 0;
  const diff = Date.now() - ms;
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationPanel({ userId, onNavigateToPatient }: NotificationPanelProps) {
  const [notifs,  setNotifs]  = useState<AppNotification[]>([]);
  const [open,    setOpen]    = useState(false);
  const [clearing, setClearing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeToNotifications(userId, setNotifs);
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unread = notifs.filter((n) => !n.read).length;

  const handleClickNotif = async (n: AppNotification) => {
    if (!n.read) await markNotifRead(userId, n.id);
    if (n.patientId && onNavigateToPatient) {
      onNavigateToPatient(n.patientId);
      setOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotifsRead(userId);
  };

  const handleClearAll = async () => {
    setClearing(true);
    await clearAllNotifs(userId);
    setClearing(false);
  };

  return (
    <>
      <style>{`
        .np-wrap { position: relative; }

        .np-bell {
          position: relative;
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          cursor: pointer; transition: all 0.15s; color: #5a5550;
        }
        .np-bell:hover { background: #f5f3ef; border-color: #ccc8c0; }
        .np-bell.has-unread { color: #0C3C60; border-color: #2E8BC0; }

        .np-badge {
          position: absolute; top: -5px; right: -5px;
          min-width: 18px; height: 18px; border-radius: 9px;
          background: #dc2626; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; border: 2px solid #fff;
          animation: npBadgePop 0.2s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes npBadgePop { from { transform: scale(0); } to { transform: scale(1); } }

        .np-panel {
          position: absolute; top: calc(100% + 10px); right: 0;
          width: 360px; max-height: 500px;
          background: #fff; border-radius: 16px;
          border: 1px solid #e8e4de;
          box-shadow: 0 16px 64px rgba(0,0,0,0.14);
          display: flex; flex-direction: column;
          overflow: hidden; z-index: 9999;
          animation: npSlideIn 0.18s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes npSlideIn { from { opacity:0; transform:translateY(-8px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }

        .np-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px 10px; border-bottom: 1px solid #f0ede8;
          flex-shrink: 0;
        }
        .np-head-title {
          font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600; color: #1a1a1a;
        }
        .np-head-actions { display: flex; align-items: center; gap: 6px; }
        .np-action-btn {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 8px; border-radius: 6px; border: 1px solid #e5e0d8;
          background: #fff; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 500; color: #5a5550;
          transition: all 0.12s;
        }
        .np-action-btn:hover { background: #f5f3ef; }
        .np-action-btn.danger:hover { background: #fff5f5; color: #b91c1c; border-color: #fca5a5; }

        .np-list { overflow-y: auto; flex: 1; }
        .np-list::-webkit-scrollbar { width: 4px; }
        .np-list::-webkit-scrollbar-track { background: transparent; }
        .np-list::-webkit-scrollbar-thumb { background: #e5e0d8; border-radius: 4px; }

        .np-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 48px 24px; gap: 10px; color: #b0a89e;
          font-family: 'Outfit', sans-serif; font-size: 13.5px;
        }
        .np-empty-icon { opacity: 0.35; }

        .np-item {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 12px 16px; cursor: pointer;
          border-bottom: 1px solid #f5f3ef;
          transition: background 0.12s;
        }
        .np-item:last-child { border-bottom: none; }
        .np-item:hover { background: #faf8f5; }
        .np-item.unread { background: #f0f7ff; }
        .np-item.unread:hover { background: #e6f0fb; }

        .np-icon {
          flex-shrink: 0; width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }

        .np-content { flex: 1; min-width: 0; }
        .np-item-title {
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
          color: #1a1a1a; margin-bottom: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .np-item-body {
          font-family: 'Outfit', sans-serif; font-size: 12px; color: #5a5550;
          line-height: 1.45; display: -webkit-box;
          -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .np-item-time {
          font-family: 'Outfit', sans-serif; font-size: 10.5px; color: #b0a89e;
          margin-top: 3px; flex-shrink: 0;
        }

        .np-unread-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #2E8BC0; flex-shrink: 0; margin-top: 7px;
        }

        @media (max-width: 480px) {
          .np-panel { width: calc(100vw - 32px); right: -100px; }
        }
      `}</style>

      <div className="np-wrap" ref={panelRef}>
        {/* Bell button */}
        <button
          className={`np-bell${unread > 0 ? " has-unread" : ""}`}
          onClick={() => setOpen((o) => !o)}
          title="Notifications"
          type="button"
        >
          <Bell size={17} strokeWidth={2} />
          {unread > 0 && (
            <span className="np-badge">{unread > 99 ? "99+" : unread}</span>
          )}
        </button>

        {/* Panel */}
        {open && (
          <div className="np-panel">
            {/* Header */}
            <div className="np-head">
              <div className="np-head-title">
                Notifications{unread > 0 ? ` (${unread})` : ""}
              </div>
              <div className="np-head-actions">
                {unread > 0 && (
                  <button className="np-action-btn" onClick={handleMarkAllRead} type="button">
                    <CheckCheck size={11} strokeWidth={2.5} />
                    Mark all read
                  </button>
                )}
                {notifs.length > 0 && (
                  <button
                    className="np-action-btn danger"
                    onClick={handleClearAll}
                    disabled={clearing}
                    type="button"
                  >
                    <Trash2 size={11} strokeWidth={2.5} />
                    {clearing ? "Clearing…" : "Clear all"}
                  </button>
                )}
                <button className="np-action-btn" onClick={() => setOpen(false)} type="button">
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="np-list">
              {notifs.length === 0 ? (
                <div className="np-empty">
                  <Bell size={32} strokeWidth={1.5} className="np-empty-icon" />
                  <span>You're all caught up</span>
                </div>
              ) : (
                notifs.map((n) => (
                  <div
                    key={n.id}
                    className={`np-item${!n.read ? " unread" : ""}`}
                    onClick={() => handleClickNotif(n)}
                  >
                    {/* Type icon */}
                    <div
                      className="np-icon"
                      style={{ background: typeColor(n.type) + "1a", color: typeColor(n.type) }}
                    >
                      {typeIcon(n.type)}
                    </div>

                    {/* Content */}
                    <div className="np-content">
                      <div className="np-item-title">{n.title}</div>
                      <div className="np-item-body">{n.body}</div>
                      <div className="np-item-time">{relativeTime(n.createdAt)}</div>
                    </div>

                    {/* Unread dot */}
                    {!n.read && <div className="np-unread-dot" />}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
