import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Se acepta el nombre nuevo (publishable) y el anterior (anon). Ambos son públicos.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/**
 * Cliente único de Supabase, o null si faltan las variables de entorno.
 * Con null la interfaz muestra "conexión pendiente": nunca simula datos.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null;

export const isConfigured = supabase !== null;
