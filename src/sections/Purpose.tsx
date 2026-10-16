import { purpose } from "../content";
import styles from "./Purpose.module.css";

export function Purpose() {
  return (
    <section id="proposito" className={styles.section} aria-labelledby="proposito-titulo">
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.text}>
          <h2 id="proposito-titulo">{purpose.heading}</h2>
          {purpose.body.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>

        <div className={styles.side}>
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
