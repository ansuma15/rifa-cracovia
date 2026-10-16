import type { AuditEntry } from "./api";
import styles from "./Admin.module.css";

const ACTIONS: Record<string, string> = {
  code_generated: "Generó código",
  code_revoked: "Revocó código",
  code_delivered: "Marcó código como entregado",
  number_claimed: "Registró el número",
  payment_confirmed: "Confirmó pago",
  participation_cancelled: "Canceló participación",
  participant_updated: "Editó datos",
  reservation_expired: "Reserva vencida",
  settings_updated: "Cambió ajustes",
};

function detail(e: AuditEntry): string | null {
  const d = e.details;
  if (e.action === "payment_confirmed" && d.amount != null) return `$${Number(d.amount).toLocaleString("es-MX")}${d.note ? ` (${d.note})` : ""}`;
  if (e.action === "participation_cancelled") return String(d.reason ?? "");
  if (e.action === "participant_updated" && d.old_first_name !== d.new_first_name) return `${d.old_first_name} → ${d.new_first_name}`;
  if (e.action === "code_revoked" && d.reason) return String(d.reason);
  if (e.action === "settings_updated") return JSON.stringify(d.patch);
  return null;
}

export function HistoryTab({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) return <p className={styles.empty}>Todavía no hay movimientos.</p>;
  return (
    <ol className={styles.history}>
      {audit.map((e) => (
        <li key={e.id}>
          <time dateTime={e.created_at}>
            {new Date(e.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
          </time>
          <span>
            <strong>{e.actor_label === "public" ? "Participante" : e.actor_label === "system" ? "Sistema" : "Tú"}</strong>{" "}
            {ACTIONS[e.action] ?? e.action}
            {e.number_id && <> · {e.number_id}</>}
            {detail(e) && <span className={styles.muted}> · {detail(e)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
