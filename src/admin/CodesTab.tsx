import { useState, type FormEvent } from "react";
import type { NumberId } from "../lib/types";
import { adminApi, type AdminCode } from "./api";
import type { RunAction } from "./Dashboard";
import { parseNumberList } from "./numbers";
import styles from "./Admin.module.css";

interface Props {
  codes: AdminCode[]; // solo los vigentes (issued)
  run: RunAction;
  generate: (numbers: NumberId[] | null) => Promise<boolean>;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

export function CodesTab({ codes, run, generate }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = input.trim() ? parseNumberList(input) : null;

  const onGenerate = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseNumberList(input);
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setBusy(true);
    if (await generate(parsed.numbers)) setInput("");
    setBusy(false);
  };

  const onGenerateAll = async () => {
    if (!window.confirm("Se generará un código para CADA número disponible que todavía no tenga uno. ¿Continuar?")) return;
    setBusy(true);
    await generate(null);
    setBusy(false);
  };

  const pendingDelivery = codes.filter((c) => !c.delivered_at);
  const delivered = codes.filter((c) => c.delivered_at);

  return (
    <>
      <form className={styles.genForm} onSubmit={onGenerate}>
        <label className={styles.field}>
          <span>Números para los que quieres generar código</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ej. 7, 25, 31-35"
            inputMode="numeric"
            aria-describedby="gen-help"
          />
        </label>
        <p id="gen-help" className={styles.help}>
          Separa con comas o espacios; usa guion para rangos. Solo se generan para números disponibles y sin código
          pendiente. Si alguno no cumple, no se genera ninguno.
          {preview?.ok && <> Se generarán: <strong>{preview.numbers.join(", ")}</strong>.</>}
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.rowActions}>
          <button className="btn btn-primary" disabled={busy || !input.trim()}>
            {busy ? "Generando…" : "Generar códigos"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onGenerateAll} disabled={busy}>
            Generar para todos los disponibles
          </button>
        </div>
      </form>

      <h3 className={styles.subhead}>Pendientes de entregar ({pendingDelivery.length})</h3>
      <CodeRows codes={pendingDelivery} run={run} showDeliver />
      <h3 className={styles.subhead}>Entregados, sin usar todavía ({delivered.length})</h3>
      <CodeRows codes={delivered} run={run} />
      <p className={styles.help}>
        Los códigos se guardan cifrados: el panel no puede volver a mostrarlos. Si alguien perdió el suyo, revócalo y
        genera uno nuevo para ese número.
      </p>
    </>
  );
}

function CodeRows({ codes, run, showDeliver = false }: { codes: AdminCode[]; run: RunAction; showDeliver?: boolean }) {
  if (codes.length === 0) return <p className={styles.empty}>Ninguno.</p>;
  return (
    <ul className={styles.rows}>
      {codes.map((c) => (
        <li key={c.id} className={styles.row}>
          <span className={`${styles.numBadge} ${styles.b_available}`}>{c.number_id}</span>
          <div className={styles.rowMain}>
            <p className={styles.rowMeta}>
              Generado {fmt(c.created_at)}
              {c.delivered_at && <> · entregado {fmt(c.delivered_at)}</>}
              {c.delivery_note && <> · {c.delivery_note}</>}
            </p>
          </div>
          <div className={styles.rowActions}>
            {showDeliver && (
              <button
                className={styles.smallBtn}
                onClick={() => {
                  const note = window.prompt(`¿A quién le entregaste el código del ${c.number_id}? (opcional)`) ?? null;
                  if (note === null) return;
                  void run(`Código del ${c.number_id} marcado como entregado`, () => adminApi.markDelivered(c.id, note));
                }}
              >
                Marcar entregado
              </button>
            )}
            <button
              className={styles.smallBtnDanger}
              onClick={() => {
                if (!window.confirm(`¿Revocar el código del ${c.number_id}? Dejará de funcionar.`)) return;
                void run(`Código del ${c.number_id} revocado`, () => adminApi.revokeCode(c.id, ""));
              }}
            >
              Revocar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
