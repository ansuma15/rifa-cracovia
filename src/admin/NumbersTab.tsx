import { useMemo, useState, type FormEvent } from "react";
import { fold, STATUS_LABEL } from "../lib/board";
import type { NumberId, PublicStatus } from "../lib/types";
import { adminApi, type AdminNumber } from "./api";
import type { RunAction } from "./Dashboard";
import { Modal } from "./Modal";
import { usePublicConfig } from "../lib/usePublicConfig";
import styles from "./Admin.module.css";

type Filter = "all" | PublicStatus;
type Action =
  | { kind: "pay"; n: AdminNumber }
  | { kind: "cancel"; n: AdminNumber }
  | { kind: "edit"; n: AdminNumber }
  | { kind: "revoke"; n: AdminNumber };

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—";

interface Props {
  numbers: AdminNumber[];
  run: RunAction;
  generate: (numbers: NumberId[] | null) => Promise<boolean>;
}

export function NumbersTab({ numbers, run, generate }: Props) {
  const [filter, setFilter] = useState<Filter>("reserved");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<Action | null>(null);

  const counts = useMemo(() => {
    const c = { all: numbers.length, available: 0, reserved: 0, paid: 0 };
    for (const n of numbers) c[n.status] += 1;
    return c;
  }, [numbers]);

  const visible = useMemo(() => {
    const q = fold(query);
    return numbers.filter((n) => {
      if (filter !== "all" && n.status !== filter) return false;
      if (!q) return true;
      if (/^\d{1,2}$/.test(q)) return n.number_id === q.padStart(2, "0");
      return [n.first_name, n.email, n.phone].some((v) => fold(v ?? "").includes(q));
    });
  }, [numbers, filter, query]);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "reserved", label: `Por cobrar (${counts.reserved})` },
    { id: "paid", label: `Pagados (${counts.paid})` },
    { id: "available", label: `Disponibles (${counts.available})` },
    { id: "all", label: `Todos (${counts.all})` },
  ];

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Filtrar por estado">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? styles.chipActive : styles.chip} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
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
        <p className={styles.empty}>
          {filter === "reserved" ? "No hay reservas pendientes de pago." : "No hay números que coincidan."}
        </p>
      ) : (
        <ul className={styles.rows}>
          {visible.map((n) => (
            <li key={n.number_id} className={styles.row}>
              <span className={`${styles.numBadge} ${styles[`b_${n.status}`]}`}>{n.number_id}</span>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  {n.first_name ?? <span className={styles.muted}>Sin asignar</span>}
                  <span className={`${styles.pill} ${styles[`p_${n.status}`]}`}>
                    {n.status === "reserved" ? "Por cobrar" : n.status === "paid" ? "Pagado" : STATUS_LABEL[n.status]}
                  </span>
                </p>
                <p className={styles.rowMeta}>
                  {n.status === "available" &&
                    (n.active_code_id
                      ? `Código generado${n.active_code_delivered ? " y entregado" : ", sin entregar"}`
                      : "Sin código")}
                  {n.status === "reserved" && <Deadline reservedAt={n.reserved_at} expiresAt={n.expires_at} />}
                  {n.status === "paid" &&
                    `Pagado: ${fmtDate(n.paid_at)}${n.amount_paid != null ? ` · $${Number(n.amount_paid).toLocaleString("es-MX")}` : ""}`}
                </p>
                {(n.email || n.phone) && (
                  <p className={styles.rowContact}>
                    {n.email && <a href={`mailto:${n.email}`}>{n.email}</a>}
                    {n.phone && <a href={`tel:${n.phone}`}>{n.phone}</a>}
                  </p>
                )}
                {(n.notes || n.payment_note) && <p className={styles.rowNote}>{[n.payment_note, n.notes].filter(Boolean).join(" · ")}</p>}
              </div>
              <div className={styles.rowActions}>
                {n.status === "available" && !n.active_code_id && (
                  <button className={styles.smallBtn} onClick={() => void generate([n.number_id])}>
                    Generar código
                  </button>
                )}
                {n.status === "available" && n.active_code_id && (
                  <button className={styles.smallBtn} onClick={() => setAction({ kind: "revoke", n })}>
                    Revocar código
                  </button>
                )}
                {n.status === "reserved" && (
                  <button className={styles.smallBtnPrimary} onClick={() => setAction({ kind: "pay", n })}>
                    Marcar pagado
                  </button>
                )}
                {n.status !== "available" && (
                  <>
                    <button className={styles.smallBtn} onClick={() => setAction({ kind: "edit", n })}>
                      Editar
                    </button>
                    <button className={styles.smallBtnDanger} onClick={() => setAction({ kind: "cancel", n })}>
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ActionModal action={action} onClose={() => setAction(null)} run={run} />
    </>
  );
}

function ActionModal({ action, onClose, run }: { action: Action | null; onClose: () => void; run: RunAction }) {
  const config = usePublicConfig();
  const defaultAmount = config?.price_per_number != null ? String(Number(config.price_per_number)) : "";
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(defaultAmount);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Reinicia el formulario al abrir otra acción.
  const key = action ? `${action.kind}-${action.n.number_id}` : "";
  const [lastKey, setLastKey] = useState("");
  if (key !== lastKey) {
    setLastKey(key);
    setText(action?.kind === "edit" ? action.n.notes ?? "" : "");
    setName(action?.n.first_name ?? "");
    setEmail(action?.n.email ?? "");
    setPhone(action?.n.phone ?? "");
    setAmount(defaultAmount);
  }

  if (!action) return <Modal title="" open={false} onClose={onClose}>{null}</Modal>;
  const { n } = action;

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
      ok = await run(`Datos del ${n.number_id} actualizados`, () => adminApi.updateParticipant(n.number_id, name, email, phone, text));
    } else if (action.kind === "revoke" && n.active_code_id) {
      const id = n.active_code_id;
      ok = await run(`Código del ${n.number_id} revocado`, () => adminApi.revokeCode(id, text));
    }
    setBusy(false);
    if (ok) onClose();
  };

  const titles = {
    pay: `Confirmar pago del ${n.number_id}`,
    cancel: `Cancelar el ${n.number_id}`,
    edit: `Editar el ${n.number_id}`,
    revoke: `Revocar el código del ${n.number_id}`,
  };

  return (
    <Modal title={titles[action.kind]} open onClose={onClose} busy={busy}>
      <form onSubmit={submit} className={styles.form}>
        {action.kind === "pay" && (
          <>
            <p className={styles.modalText}>
              {n.first_name} pasará a <strong>pagado</strong>. Esta acción no se puede revertir: si te equivocas,
              tendrás que cancelar y asignar el número otra vez.
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
              {n.status === "paid" && <> (ya estaba <strong>pagada</strong>)</>} y el {n.number_id} vuelve a estar
              disponible. El código que usó deja de servir; para reasignarlo tendrás que generar uno nuevo.
            </p>
            <label className={styles.field}>
              <span>Motivo (obligatorio, queda en el historial)</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} required />
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
              <span>Correo (privado)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
            </label>
            <label className={styles.field}>
              <span>Teléfono (privado)</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={25} />
            </label>
            <label className={styles.field}>
              <span>Notas (privadas)</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            </label>
          </>
        )}

        {action.kind === "revoke" && (
          <>
            <p className={styles.modalText}>
              El código pendiente del {n.number_id} dejará de funcionar. Úsalo si se perdió o se entregó por error;
              después podrás generar uno nuevo.
            </p>
            <label className={styles.field}>
              <span>Motivo (opcional)</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
            </label>
          </>
        )}

        <div className={styles.modalActions}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Volver
          </button>
          <button className={`btn ${action.kind === "cancel" || action.kind === "revoke" ? styles.btnDanger : "btn-primary"}`} disabled={busy}>
            {busy
              ? "Guardando…"
              : { pay: "Confirmar pago", cancel: "Cancelar participación", edit: "Guardar cambios", revoke: "Revocar código" }[action.kind]}
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
  const base = `Reservado: ${fmtDate(reservedAt)}`;
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
