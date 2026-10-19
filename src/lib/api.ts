// Único módulo que habla con Supabase. Los componentes nunca llaman a
// supabase.from(...) directamente: así es fácil auditar qué se pide.
import { supabase } from "./supabase";
import { toBoardMap } from "./board";
import type { BoardNumber, ClaimOutcome, ClaimResult, NumberId, PublicConfig } from "./types";

export class NotConfiguredError extends Error {
  constructor() {
    super("Supabase todavía no está configurado.");
  }
}

export async function fetchBoard(): Promise<Map<NumberId, BoardNumber>> {
  if (!supabase) throw new NotConfiguredError();
  const { data, error } = await supabase
    .from("raffle_numbers")
    .select("id,status,public_name,updated_at")
    .order("id");
  if (error) throw new Error(error.message);
  return toBoardMap(data);
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  if (!supabase) throw new NotConfiguredError();
  const { data, error } = await supabase.rpc("get_public_config");
  if (error) throw new Error(error.message);
  return data as PublicConfig;
}

/**
 * Envía el registro. Distingue tres situaciones:
 *  - el servidor respondió (éxito o rechazo con motivo),
 *  - no sabemos qué pasó (fallo de red tras enviar),
 *  - no hay conexión configurada.
 */
export async function claimNumber(
  number: NumberId,
  firstName: string,
  phone: string,
  email = "",
): Promise<ClaimOutcome> {
  if (!supabase) return { kind: "not_configured" };
  try {
    // Teléfono obligatorio, correo opcional; ambos privados (migración 8).
    const args: Record<string, string> = { p_number: number, p_first_name: firstName, p_phone: phone.trim() };
    if (email.trim()) args.p_email = email.trim();
    const { data, error } = await supabase.rpc("claim_number", args);
    if (error) {
      return {
        kind: "unknown",
        message: "El servidor no respondió como esperábamos.",
      };
    }
    return { kind: "server", result: data as ClaimResult };
  } catch {
    return {
      kind: "unknown",
      message: "Se perdió la conexión mientras enviábamos tu registro.",
    };
  }
}
