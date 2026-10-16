import { useEffect, useState } from "react";
import { fetchPublicConfig } from "./api";
import { supabase } from "./supabase";
import type { PublicConfig } from "./types";

/**
 * Precio, moneda y estado del registro, leídos de la base de datos.
 * El precio NO está escrito en el código: si el administrador lo cambia,
 * el sitio lo refleja sin volver a desplegar.
 */
export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    fetchPublicConfig()
      .then((c) => alive && setConfig(c))
      .catch(() => alive && setConfig(null)); // sin precio visible antes que un precio inventado
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

export function formatPrice(config: PublicConfig | null): string | null {
  if (!config || config.price_per_number == null) return null;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: config.currency,
    maximumFractionDigits: 0,
  }).format(Number(config.price_per_number));
}
