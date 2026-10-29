// FILE: src/features/inquiries/ContactButtons.tsx
// WhatsApp + call shortcuts for an inquiry (same number handling as the schedule:
// 01XXXXXXXXX → +20…). Opens WhatsApp only; nothing is sent automatically.

import { MessageCircle, Phone } from "lucide-react";
import { phoneForLink } from "../../utils/phone";

export default function ContactButtons({ phone, labels = false }: { phone: string; labels?: boolean }) {
  const ph = phoneForLink(phone);
  if (!ph) return null;
  return (
    <span className="iq-contact" onClick={(e) => e.stopPropagation()}>
      <a className="iq-wa" href={`https://wa.me/${ph}`} target="_blank" rel="noreferrer" title="Open WhatsApp chat">
        <MessageCircle size={14} strokeWidth={2.3} />{labels && " WhatsApp"}
      </a>
      <a className="iq-icon" href={`tel:+${ph}`} title="Call"><Phone size={14} />{labels && " Call"}</a>
    </span>
  );
}
