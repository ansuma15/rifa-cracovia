import { prize, type PhotoAdjust } from "../content";
import styles from "./Prize.module.css";

const ICONS = [
  // Televisión
  <svg key="tv" viewBox="0 0 64 48" aria-hidden="true">
    <rect x="3" y="3" width="58" height="34" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <path d="M24 45h16M32 37v8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>,
  // Barra de sonido con subwoofer
  <svg key="audio" viewBox="0 0 64 48" aria-hidden="true">
    <rect x="3" y="8" width="38" height="10" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <rect x="45" y="6" width="16" height="38" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="53" cy="30" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
  </svg>,
];

export function Prize() {
  const base = import.meta.env.BASE_URL;
  return (
    <section id="premio" className={styles.section} aria-labelledby="premio-titulo">
      <div className="wrap">
        <h2 id="premio-titulo">{prize.heading}</h2>
        <p className={styles.intro}>{prize.intro}</p>

        <div className={styles.package}>
          {prize.items.map((item, i) => [
            i > 0 && (
              <span key={`plus-${i}`} className={styles.plus} aria-hidden="true">
                +
              </span>
            ),
            <figure key={item.name} className={styles.item}>
              <div className={styles.frame}>
                {item.image ? (
                  <img
                    src={`${base}premios/${item.image}`}
                    alt={item.alt}
                    loading="lazy"
                    style={photoStyle(item.adjust)}
                  />
                ) : (
                  <div className={styles.placeholder}>
                    {ICONS[i]}
                    <span>Foto próximamente</span>
                  </div>
                )}
              </div>
              <figcaption>{item.name}</figcaption>
            </figure>,
          ])}
        </div>
      </div>
    </section>
  );
}

/** Traduce el ajuste de content.ts a CSS. Sin ajuste, la foto queda centrada tal cual. */
function photoStyle(a: PhotoAdjust | undefined): React.CSSProperties | undefined {
  if (!a || (a.x == null && a.y == null && a.zoom == null)) return undefined;
  return { transform: `translate(${a.x ?? 0}%, ${a.y ?? 0}%) scale(${a.zoom ?? 1})` };
}
