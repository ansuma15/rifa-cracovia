import { useState } from "react";
import type { GeneratedCode } from "./api";
import { codesToCsv, deliveryMessage } from "./numbers";
import { holdHours } from "../lib/format";
import { usePublicConfig } from "../lib/usePublicConfig";
import styles from "./Admin.module.css";

/** Dirección del sitio público (la carpeta superior a /admin/). */
export const publicSiteUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href;

/**
 * Códigos recién generados. Es la ÚNICA vez que existen en texto legible:
 * la base solo guarda su hash. Por eso este bloque no se cierra solo.
 */
export function GeneratedCodes({ codes, onDismiss }: { codes: GeneratedCode[]; onDismiss: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const site = publicSiteUrl();
  const hours = holdHours(usePublicConfig());

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setCopied("error");
    }
  };

  const download = () => {
    const blob = new Blob([codesToCsv(codes)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `codigos-rifa-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setDownloaded(true);
  };

  const confirmDismiss = () => {
    if (downloaded || window.confirm("Estos códigos no se pueden volver a mostrar. ¿Ya los guardaste o entregaste?")) {
      onDismiss();
    }
  };

  return (
    <section className={styles.generated} aria-labelledby="gen-title">
      <div className={styles.generatedHead}>
        <div>
          <h2 id="gen-title">Códigos nuevos ({codes.length})</h2>
          <p>
            Esta es la única vez que se muestran. Entrégalos o guárdalos antes de cerrar este aviso; si pierdes uno,
            revócalo y genera otro.
          </p>
        </div>
        <div className={styles.rowActions}>
          <button className="btn btn-ghost" onClick={download}>
            Descargar CSV
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => void copy("all", codes.map((c) => `${c.number_id}  ${c.code}`).join("\n"))}
          >
            {copied === "all" ? "Copiados" : "Copiar todos"}
          </button>
          <button className="btn btn-primary" onClick={confirmDismiss}>
            Ya los guardé
          </button>
        </div>
      </div>
      {copied === "error" && <p className={styles.error}>No se pudo copiar automáticamente; selecciona el texto a mano.</p>}
      <ul className={styles.codeList}>
        {codes.map((c) => (
          <li key={c.code_id}>
            <span className={styles.codeNum}>{c.number_id}</span>
            <code className={styles.code}>{c.code}</code>
            <button className={styles.smallBtn} onClick={() => void copy(c.code_id, c.code)}>
              {copied === c.code_id ? "Copiado" : "Copiar código"}
            </button>
            {/* Sin enlace wa.me: pondría el código en una URL. Se copia y se pega en el chat. */}
            <button className={styles.smallBtn} onClick={() => void copy(`${c.code_id}-msg`, deliveryMessage(c.number_id, c.code, site, hours))}>
              {copied === `${c.code_id}-msg` ? "Mensaje copiado" : "Copiar mensaje para WhatsApp"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
