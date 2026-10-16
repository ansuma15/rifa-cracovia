// Llamadas del panel. Todas pasan por funciones de la base de datos que
// verifican, en el servidor, que la sesión sea de un administrador.
import { supabase } from "../lib/supabase";
import type { NumberId, PublicStatus } from "../lib/types";

export interface AdminNumber {
  number_id: NumberId;
  status: PublicStatus;
  participation_id: string | null;
  first_name: string | null;
  contact: string | null;
  notes: string | null;
  reserved_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  amount_paid: number | null;
  payment_note: string | null;
  active_code_id: string | null;
  active_code_delivered: boolean;
}

export interface AdminCode {
  id: string;
  number_id: NumberId;
  status: "issued" | "consumed" | "revoked";
  created_at: string;
  delivered_at: string | null;
  delivery_note: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface GeneratedCode {
  number_id: NumberId;
  code: string;
  code_id: string;
}

export interface AdminStats {
  total: number;
  available: number;
  reserved: number;
  paid: number;
  confirmed_revenue: number;
  pending_revenue_estimate: number | null;
  codes_issued: number;
  codes_undelivered: number;
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
  const notEligible = message.match(/not_eligible: ([\d,]+)/);
  if (notEligible) {
    return `No se generó ningún código: ${notEligible[1]!.split(",").join(", ")} no está disponible o ya tiene un código sin usar. Revoca ese código primero si quieres reemplazarlo.`;
  }
  if (message.includes("no_pending_reservation")) return "Ese número ya no tiene una reserva pendiente.";
  if (message.includes("no_active_participation")) return "Ese número ya no tiene una participación activa.";
  if (message.includes("reason_required")) return "Escribe el motivo de la cancelación.";
  if (message.includes("amount_required")) return "Indica el monto recibido.";
  if (message.includes("invalid_first_name")) return "El nombre solo puede tener letras, espacios, apóstrofo, punto o guion (máximo 40).";
  if (message.includes("code_not_revocable") || message.includes("code_not_pending"))
    return "Ese código ya se usó o ya estaba revocado.";
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
  listCodes: (status?: AdminCode["status"]) => rpc<AdminCode[]>("admin_list_codes", { p_status: status ?? null }),
  audit: (limit = 100) => rpc<AuditEntry[]>("admin_list_audit", { p_limit: limit }),
  generateCodes: (numbers: NumberId[] | null) => rpc<GeneratedCode[]>("admin_generate_codes", { p_numbers: numbers }),
  revokeCode: (codeId: string, reason: string) => rpc<void>("admin_revoke_code", { p_code_id: codeId, p_reason: reason || null }),
  markDelivered: (codeId: string, note: string) =>
    rpc<void>("admin_mark_code_delivered", { p_code_id: codeId, p_note: note || null }),
  markPaid: (n: NumberId, amount: number | null, note: string) =>
    rpc<void>("admin_mark_paid", { p_number: n, p_amount: amount, p_note: note || null }),
  cancel: (n: NumberId, reason: string) => rpc<void>("admin_cancel_participation", { p_number: n, p_reason: reason }),
  updateParticipant: (n: NumberId, firstName: string, contact: string, notes: string) =>
    rpc<void>("admin_update_participant", {
      p_number: n,
      p_first_name: firstName,
      p_contact: contact || null,
      p_notes: notes || null,
    }),
  updateSettings: (patch: Record<string, unknown>) => rpc<unknown>("admin_update_settings", { p_patch: patch }),
};
