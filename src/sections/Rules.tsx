import { rules } from "../content";
import styles from "./Rules.module.css";
import { formatPrice } from "../lib/usePublicConfig";
import type { PublicConfig } from "../lib/types";

export function Rules({ config }: { config: PublicConfig | null }) {
  const price = formatPrice(config);
  return (
    <section id="reglas" className={styles.section} aria-labelledby="reglas-titulo">
      <div className={`wrap ${styles.grid}`}>
        <div>
          <h2 id="reglas-titulo">{rules.heading}</h2>
          {/* Es un proceso en orden, por eso la lista va numerada */}
          <ol className={styles.steps}>
            {rules.steps.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.detail}</p>
              </li>
            ))}
          </ol>
        </div>

        <aside className={styles.aside} aria-label="Detalles del sorteo">
          <h3>El sorteo</h3>
          <dl className={styles.draw}>
            <div>
              <dt>Fecha</dt>
              <dd>{rules.draw.date}</dd>
            </div>
            <div>
              <dt>Cómo se elige al ganador</dt>
              <dd>{rules.draw.method}</dd>
            </div>
            <div>
              <dt>Premio</dt>
              <dd>Un ganador se lleva la televisión y el equipo de sonido.</dd>
            </div>
            {price && (
              <div>
                <dt>Precio por número</dt>
                <dd>{price}</dd>
              </div>
            )}
          </dl>
          <ul className={styles.notes}>
            {rules.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
