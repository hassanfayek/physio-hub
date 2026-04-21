/**
 * Normalizes a phone number to E.164-ish format for storage and links.
 *
 * Rules (Egyptian clinic default, +20 country code):
 *   01XXXXXXXXX  (11 digits, leading 0)  → 201XXXXXXXXX
 *   201XXXXXXXXX (12 digits, already ok)  → 201XXXXXXXXX
 *   002XXXXXXXXX (IDD prefix)             → 20XXXXXXXXX
 *   +20XXXXXXXXX                          → 20XXXXXXXXX
 *   Any other number                      → digits only, unchanged
 *
 * Returns empty string if input is empty/whitespace.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // Strip leading IDD (00) then treat like +XX
  const stripped = digits.startsWith("00") ? digits.slice(2) : digits;

  // Egyptian local mobile: 01XXXXXXXXX (11 digits)
  if (stripped.startsWith("1") && stripped.length === 10) return `20${stripped}`;
  if (stripped.startsWith("01") && stripped.length === 11) return `20${stripped.slice(1)}`;

  return stripped;
}

/** Human-readable display: +20 1XX XXX XXXX, else formatted as +{digits} */
export function formatPhoneDisplay(raw: string): string {
  const n = normalizePhone(raw);
  if (!n) return "";

  if (n.startsWith("20") && n.length === 12) {
    // +20 1XX XXX XXXX
    return `+20 ${n[2]}${n[3]}${n[4]} ${n[5]}${n[6]}${n[7]} ${n[8]}${n[9]}${n[10]}${n[11]}`;
  }
  return `+${n}`;
}

/** URL-safe digits for wa.me and tel: links */
export function phoneForLink(raw: string): string {
  return normalizePhone(raw);
}
