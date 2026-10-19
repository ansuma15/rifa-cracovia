import { rules, teamList } from "../content";
import { PaymentInfo } from "../features/payment/PaymentInfo";
import { holdHours, hoursText } from "../lib/format";
import type { PublicConfig } from "../lib/types";
import { formatPrice } from "../lib/usePublicConfig";
import styles from "./Rules.module.css";

export function Rules({ config }: { config: PublicConfig | null }) {
  const price = formatPrice(config);
  const hours = holdHours(config);

  const [reserve, pay] = rules.steps;
  const perPhone = config?.max_per_phone ?? 5;

  return (
    <section id="participar" className={styles.section} aria-labelledby="participar-titulo">
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.main}>
          <h2 id="participar-titulo">{rules.heading}</h2>

          {/* Es un proceso en orden: por eso los pasos van numerados */}
          <ol className={styles.steps}>
            <li>
              <h3>{reserve?.title}</h3>
              <p>
                {reserve?.detail}
                {hours != null && (
                  <>
                    {" "}
                    Tu número queda apartado por <strong>{hoursText(hours)}</strong>.
                  </>
                )}{" "}
                Con un mismo teléfono puedes apartar hasta <strong>{perPhone}</strong> números sin pagar.
              </p>
            </li>
            <li>
              <h3>{pay?.title}</h3>
              <p>
                {pay?.detail} Te lo puede recibir {teamList("o")}.
              </p>
            </li>
            <li className={styles.done}>
              <h3>{rules.done.title}</h3>
              <p>{rules.done.detail}</p>
            </li>
          </ol>

          <div className={styles.warning} role="note">
            <strong>Importante:</strong>
            <ul>
              {hours != null && (
                <li>
                  Cualquier número que no se haya pagado dentro de las {hoursText(hours)} pierde su reserva. El número
                  vuelve a quedar libre y no se garantiza que siga disponible.
                </li>
              )}
              {rules.policy.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.side}>
          <section className={styles.card} aria-labelledby="pago-titulo" id="pago">
            <h3 id="pago-titulo" className={styles.cardTitle}>
              Métodos de pago
            </h3>
            <PaymentInfo price={price} />
          </section>
        </div>

        <div className={styles.drawArea}>
            <section className={`${styles.card} ${styles.drawCard}`} aria-labelledby="sorteo-titulo">
              <h3 id="sorteo-titulo" className={styles.cardTitle}>
                El sorteo
              </h3>
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
            </section>
        </div>
      </div>
    </section>
  );
}
