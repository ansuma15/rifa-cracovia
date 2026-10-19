import { payment, site } from "../content";
import { deadlineText, formatClabe, waNumberFor, whatsappLink } from "../lib/format";
import type { NumberId } from "../lib/types";

/**
 * Primer mensaje para quien apartó un número: agradece, recuerda el plazo
 * y deja los datos de pago a la mano. Contactar es la mejor forma de saber
 * si la reserva es de alguien real.
 */
export function contactMessage(o: {
  number: NumberId;
  name: string | null;
  expiresAt: string | null;
  price: string | null;
}): string {
  const lines = [
    `¡Hola${o.name ? `, ${o.name}` : ""}! Soy ${site.organizer} 👋`,
    `Vi que apartaste el número *${o.number}* de la rifa rumbo a Cracovia. ¡Muchas gracias por tu apoyo!`,
  ];
  if (o.expiresAt) lines.push(`Tienes hasta el ${deadlineText(o.expiresAt)} para hacer tu pago${o.price ? ` de ${o.price}` : ""}.`);
  else if (o.price) lines.push(`El número cuesta ${o.price}.`);
  lines.push(`Puedes transferir a la CLABE ${formatClabe(payment.clabe)} a nombre de ${payment.holder}.`);
  lines.push("Cuando pagues, mándame tu comprobante por aquí.");
  return lines.join("\n");
}

/** Enlace de WhatsApp al participante con el mensaje ya escrito (o null si su teléfono no sirve). */
export function contactLink(phone: string | null, message: string): string | null {
  return whatsappLink(waNumberFor(phone), message);
}

/**
 * Valor para <input type="datetime-local"> (hora local del navegador),
 * p. ej. "2026-10-20T18:30". Se usa para precargar la fecha de vencimiento.
 */
export function toLocalInput(iso: string | null, fallbackHours = 72): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + fallbackHours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
