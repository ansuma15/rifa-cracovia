import { useState } from "react";
import { payment, site, team, teamList } from "../../content";
import { formatClabe, receiptLink } from "../../lib/format";
import styles from "./PaymentInfo.module.css";

interface Props {
  /** Precio formateado ("$700") o null si aún no carga. */
  price: string | null;
  /** Si se conoce, el número reservado: personaliza el concepto y el mensaje de WhatsApp. */
  number?: string;
  name?: string;
  /** "full": sección de la página. "compact": dentro del mensaje de reserva. */
  variant?: "full" | "compact";
}

/**
 * Métodos de pago y envío del comprobante. Un solo componente para la
 * página y para la confirmación de reserva: los datos bancarios se
 * escriben en un único lugar (content.ts) y no pueden quedar distintos.
 */
export function PaymentInfo({ price, number, name, variant = "full" }: Props) {
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const concept = number ? `Rifa ${number}` : "Rifa + tu número (ej. Rifa 25)";
  const waLink = receiptLink(payment.whatsapp, number, name);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payment.clabe);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    window.setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className={`${styles.wrap} ${variant === "compact" ? styles.compact : ""}`}>
      <div className={styles.method}>
        <p className={styles.methodTitle}>Transferencia</p>
        <p className={styles.label} id={`clabe-${variant}`}>
          CLABE interbancaria
        </p>
        <div className={styles.clabeRow}>
          <span className={styles.clabe} aria-labelledby={`clabe-${variant}`}>
            {formatClabe(payment.clabe)}
          </span>
          <button type="button" className={styles.copy} onClick={copy}>
            {copied === "ok" ? "CLABE copiada" : "Copiar CLABE"}
          </button>
        </div>
        {copied === "error" && (
          <p className={styles.hint} role="status">
            No se pudo copiar; mantén presionado el número para seleccionarlo.
          </p>
        )}
        <dl className={styles.facts}>
          <div>
            <dt>Titular</dt>
            <dd>{payment.holder}</dd>
          </div>
          {price && (
            <div>
              <dt>Monto</dt>
              <dd>{price}</dd>
            </div>
          )}
          <div>
            <dt>Concepto</dt>
            <dd>{concept}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.method}>
        <p className={styles.methodTitle}>Efectivo</p>
        <p className={styles.text}>
          Entrégalo a cualquier integrante de la <strong>{team.name}</strong>: {teamList("o")}.
        </p>
      </div>

      <div className={styles.receipt}>
        <p className={styles.text}>
          <strong>Después de pagar,</strong> comparte tu comprobante con la persona que te contó de esta rifa. Si
          prefieres, envíaselo directamente a {site.organizer}.
        </p>
        {waLink && (
          <a className={`btn btn-ghost ${styles.wa}`} href={waLink} target="_blank" rel="noopener noreferrer">
            Enviar comprobante por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
