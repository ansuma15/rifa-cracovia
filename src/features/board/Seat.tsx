import { forwardRef, useEffect, useRef, useState } from "react";
import { STATUS_LABEL } from "../../lib/board";
import type { BoardNumber, NumberId } from "../../lib/types";
import styles from "./Board.module.css";

interface SeatProps {
  id: NumberId;
  data: BoardNumber | null; // null = sin datos todavía (cargando o sin conexión)
  tabIndex: 0 | -1;
  selected: boolean;
  highlighted: boolean;
  onActivate: (id: NumberId) => void;
  onFocusSeat: (id: NumberId) => void;
}

export const Seat = forwardRef<HTMLButtonElement, SeatProps>(function Seat(
  { id, data, tabIndex, selected, highlighted, onActivate, onFocusSeat },
  ref,
) {
  const status = data?.status ?? "unknown";

  // "Se enciende" una vez cuando el estado cambia en vivo (no en la carga inicial).
  const prev = useRef(status);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current !== "unknown" && prev.current !== status) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 1400);
      prev.current = status;
      return () => window.clearTimeout(t);
    }
    prev.current = status;
  }, [status]);

  const label = data
    ? data.public_name
      ? `${id}, ${STATUS_LABEL[data.status].toLowerCase()}, ${data.public_name}`
      : `${id}, ${STATUS_LABEL[data.status].toLowerCase()}`
    : `${id}, sin datos`;

  return (
    <div role="gridcell" className={styles.cell}>
      <button
        ref={ref}
        type="button"
        className={[
          styles.seat,
          styles[status],
          selected && styles.selected,
          highlighted && styles.highlighted,
          flash && styles.flash,
        ]
          .filter(Boolean)
          .join(" ")}
        tabIndex={tabIndex}
        aria-label={label}
        aria-disabled={!data}
        onClick={() => data && onActivate(id)}
        onFocus={() => onFocusSeat(id)}
      >
        {id}
      </button>
    </div>
  );
});
