import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { adminApi, type AdminNumber, type AdminStats, type AuditEntry } from "./api";
import { HistoryTab } from "./HistoryTab";
import { NumbersTab } from "./NumbersTab";
import { SettingsTab } from "./SettingsTab";
import styles from "./Admin.module.css";

type Tab = "numeros" | "historial" | "ajustes";

export interface AdminData {
  numbers: AdminNumber[];
  stats: AdminStats | null;
  audit: AuditEntry[];
}

/** Resultado de una acción: se muestra como aviso breve en la parte superior. */
export type RunAction = (label: string, fn: () => Promise<unknown>) => Promise<boolean>;

export function Dashboard({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("numeros");
  const [data, setData] = useState<AdminData>({ numbers: [], stats: null, audit: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const reloadTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const [numbers, stats, audit] = await Promise.all([
        adminApi.listNumbers(),
        adminApi.stats(),
        adminApi.audit(100),
      ]);
      setData({ numbers, stats, audit });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Carga inicial + recarga cuando cambia el tablero (registros de participantes).
  useEffect(() => {
    void reload();
    if (!supabase) return;
    const channel = supabase
      .channel("admin:raffle_numbers")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "raffle_numbers" }, () => {
        window.clearTimeout(reloadTimer.current);
        reloadTimer.current = window.setTimeout(() => void reload(), 400); // agrupa ráfagas de cambios
      })
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase?.removeChannel(channel);
    };
  }, [reload]);

  const run: RunAction = useCallback(
    async (label, fn) => {
      try {
        await fn();
        setToast({ kind: "ok", text: label });
        await reload();
        return true;
      } catch (e) {
        setToast({ kind: "error", text: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },
    [reload],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === "ok" ? 3000 : 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const s = data.stats;
  const money = (n: number | null | undefined) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("es-MX", { style: "currency", currency: s?.currency ?? "MXN", maximumFractionDigits: 0 }).format(
          Number(n),
        );

  const TABS: { id: Tab; label: string }[] = [
    { id: "numeros", label: "Números" },
    { id: "historial", label: "Historial" },
    { id: "ajustes", label: "Ajustes" },
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <div className={`wrap ${styles.topInner}`}>
          <div>
            <p className={styles.brand}>Panel de la rifa</p>
            <p className={styles.who}>{email}</p>
          </div>
          <div className={styles.topActions}>
            <a className="btn btn-ghost" href={import.meta.env.BASE_URL} target="_blank" rel="noopener">
              Ver sitio público
            </a>
            <button className="btn btn-ghost" onClick={onSignOut}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="wrap">
        {toast && (
          <p className={toast.kind === "ok" ? styles.toastOk : styles.toastError} role={toast.kind === "ok" ? "status" : "alert"}>
            {toast.text}
          </p>
        )}
        {loadError && (
          <p className={styles.toastError} role="alert">
            {loadError}{" "}
            <button className={styles.linkBtn} onClick={() => void reload()}>
              Reintentar
            </button>
          </p>
        )}

        <dl className={styles.stats}>
          <Stat label="Disponibles" value={s?.available} />
          <Stat label="Apartados (por cobrar)" value={s?.reserved} tone="ticket" />
          <Stat label="Por revisar" value={s?.unverified} tone="ticket" />
          <Stat label="Pagados" value={s?.paid} tone="paid" />
          <Stat label="Recaudación confirmada" value={money(s?.confirmed_revenue)} />
          <Stat label="Por cobrar" value={money(s?.pending_revenue_estimate ?? 0)} />
        </dl>

        <nav className={styles.tabs} aria-label="Secciones del panel">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? styles.tabActive : styles.tab}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className={styles.panel}>
          {tab === "numeros" && <NumbersTab numbers={data.numbers} run={run} />}
          {tab === "historial" && <HistoryTab audit={data.audit} />}
          {tab === "ajustes" && <SettingsTab run={run} />}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string | undefined; tone?: "ticket" | "paid" }) {
  return (
    <div className={`${styles.stat} ${tone === "ticket" ? styles.statTicket : tone === "paid" ? styles.statPaid : ""}`}>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}
