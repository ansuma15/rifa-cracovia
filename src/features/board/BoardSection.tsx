import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ALL_IDS, countByStatus, searchBoard, STATUS_LABEL } from "../../lib/board";
import type { NumberId } from "../../lib/types";
import styles from "./Board.module.css";
import { Seat } from "./Seat";
import type { BoardState } from "./useBoard";

interface Props {
  boardState: BoardState;
  selected: NumberId | null;
  onSelect: (id: NumberId) => void;
}

const ROWS = Array.from({ length: 10 }, (_, r) => ALL_IDS.slice(r * 10, r * 10 + 10));

export function BoardSection({ boardState, selected, onSelect }: Props) {
  const { phase, board, error, sync, refresh } = boardState;
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<NumberId>("00");
  const seatRefs = useRef(new Map<NumberId, HTMLButtonElement>());

  const counts = board ? countByStatus(board) : null;
  const matches = useMemo(() => (board ? searchBoard(board, query) : []), [board, query]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const participants = useMemo(
    () => (board ? [...board.values()].filter((n) => n.public_name !== null) : []),
    [board],
  );

  const focusSeat = (id: NumberId) => {
    setActiveId(id);
    const el = seatRefs.current.get(id);
    el?.focus();
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  // Navegación con flechas dentro del tablero (un solo "tab" para las 100 butacas).
  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = Number(activeId);
    const moves: Record<string, number> = {
      ArrowRight: i % 10 < 9 ? i + 1 : i,
      ArrowLeft: i % 10 > 0 ? i - 1 : i,
      ArrowDown: i + 10 <= 99 ? i + 10 : i,
      ArrowUp: i - 10 >= 0 ? i - 10 : i,
      Home: i - (i % 10),
      End: i - (i % 10) + 9,
    };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    focusSeat(String(next).padStart(2, "0") as NumberId);
  };

  return (
    <section id="numeros" className={styles.section} aria-labelledby="numeros-titulo">
      <div className="wrap">
        <div className={styles.head}>
          <div>
            <h2 id="numeros-titulo">Elige tu número</h2>
            <p className={styles.lead}>
              Toca un número disponible para apartarlo, o uno ocupado para ver de quién es.
            </p>
          </div>
          <SyncStatus phase={phase} sync={sync} hasError={Boolean(error)} />
        </div>

        <div className={styles.toolbar}>
          <ul className={styles.legend} aria-label="Estados de los números">
            {(["available", "reserved", "paid"] as const).map((s) => (
              <li key={s}>
                <span className={`${styles.swatch} ${styles[s]}`} aria-hidden="true" />
                {STATUS_LABEL[s]}
                {counts && <strong className={styles.count}>{counts[s]}</strong>}
              </li>
            ))}
          </ul>

          <div className={styles.search}>
            <label htmlFor="buscar">Buscar por número o nombre</label>
            <input
              id="buscar"
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Ej. 07 o Ana"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={phase !== "ready"}
            />
          </div>
        </div>

        {query.trim() !== "" && phase === "ready" && (
          <div className={styles.results} aria-live="polite">
            {matches.length === 0 ? (
              <p>No hay coincidencias para “{query.trim()}”.</p>
            ) : (
              <ul>
                {matches.map((id) => {
                  const n = board?.get(id);
                  return (
                    <li key={id}>
                      <button type="button" className={styles.resultBtn} onClick={() => { focusSeat(id); onSelect(id); }}>
                        <span className={styles.resultNum}>{id}</span>
                        {n?.public_name ?? STATUS_LABEL[n?.status ?? "available"]}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className={styles.theater}>
          <div className={styles.screen} aria-hidden="true">
            <span>La pantalla de 75″ que puedes ganar</span>
          </div>

          <div
            role="grid"
            aria-label="Tablero de números del 00 al 99"
            aria-busy={phase === "loading"}
            className={`${styles.grid} ${phase !== "ready" ? styles.inactive : ""}`}
            onKeyDown={onGridKeyDown}
          >
            {ROWS.map((row) => (
              <div role="row" key={row[0]} className={styles.row}>
                {row.map((id) => (
                  <Seat
                    key={id}
                    id={id}
                    ref={(el) => {
                      if (el) seatRefs.current.set(id, el);
                      else seatRefs.current.delete(id);
                    }}
                    data={board?.get(id) ?? null}
                    tabIndex={id === activeId ? 0 : -1}
                    selected={id === selected}
                    highlighted={matchSet.has(id)}
                    onActivate={onSelect}
                    onFocusSeat={setActiveId}
                  />
                ))}
              </div>
            ))}
          </div>

          {phase !== "ready" && (
            <div className={styles.overlay} role="status">
              {phase === "unconfigured" && (
                <>
                  <p className={styles.overlayTitle}>Tablero en preparación</p>
                  <p>Los números se mostrarán aquí en cuanto la rifa esté conectada.</p>
                </>
              )}
              {phase === "loading" && <p className={styles.overlayTitle}>Cargando números…</p>}
              {phase === "error" && (
                <>
                  <p className={styles.overlayTitle}>No pudimos cargar el tablero</p>
                  <p>Revisa tu conexión e inténtalo de nuevo.</p>
                  <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
                    Reintentar
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {participants.length > 0 && (
          <details className={styles.list}>
            <summary>Ver quién ya participa ({participants.length})</summary>
            <ul>
              {participants.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => { focusSeat(n.id); onSelect(n.id); }}>
                    <span className={styles.resultNum}>{n.id}</span>
                    <span className={styles.listName}>{n.public_name}</span>
                    <span className={`${styles.tag} ${styles[n.status]}`}>{STATUS_LABEL[n.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function SyncStatus({ phase, sync, hasError }: { phase: string; sync: string; hasError: boolean }) {
  if (phase !== "ready") return null;
  let text = "En vivo";
  let tone = styles.live;
  if (hasError || sync === "offline") {
    text = "Sin conexión: el tablero puede no estar al día";
    tone = styles.warn;
  } else if (sync === "polling") {
    text = "Se actualiza cada 30 segundos";
    tone = styles.slow;
  }
  return (
    <p className={`${styles.sync} ${tone}`} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </p>
  );
}
