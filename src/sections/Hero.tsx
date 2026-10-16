import { site, purpose, rules } from "../content";
import { countByStatus } from "../lib/board";
import type { BoardState } from "../features/board/useBoard";
import { formatPrice } from "../lib/usePublicConfig";
import type { PublicConfig } from "../lib/types";
import styles from "./Hero.module.css";

export function Hero({ boardState, config }: { boardState: BoardState; config: PublicConfig | null }) {
  return (
    <section id="inicio" className={styles.hero}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.copy}>
          <h1 className={styles.title}>{site.title}</h1>
          <p className={styles.subtitle}>{site.subtitle}</p>
          <div className={styles.actions}>
            <a className="btn btn-primary" href="#numeros">
              Elegir mi número
            </a>
            <a className="btn btn-ghost" href="#premio">
              Ver el premio
            </a>
          </div>
        </div>
        <Ticket boardState={boardState} config={config} />
      </div>
    </section>
  );
}

/** Boleto de rifa con la ruta y el estado en vivo del tablero. */
function Ticket({ boardState, config }: { boardState: BoardState; config: PublicConfig | null }) {
  const { phase, board } = boardState;
  const price = formatPrice(config);
  const counts = board ? countByStatus(board) : null;
  const taken = counts ? counts.reserved + counts.paid : null;

  return (
    <aside className={styles.ticket} aria-label="Resumen de la rifa">
      <div className={styles.ticketMain}>
        <div className={styles.route}>
          <span className={styles.code}>MEX</span>
          <span className={styles.path} aria-hidden="true" />
          <span className={styles.code}>KRK</span>
        </div>
        <p className={styles.routeNames}>
          {purpose.from} a {purpose.to}
        </p>
        <dl className={styles.facts}>
          <div>
            <dt>Destino</dt>
            <dd>{purpose.university}</dd>
          </div>
          <div>
            <dt>Sorteo</dt>
            <dd>{rules.draw.shortDate}, 20:00 h</dd>
          </div>
          {price && (
            <div>
              <dt>Cada número</dt>
              <dd>{price}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className={styles.stub} aria-live="polite">
        {phase === "ready" && counts && taken !== null ? (
          <>
            <span className={styles.stubBig}>{counts.available}</span>
            <span className={styles.stubLabel}>
              {counts.available === 1 ? "número libre" : "números libres"} de 100
            </span>
          </>
        ) : phase === "loading" ? (
          <span className={styles.stubLabel}>Cargando tablero…</span>
        ) : (
          <>
            <span className={styles.stubBig}>100</span>
            <span className={styles.stubLabel}>números del 00 al 99</span>
          </>
        )}
      </div>
    </aside>
  );
}
