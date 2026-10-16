import { useState } from "react";
import { rules } from "../../content";
import styles from "./ShareBar.module.css";

/** Dirección limpia del sitio: sin #ancla ni ?parámetros (nunca viajan datos en el enlace). */
function cleanUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

const MESSAGE =
  `Estoy participando en esta rifa para apoyar un intercambio académico en Cracovia. ` +
  `Se rifa una TV Samsung de 75" con equipo de sonido; el sorteo es el ${rules.draw.shortDate}. ` +
  `Elige tu número aquí:`;

export function ShareBar() {
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const whatsappHref = () => `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${cleanUrl()}`)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cleanUrl());
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    window.setTimeout(() => setCopied(null), 2500);
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: document.title, text: MESSAGE, url: cleanUrl() });
    } catch {
      /* el usuario canceló: no es un error */
    }
  };

  return (
    <section className={styles.band} aria-labelledby="compartir-titulo">
      <div className={`wrap ${styles.inner}`}>
        <div>
          <h2 id="compartir-titulo" className={styles.title}>
            Comparte la rifa
          </h2>
          <p className={styles.text}>Cada número que se aparta me acerca un poco más a Cracovia.</p>
        </div>
        <div className={styles.actions}>
          <a className="btn btn-primary" href={whatsappHref()} onClick={(e) => (e.currentTarget.href = whatsappHref())} target="_blank" rel="noopener noreferrer">
            Compartir por WhatsApp
          </a>
          {canNativeShare && (
            <button type="button" className="btn btn-ghost" onClick={nativeShare}>
              Más opciones
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={copy}>
            Copiar enlace
          </button>
          <span className={styles.status} role="status">
            {copied === "ok" && "Enlace copiado"}
            {copied === "error" && "No se pudo copiar; mantén presionada la barra de direcciones"}
          </span>
        </div>
      </div>
    </section>
  );
}
