// FILE: src/utils/youtube.ts
// Parses the ways a video is stored on exercises: a bare 11-char ID, a full
// watch / youtu.be / embed URL, a full Shorts URL, or the legacy "shorts:ID".
// Shorts can't be embedded, so they are always opened on YouTube.

export interface VideoInfo {
  id:       string;       // bare 11-char ID
  isShort:  boolean;
  thumb:    string;       // hqdefault thumbnail
  watchUrl: string;       // opens on YouTube
  embedUrl: string | null; // null for Shorts
}

export function parseVideo(raw: string | null | undefined): VideoInfo | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const isShort = /youtube\.com\/shorts\//.test(s) || s.startsWith("shorts:");
  const id = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|shorts:)([A-Za-z0-9_-]{11})/)?.[1]
    ?? (/^[A-Za-z0-9_-]{11}$/.test(s) ? s : null);
  if (!id) return null;
  return {
    id, isShort,
    thumb:    `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    watchUrl: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    embedUrl: isShort ? null : `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
  };
}

/** Video for an exercise: the YouTube field first, then a YouTube link in mediaUrl. */
export function exerciseVideo(ex: { videoId?: string; mediaUrl?: string }): VideoInfo | null {
  return parseVideo(ex.videoId) ?? (/(?:youtube\.com|youtu\.be)/.test(ex.mediaUrl ?? "") ? parseVideo(ex.mediaUrl) : null);
}
