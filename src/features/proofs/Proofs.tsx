import { useEffect, useRef, useState } from "react";
import { proofs } from "../../content";
import styles from "./Proofs.module.css";

/**
 * Comprobantes: miniaturas pequeñas que se amplían al tocarlas.
 * En celular ocupan una sola fila para no saturar; la imagen completa solo
 * se descarga cuando alguien la abre (las miniaturas usan loading="lazy").
 * Si ningún comprobante tiene archivo, la sección no se muestra.
 */
export function Proofs() {
  const items = proofs.items.filter((p) => p.file);
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const base = import.meta.env.BASE_URL;

  useEffect(() => {
    const d = ref.current;
    if (!d || typeof d.showModal !== "function") return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  if (items.length === 0) return null;
  const src = (file: string | null) => `${base}comprobantes/${file}`;
  const current = open !== null ? items[open] : null;

  return (
    <div className={styles.proofs}>
      <p className={styles.title}>{proofs.title}</p>
      <ul className={styles.list}>
        {items.map((p, i) => (
          <li key={p.label}>
            <button type="button" className={styles.thumb} onClick={() => setOpen(i)}>
              <img src={src(p.file)} alt="" loading="lazy" />
              <span>{p.label}</span>
              <span className="visually-hidden">: ampliar imagen</span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={ref}
        className={styles.viewer}
        aria-label={current?.label ?? proofs.title}
        onClose={() => setOpen(null)}
        // Tocar fuera de la imagen (en el fondo oscuro) también cierra
        onClick={(e) => e.target === e.currentTarget && setOpen(null)}
      >
        {current && (
          <figure>
            <img src={src(current.file)} alt={current.alt} />
            <figcaption>{current.label}</figcaption>
          </figure>
        )}
        <button type="button" className={`btn btn-primary ${styles.close}`} onClick={() => setOpen(null)}>
          Cerrar
        </button>
      </dialog>
    </div>
  );
}
