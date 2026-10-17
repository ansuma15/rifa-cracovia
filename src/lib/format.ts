// Utilidades de presentación, puras y probadas (format.test.ts).
import type { PublicConfig } from "./types";

/** Verifica el dígito de control de una CLABE de 18 dígitos (pesos 3, 7, 1). */
export function isValidClabe(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  const w = [3, 7, 1];
  const sum = [...clabe.slice(0, 17)].reduce((acc, d, i) => acc + ((Number(d) * w[i % 3]!) % 10), 0);
  return (10 - (sum % 10)) % 10 === Number(clabe[17]);
}

/** "646990404078801466" → "6469 9040 4078 8014 66": de 4 en 4, fácil de leer y dictar. */
export function formatClabe(clabe: string): string {
  return clabe.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Extrae el id de cualquier enlace de YouTube (youtu.be, watch?v=, shorts, embed). */
export function youtubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  if (m) return m[1]!;
  return /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null;
}

/** Horas de reserva: 72 si aún no carga la configuración; null si no expiran. */
export function holdHours(config: PublicConfig | null): number | null {
  if (!config) return 72;
  return config.reservation_hours == null ? null : Number(config.reservation_hours);
}

/** "72 horas", "1 hora", "3 días" */
export function hoursText(h: number): string {
  if (h >= 48 && h % 24 === 0) return `${h} horas`;
  return h === 1 ? "1 hora" : `${h} horas`;
}

/** "sábado 18 de octubre, 6:44 p.m." */
export function deadlineText(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Normaliza el teléfono como el servidor: dígitos y "+" inicial. */
export function normalizePhone(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return (t.startsWith("+") ? "+" : "") + t.replace(/\D/g, "");
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
export const PHONE_RAW_RE = /^[0-9+ ()\-.]+$/;

export function contactErrors(email: string, phone: string): { email?: string; phone?: string } {
  const out: { email?: string; phone?: string } = {};
  const e = email.trim().toLowerCase();
  if (e && (e.length > 120 || !EMAIL_RE.test(e))) out.email = "Revisa el correo, por ejemplo nombre@gmail.com.";
  const p = phone.trim();
  if (p && (!PHONE_RAW_RE.test(p) || !/^\+?\d{8,15}$/.test(normalizePhone(p))))
    out.phone = "Escribe un teléfono de 10 dígitos, por ejemplo 55 1234 5678.";
  return out;
}

/** Enlace de WhatsApp con el mensaje listo para adjuntar el comprobante. */
export function receiptLink(whatsapp: string | null, number?: string, name?: string): string | null {
  if (!whatsapp || !/^\d{8,15}$/.test(whatsapp)) return null;
  const parts = ["Hola, te comparto mi comprobante de pago de la rifa."];
  if (number) parts.push(`Número: ${number}.`);
  if (name) parts.push(`Nombre: ${name}.`);
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(parts.join(" "))}`;
}

/**
 * Enlace de WhatsApp para pedir el código de un número. Cada código sirve
 * para un solo número, así que el mensaje ya lleva el número si se conoce;
 * si no, deja el espacio "__" para que la persona lo escriba.
 */
export function codeRequestLink(whatsapp: string | null, number?: string): string | null {
  if (!whatsapp || !/^\d{8,15}$/.test(whatsapp)) return null;
  const text = `Hola, quiero reservar el número ${number ?? "__"} de la rifa rumbo a Cracovia. ¿Me compartes mi código?`;
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
}
