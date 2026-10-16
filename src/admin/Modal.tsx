import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Admin.module.css";

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}

/** Diálogo modal nativo: atrapa el foco, cierra con Esc y respeta el lector de pantalla. */
export function Modal({ title, open, onClose, busy = false, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.modal}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
    >
      {open && (
        <div className={styles.modalBody}>
          <h2 className={styles.modalTitle}>{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
