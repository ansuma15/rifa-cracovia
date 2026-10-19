import { useMemo, useState, type FormEvent } from "react";
import { fold, STATUS_LABEL } from "../lib/board";
import { formatPrice, usePublicConfig } from "../lib/usePublicConfig";
import { adminApi, type AdminNumber } from "./api";
import type { RunAction } from "./Dashboard";
import { Modal } from "./Modal";
import { contactLink, contactMessage, toLocalInput } from "./numbers";
import styles from "./Admin.module.css";

/**
 * Filtros pensados para el trabajo diario:
 *   Por revisar  → apartados que nadie ha verificado (lo primero que hay que atender)
 *   Por cobrar   → todos los apartados sin pagar
 *   Vencen pronto→ apartados que vencen en menos de 24 horas
 * En los tres, primero aparecen los que vencen antes.
 */
type Filter = "review" | "reserved" | "soon" | "paid" | "available" | "all";
type Action =
  | { kind: "pay"; n: AdminNumber }
  | { kind: "cancel"; n: AdminNumber }
  | { kind: "edit"; n: AdminNumber }
  | { kind: "extend"; n: AdminNumber };

const DAY = 24 * 3_600_000;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—";
const soon = (n: AdminNumber) =>
  n.status === "reserved" && n.expires_at != null && Date.parse(n.expires_at) - Date.now() < DAY;
const byDeadline = (a: AdminNumber, b: AdminNumber) =>
  (a.expires_at ? Date.parse(a.expires_at) : Infinity) - (b.expires_at ? Date.parse(b.expires_at) : Infinity);

export function NumbersTab({ numbers, run }: { numbers: AdminNumber[]; run: RunAction }) {
  const config = usePublicConfig();
  const price = formatPrice(config);
  const [filter, setFilter] = useState<Filter>("review");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<Action | null>(null);

  const counts = useMemo(() => {
    const c = { all: numbers.length, available: 0, reserved: 0, paid: 0, review: 0, soon: 0 };
    for (const n of numbers) {
      c[n.status] += 1;
      if (n.status === "reserved" && !n.verified) c.review += 1;
      if (soon(n)) c.soon += 1;
    }
    return c;
  }, [numbers]);

  const visible = useMemo(() => {
    const q = fold(query);
    const list = numbers.filter((n) => {
      if (filter === "review" && !(n.status === "reserved" && !n.verified)) return false;
      if (filter === "soon" && !soon(n)) return false;
      if ((filter === "reserved" || filter === "paid" || filter === "available") && n.status !== filter) return false;
      if (!q) return true;
      if (/^\d{1,2}$/.test(q)) return n.number_id === q.padStart(2, "0");
      return [n.first_name, n.email, n.phone].some((v) => fold(v ?? "").includes(q));
    });
    return filter === "review" || filter === "reserved" || filter === "soon" ? [...list].sort(byDeadline) : list;
  }, [numbers, filter, query]);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "review", label: `Por revisar (${counts.review})` },
    { id: "reserved", label: `Por cobrar (${counts.reserved})` },
    { id: "soon", label: `Vencen en 24 h (${counts.soon})` },
    { id: "paid", label: `Pagados (${counts.paid})` },
    { id: "available", label: `Disponibles (${counts.available})` },
    { id: "all", label: `Todos (${counts.all})` },
  ];

  const EMPTY: Record<Filter, string> = {
    review: "Nada por revisar: todos los apartados ya están verificados.",
    reserved: "No hay reservas pendientes de pago.",
    soon: "Ninguna reserva vence en las próximas 24 horas.",
    paid: "Todavía no hay pagos confirmados.",
    available: "No quedan números disponibles.",
    all: "No hay números que coincidan.",
  };

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Filtrar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={filter === f.id ? styles.chipActive : styles.chip}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className={styles.search}
          type="search"
          placeholder="Buscar número, nombre, correo o teléfono"
          aria-label="Buscar número, nombre, correo o teléfono"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>{query ? "No hay números que coincidan." : EMPTY[filter]}</p>
      ) : (
        <ul className={styles.rows}>
          {visible.map((n) => {
            const wa =
              n.status !== "available"
                ? contactLink(n.phone, contactMessage({ number: n.number_id, name: n.first_name, expiresAt: n.expires_at, price }))
                : null;
            return (
              <li key={n.number_id} className={styles.row}>
                <span className={`${styles.numBadge} ${styles[`b_${n.status}`]}`}>{n.number_id}</span>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {n.first_name ?? <span className={styles.muted}>Libre</span>}
                    <span className={`${styles.pill} ${styles[`p_${n.status}`]}`}>
                      {n.status === "reserved" ? "Por cobrar" : n.status === "paid" ? "Pagado" : STATUS_LABEL[n.status]}
                    </span>
                    {n.status !== "available" &&
                      (n.verified ? (
                        <span className={`${styles.pill} ${styles.p_verified}`}>✓ Verificado</span>
                      ) : (
                        n.status === "reserved" && <span className={`${styles.pill} ${styles.p_review}`}>Sin verificar</span>
                      ))}
                  </p>
                  <p className={styles.rowMeta}>
                    {n.status === "reserved" && <Deadline reservedAt={n.reserved_at} expiresAt={n.expires_at} />}
                    {n.status === "paid" &&
                      `Pagado: ${fmtDate(n.paid_at)}${n.amount_paid != null ? ` · $${Number(n.amount_paid).toLocaleString("es-MX")}` : ""}`}
                  </p>
                  {(n.email || n.phone) && (
                    <p className={styles.rowContact}>
                      {n.phone && <a href={`tel:${n.phone}`}>{n.phone}</a>}
                      {n.email && <a href={`mailto:${n.email}`}>{n.email}</a>}
                    </p>
                  )}
                  {n.status === "reserved" && n.phone_active != null && n.phone_active > 1 && (
                    <p className={n.phone_active >= 3 ? styles.phoneWarn : styles.rowNote}>
                      Este teléfono tiene {n.phone_active} números apartados sin pagar.
                    </p>
                  )}
                  {(n.notes || n.payment_note) && (
                    <p className={styles.rowNote}>{[n.payment_note, n.notes].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {n.status !== "available" && (
                  <div className={styles.rowActions}>
                    {wa && (
                      <a className={styles.smallBtnWa} href={wa} target="_blank" rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    )}
                    {n.status === "reserved" && (
                      <>
                        <button className={styles.smallBtnPrimary} onClick={() => setAction({ kind: "pay", n })}>
                          Marcar pagado
                        </button>
                        <button
                          className={styles.smallBtn}
                          onClick={() =>
                            void run(
                              n.verified ? `El ${n.number_id} quedó sin verificar` : `El ${n.number_id} quedó verificado`,
                              () => adminApi.setVerified(n.number_id, !n.verified),
                            )
                          }
                        >
                          {n.verified ? "Quitar verificado" : "Verificar"}
                        </button>
                        <button className={styles.smallBtn} onClick={() => setAction({ kind: "extend", n })}>
                          Extender plazo
                        </button>
                      </>
                    )}
                    <button className={styles.smallBtn} onClick={() => setAction({ kind: "edit", n })}>
                      Editar
                    </button>
                    <button className={styles.smallBtnDanger} onClick={() => setAction({ kind: "cancel", n })}>
                      {n.status === "reserved" ? "Liberar" : "Cancelar"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ActionModal action={action} onClose={() => setAction(null)} run={run} defaultAmount={config?.price_per_number ?? null} />
    </>
  );
}

interface ModalProps {
  action: Action | null;
  onClose: () => void;
  run: RunAction;
  defaultAmount: number | null;
}

function ActionModal({ action, onClose, run, defaultAmount }: ModalProps) {
  const amountDefault = defaultAmount != null ? String(Number(defaultAmount)) : "";
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(amountDefault);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [until, setUntil] = useState("");

  // Reinicia el formulario al abrir otra acción.
  const key = action ? `${action.kind}-${action.n.number_id}` : "";
  const [lastKey, setLastKey] = useState("");
  if (key !== lastKey) {
    setLastKey(key);
    setText(action?.kind === "edit" ? action.n.notes ?? "" : "");
    setName(action?.n.first_name ?? "");
    setEmail(action?.n.email ?? "");
    setPhone(action?.n.phone ?? "");
    setAmount(amountDefault);
    setUntil(toLocalInput(action?.n.expires_at ?? null));
  }

  if (!action) return <Modal title="" open={false} onClose={onClose}>{null}</Modal>;
  const { n } = action;

  const finish = (ok: boolean) => {
    setBusy(false);
    if (ok) onClose();
  };

  const extendBy = async (hours: number) => {
    setBusy(true);
    finish(await run(`Plazo del ${n.number_id} extendido ${hours} horas`, () => adminApi.extend(n.number_id, { hours })));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    let ok = false;
    if (action.kind === "pay") {
      const value = amount.trim() === "" ? null : Number(amount);
      ok = await run(`Pago del ${n.number_id} confirmado`, () => adminApi.markPaid(n.number_id, value, text));
    } else if (action.kind === "cancel") {
      ok = await run(`El ${n.number_id} quedó libre`, () => adminApi.cancel(n.number_id, text));
    } else if (action.kind === "edit") {
      ok = await run(`Datos del ${n.number_id} actualizados`, () =>
        adminApi.updateParticipant(n.number_id, name, email, phone, text),
      );
    } else if (action.kind === "extend") {
      const when = new Date(until);
      ok = await run(`Nuevo plazo del ${n.number_id}: ${fmtDate(when.toISOString())}`, () =>
        adminApi.extend(n.number_id, { until: when.toISOString() }),
      );
    }
    finish(ok);
  };

  const titles = {
    pay: `Confirmar pago del ${n.number_id}`,
    cancel: n.status === "reserved" ? `Liberar el ${n.number_id}` : `Cancelar el ${n.number_id}`,
    edit: `Editar el ${n.number_id}`,
    extend: `Extender el plazo del ${n.number_id}`,
  };

  return (
    <Modal title={titles[action.kind]} open onClose={onClose} busy={busy}>
      <form onSubmit={submit} className={styles.form}>
        {action.kind === "pay" && (
          <>
            <p className={styles.modalText}>
              {n.first_name} pasará a <strong>pagado</strong> (y quedará verificado). Esta acción no se puede revertir:
              si te equivocas, tendrás que cancelar y apartar el número otra vez.
            </p>
            <label className={styles.field}>
              <span>Monto recibido (MXN)</span>
              <input type="number" inputMode="decimal" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <label className={styles.field}>
              <span>Nota (opcional)</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Ej. transferencia, efectivo" />
            </label>
          </>
        )}

        {action.kind === "cancel" && (
          <>
            <p className={styles.modalText}>
              Se cancela la participación de <strong>{n.first_name}</strong>
              {n.status === "paid" && (
                <>
                  {" "}
                  (ya estaba <strong>pagada</strong>)
                </>
              )}{" "}
              y el {n.number_id} vuelve a estar disponible para cualquiera.
            </p>
            <label className={styles.field}>
              <span>Motivo (obligatorio, queda en el historial)</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={300}
                placeholder={n.status === "reserved" ? "Ej. reserva falsa, no respondió" : ""}
                required
              />
            </label>
          </>
        )}

        {action.kind === "edit" && (
          <>
            <label className={styles.field}>
              <span>Nombre de pila (público)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
            </label>
            <label className={styles.field}>
              <span>Teléfono (privado)</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={25} />
            </label>
            <label className={styles.field}>
              <span>Correo (privado)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
            </label>
            <label className={styles.field}>
              <span>Notas (privadas)</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            </label>
          </>
        )}

        {action.kind === "extend" && (
          <>
            <p className={styles.modalText}>
              Vence: <strong>{n.expires_at ? fmtDate(n.expires_at) : "sin vencimiento"}</strong>. Úsalo en casos
              especiales; queda registrado en el historial.
            </p>
            <div className={styles.presets} role="group" aria-label="Sumar tiempo al plazo actual">
              {[24, 48, 72].map((h) => (
                <button key={h} type="button" className="btn btn-ghost" disabled={busy} onClick={() => void extendBy(h)}>
                  +{h} h
                </button>
              ))}
            </div>
            <label className={styles.field}>
              <span>O elige la fecha y hora exactas</span>
              <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} required />
            </label>
          </>
        )}

        <div className={styles.modalActions}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Volver
          </button>
          <button className={`btn ${action.kind === "cancel" ? styles.btnDanger : "btn-primary"}`} disabled={busy}>
            {busy
              ? "Guardando…"
              : {
                  pay: "Confirmar pago",
                  cancel: n.status === "reserved" ? "Liberar número" : "Cancelar participación",
                  edit: "Guardar cambios",
                  extend: "Guardar fecha",
                }[action.kind]}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * "Reservado: 15 oct, 6:44 p.m. · vence en 2 d 5 h". Si ya venció y el
 * proceso automático aún no lo libera (corre cada minuto), lo indica.
 */
function Deadline({ reservedAt, expiresAt }: { reservedAt: string | null; expiresAt: string | null }) {
  const base = `Apartado: ${fmtDate(reservedAt)}`;
  if (!expiresAt) return <>{base} · sin vencimiento</>;
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return <>{base} · <strong className={styles.overdue}>plazo vencido, se libera en un momento</strong></>;
  const h = Math.floor(ms / 3_600_000);
  const left = h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : h >= 1 ? `${h} h` : `${Math.max(1, Math.round(ms / 60_000))} min`;
  return (
    <>
      {base} · vence en <strong className={h < 12 ? styles.overdue : undefined}>{left}</strong>
    </>
  );
}
