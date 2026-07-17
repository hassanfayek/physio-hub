// Lazy-loading YouTube embed.
// The iframe is never rendered until the user clicks "Watch Video".
// Clicking "Hide Video" unmounts the iframe entirely (stops playback + frees bandwidth).

import { useState } from "react";

interface VideoEmbedProps {
  videoId: string;
  wrapperStyle?: React.CSSProperties;
  wrapperClassName?: string;
}

export function VideoEmbed({ videoId, wrapperStyle, wrapperClassName }: VideoEmbedProps) {
  const [shown, setShown] = useState(false);

  const isShorts  = videoId.startsWith("shorts:");
  const bareId    = isShorts ? videoId.slice(7) : videoId;
  const thumbUrl  = `https://img.youtube.com/vi/${bareId}/hqdefault.jpg`;
  const shortsUrl = `https://www.youtube.com/shorts/${bareId}`;

  // Shorts can't be embedded — open in YouTube instead
  if (isShorts) {
    return (
      <div style={wrapperStyle} className={wrapperClassName}>
        <a
          href={shortsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", position: "relative", borderRadius: 10, overflow: "hidden", textDecoration: "none" }}
        >
          <img
            src={thumbUrl}
            alt="Video thumbnail"
            style={{ width: "100%", display: "block", borderRadius: 10, opacity: 0.85 }}
          />
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 8,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "rgba(255,255,255,0.92)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1a1a1a">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
            <span style={{
              color: "#fff", fontSize: 12, fontWeight: 600,
              textShadow: "0 1px 4px rgba(0,0,0,0.7)", letterSpacing: 0.3,
            }}>
              Watch Short
            </span>
          </div>
        </a>
      </div>
    );
  }

  return (
    <div style={wrapperStyle} className={wrapperClassName}>
      {shown ? (
        <>
          <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden" }}>
            <iframe
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", display: "block" }}
              src={`https://www.youtube.com/embed/${bareId}?autoplay=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <button
            onClick={() => setShown(false)}
            style={{
              marginTop: 6, display: "flex", alignItems: "center", gap: 4,
              background: "none", border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              fontSize: 12, color: "#666", fontFamily: "inherit",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            Hide Video
          </button>
        </>
      ) : (
        <button
          onClick={() => setShown(true)}
          style={{
            width: "100%", position: "relative", borderRadius: 10, overflow: "hidden",
            border: "none", padding: 0, cursor: "pointer", display: "block", background: "#000",
          }}
        >
          <img
            src={thumbUrl}
            alt="Video thumbnail"
            style={{ width: "100%", display: "block", borderRadius: 10, opacity: 0.85 }}
          />
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 8,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "rgba(255,255,255,0.92)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1a1a1a">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
            <span style={{
              color: "#fff", fontSize: 12, fontWeight: 600,
              textShadow: "0 1px 4px rgba(0,0,0,0.7)", letterSpacing: 0.3,
            }}>
              Watch Video
            </span>
          </div>
        </button>
      )}
    </div>
  );
}
