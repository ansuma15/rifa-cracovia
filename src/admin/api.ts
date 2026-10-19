// Llamadas del panel. Todas pasan por funciones de la base de datos que
// verifican, en el servidor, que la sesión sea de un administrador.
import { supabase } from "../lib/supabase";
import type { NumberId, PublicStatus } from "../lib/types";

export interface AdminNumber {
  number_id: NumberId;
  status: PublicStatus;
  participation_id: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  reserved_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  amount_paid: number | null;
  payment_note: string | null;
  /** Lo marcó un administrador como confiable (solo se ve en el panel). */
  verified: boolean;
  /** Cuántos números tiene apartados sin pagar ese mismo teléfono. */
  phone_active: number | null;
}

export interface AdminStats {
  total: number;
  available: number;
  reserved: number;
  paid: number;
  confirmed_revenue: number;
  pending_revenue_estimate: number | null;
  /** Apartados que nadie ha verificado todavía. */
  unverified: number;
  /** Apartados que vencen en las próximas 24 horas. */
  expiring_24h: number;
  currency: string;
}

export interface AuditEntry {
  id: number;
  created_at: string;
  actor_label: string;
  action: string;
  number_id: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
}

/** Traduce los errores del servidor a mensajes que se pueden actuar. */
export function explainError(message: string): string {
  if (message.includes("forbidden")) return "Tu sesión no tiene permisos de administrador. Vuelve a iniciar sesión.";
  if (message.includes("no_pending_reservation")) return "Ese número ya no tiene una reserva pendiente.";
  if (message.includes("no_active_participation")) return "Ese número ya no tiene una participación activa.";
  if (message.includes("reason_required")) return "Escribe el motivo de la cancelación.";
  if (message.includes("amount_required")) return "Indica el monto recibido.";
  if (message.includes("invalid_contact")) return "Revisa el correo o el teléfono (10 dígitos), o déjalos vacíos.";
  if (message.includes("invalid_first_name")) return "El nombre solo puede tener letras, espacios, apóstrofo, punto o guion (máximo 40).";
  if (message.includes("invalid_extension"))
    return "Elige cuántas horas sumar (de 1 a 1440) o una fecha futura dentro del próximo año.";
  if (message.includes("max_active_per_phone") || message.includes("settings_max_active"))
    return "El límite por teléfono debe estar entre 1 y 100.";
  if (/fetch|network|Failed/i.test(message)) return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  return `Error del servidor: ${message}`;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(explainError(error.message));
  return data as T;
}

export const adminApi = {
  isAdmin: () => rpc<boolean>("is_admin"),
  listNumbers: () => rpc<AdminNumber[]>("admin_list_numbers"),
  stats: () => rpc<AdminStats>("admin_get_stats"),
  audit: (limit = 100) => rpc<AuditEntry[]>("admin_list_audit", { p_limit: limit }),
  markPaid: (n: NumberId, amount: number | null, note: string) =>
    rpc<void>("admin_mark_paid", { p_number: n, p_amount: amount, p_note: note || null }),
  /** Extiende el plazo: suma horas o fija una fecha exacta (ISO). Devuelve el nuevo vencimiento. */
  extend: (n: NumberId, by: { hours: number } | { until: string }) =>
    rpc<string>("admin_extend_reservation", {
      p_number: n,
      p_hours: "hours" in by ? by.hours : null,
      p_until: "until" in by ? by.until : null,
    }),
  setVerified: (n: NumberId, verified: boolean) =>
    rpc<void>("admin_set_verified", { p_number: n, p_verified: verified }),
  cancel: (n: NumberId, reason: string) => rpc<void>("admin_cancel_participation", { p_number: n, p_reason: reason }),
  updateParticipant: (n: NumberId, firstName: string, email: string, phone: string, notes: string) =>
    rpc<void>("admin_update_participant", {
      p_number: n,
      p_first_name: firstName,
      p_email: email.trim() || null,
      p_phone: phone.trim() || null,
      p_notes: notes || null,
    }),
  updateSettings: (patch: Record<string, unknown>) => rpc<unknown>("admin_update_settings", { p_patch: patch }),
};
