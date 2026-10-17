import { purpose } from "../content";
import { Video } from "../features/video/Video";
import styles from "./Purpose.module.css";

/**
 * Responde dos preguntas en orden: ¿qué necesito? y ¿por qué lo necesito?
 * Preguntas a la izquierda, respuestas a la derecha; en celular, una
 * debajo de la otra.
 */
export function Purpose() {
  return (
    <section id="proposito" className={styles.section} aria-labelledby="que-necesito">
      <div className="wrap">
        <div className={styles.row}>
          <div className={styles.question}>
            <h2 id="que-necesito">{purpose.need.title}</h2>
            <p>{purpose.need.intro}</p>
          </div>
          <div className={styles.answer}>
            <RouteMap />
            <ul className={styles.uses} aria-label="En qué se usará lo recaudado">
              {purpose.uses.map((u) => (
                <li key={u.title}>
                  <strong>{u.title}</strong>
                  <span>{u.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.question}>
            <h2 id="por-que">{purpose.why.title}</h2>
            <p>{purpose.why.intro}</p>
          </div>
          <div className={styles.answer}>
            <Video />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Arco de vuelo México → Polonia con los colores de cada bandera en los extremos. */
function RouteMap() {
  return (
    <figure className={styles.map}>
      <svg viewBox="0 0 400 190" role="img" aria-label={`Ruta de ${purpose.from} a ${purpose.to}, ${purpose.distanceKm.toLocaleString("es-MX")} kilómetros`}>
        {/* Retícula de meridianos: sugiere el globo sin dibujar continentes */}
        <g stroke="var(--line)" strokeWidth="1" fill="none" opacity="0.7">
          {[60, 130, 200, 270, 340].map((x) => (
            <path key={x} d={`M${x} 10 Q${x + (x - 200) * 0.12} 95 ${x} 180`} />
          ))}
          <path d="M10 70 Q200 50 390 70" />
          <path d="M10 125 Q200 108 390 125" />
        </g>

        <path
          d="M62 140 Q200 -10 338 92"
          fill="none"
          stroke="var(--seat)"
          strokeWidth="2.5"
          strokeDasharray="7 7"
          strokeLinecap="round"
        />

        {/* México: verde, blanco, rojo */}
        <g transform="translate(62 140)">
          <circle r="11" fill="var(--night)" stroke="var(--ice)" strokeWidth="2" />
          <clipPath id="mx">
            <circle r="8" />
          </clipPath>
          <g clipPath="url(#mx)">
            <rect x="-8" y="-8" width="5.33" height="16" fill="var(--mx-green)" />
            <rect x="-2.67" y="-8" width="5.33" height="16" fill="#fff" />
            <rect x="2.67" y="-8" width="5.33" height="16" fill="var(--pl-red)" />
          </g>
        </g>

        {/* Polonia: blanco y rojo */}
        <g transform="translate(338 92)">
          <circle r="11" fill="var(--night)" stroke="var(--ice)" strokeWidth="2" />
          <clipPath id="pl">
            <circle r="8" />
          </clipPath>
          <g clipPath="url(#pl)">
            <rect x="-8" y="-8" width="16" height="8" fill="#fff" />
            <rect x="-8" y="0" width="16" height="8" fill="var(--pl-red)" />
          </g>
        </g>

        <text x="62" y="172" textAnchor="middle" className={styles.place}>
          {purpose.from}
        </text>
        <text x="338" y="124" textAnchor="middle" className={styles.place}>
          {purpose.to}
        </text>
        <text x="200" y="40" textAnchor="middle" className={styles.distance}>
          {purpose.distanceKm.toLocaleString("es-MX")} km
        </text>
      </svg>
    </figure>
  );
}
