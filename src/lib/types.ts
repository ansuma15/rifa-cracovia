// Tipos compartidos. Reflejan exactamente lo que devuelve la base de datos
// (ver supabase/migrations/20261011000300_functions.sql).

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** Siempre dos dígitos y siempre texto: "00", "07", "99". Nunca un number. */
export type NumberId = `${Digit}${Digit}`;

export type PublicStatus = "available" | "reserved" | "paid";

/** Una fila de public.raffle_numbers: lo único que el público puede ver. */
export interface BoardNumber {
  id: NumberId;
  status: PublicStatus;
  public_name: string | null;
  updated_at: string;
}

export interface PublicConfig {
  registrations_open: boolean;
  price_per_number: number | null;
  currency: string;
  reservation_hours: number | null;
}

export type ClaimError =
  | "invalid_input"
  | "raffle_closed"
  | "rate_limited"
  | "number_unavailable"
  | "invalid_code";

export type ClaimResult =
  | {
      ok: true;
      number: NumberId;
      first_name: string;
      status: "reserved";
      expires_at: string | null;
      price: number | null;
      currency: string;
    }
  | { ok: false; error: ClaimError };

/**
 * Resultado de intentar registrar, desde el punto de vista de la interfaz.
 * "unknown" es crucial: si la red falla DESPUÉS de enviar la solicitud, no
 * sabemos si el servidor la procesó. Nunca se muestra como éxito ni como fallo.
 */
export type ClaimOutcome =
  | { kind: "server"; result: ClaimResult }
  | { kind: "unknown"; message: string }
  | { kind: "not_configured" };
