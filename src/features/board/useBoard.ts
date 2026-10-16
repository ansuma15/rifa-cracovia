import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBoard } from "../../lib/api";
import { applyChange } from "../../lib/board";
import { supabase } from "../../lib/supabase";
import type { BoardNumber, NumberId } from "../../lib/types";

/** Cada cuánto se recarga el tablero si el canal en vivo no está disponible. */
const POLL_MS = 30_000;

export type BoardPhase = "unconfigured" | "loading" | "ready" | "error";
/** live: Realtime conectado · polling: recargas periódicas · offline: sin red */
export type SyncMode = "live" | "polling" | "offline";

export interface BoardState {
  phase: BoardPhase;
  board: Map<NumberId, BoardNumber> | null;
  error: string | null;
  sync: SyncMode;
  lastSync: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Fuente única del estado del tablero en la interfaz.
 *
 * Estrategia de actualización (de más a menos inmediata):
 *  1. Realtime: Supabase avisa cada cambio de public.raffle_numbers.
 *  2. Recarga completa al (re)conectar el canal, al volver a la pestaña y al
 *     recuperar la red. Cubre los cambios que ocurrieron mientras no
 *     escuchábamos (Realtime no reenvía eventos perdidos).
 *  3. Si el canal falla, recarga cada 30 s hasta que vuelva.
 * Las 100 filas pesan unos pocos KB, así que recargar completo es barato y
 * evita cualquier deriva entre lo que ve el visitante y la base de datos.
 */
export function useBoard(): BoardState {
  const [phase, setPhase] = useState<BoardPhase>(supabase ? "loading" : "unconfigured");
  const [board, setBoard] = useState<Map<NumberId, BoardNumber> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncMode>("polling");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    // Evita recargas simultáneas (p. ej. "online" y "visibilitychange" a la vez).
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const map = await fetchBoard();
        setBoard(map);
        setError(null);
        setPhase("ready");
        setLastSync(new Date());
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el tablero.");
        // Si ya teníamos datos, se conservan y se marcan como posiblemente viejos.
        setPhase((p) => (p === "ready" ? "ready" : "error"));
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let pollTimer: number | undefined;
    const startPolling = () => {
      if (pollTimer === undefined) pollTimer = window.setInterval(refresh, POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      pollTimer = undefined;
    };

    void refresh();

    const channel = client
      .channel("public:raffle_numbers")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "raffle_numbers" },
        (payload) => {
          setBoard((current) => (current ? applyChange(current, payload.new) : current));
          setLastSync(new Date());
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSync("live");
          stopPolling();
          void refresh(); // llena el hueco entre la carga inicial y la suscripción
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setSync(navigator.onLine ? "polling" : "offline");
          startPolling();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => {
      setSync((s) => (s === "offline" ? "polling" : s));
      void refresh();
    };
    const onOffline = () => setSync("offline");

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void client.removeChannel(channel);
    };
  }, [refresh]);

  return { phase, board, error, sync, lastSync, refresh };
}
