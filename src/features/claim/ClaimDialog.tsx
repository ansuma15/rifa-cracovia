import { useEffect, useRef, useState, type FormEvent } from "react";
import { claimNumber } from "../../lib/api";
import type { BoardNumber, ClaimError, ClaimOutcome, NumberId, PublicConfig } from "../../lib/types";
import { formatPrice } from "../../lib/usePublicConfig";
import { site } from "../../content";
import styles from "./ClaimDialog.module.css";

interface Props {
  /** Número abierto (con su estado actual en vivo) o null si el diálogo está cerrado. */
  number: BoardNumber | null;
  config: PublicConfig | null;
  onClose: () => void;
  /** Se llama tras cualquier respuesta (o falta de ella) para recargar el tablero. */
  onSettled: () => void;
}

const ERROR_TEXT: Record<ClaimError, string> = {
  invalid_input: "Revisa tu nombre y el código: parece que algo está mal escrito.",
  number_unavailable: "Alguien registró este número hace un momento. Elige otro en el tablero.",
  invalid_code: "Ese código no es válido para este número. Verifica que sea el que te dieron para este número.",
  rate_limited: "Hubo demasiados intentos con códigos incorrectos. Espera 15 minutos e inténtalo de nuevo.",
  raffle_closed: "El registro de números está cerrado.",
};

// Mismas reglas que el servidor (private.clean_first_name / normalize_code).
// Aquí solo sirven para avisar antes de enviar; el servidor decide.
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' .-]*$/;
const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");
const normalizeCode = (s: string) =>
  s.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

/** Muestra el código agrupado mientras se escribe: ABCD-EFGH-JKMN */
const formatCodeInput = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 12)
    .replace(/(.{4})(?=.)/g, "$1-");

type View =
  | { kind: "form" }
  | { kind: "info" }
  | { kind: "submitting" }
  | { kind: "done"; outcome: ClaimOutcome };

export function ClaimDialog({ number, config, onClose, onSettled }: Props) {
  const price = formatPrice(config);
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>({ kind: "form" });
  const [openedId, setOpenedId] = useState<NumberId | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Abrir/cerrar el <dialog> nativo según haya número seleccionado.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (number && !d.open) {
      setOpenedId(number.id);
      setView(number.status === "available" ? { kind: "form" } : { kind: "info" });
      setName("");
      setCode("");
      setFieldError(null);
      d.showModal();
    } else if (!number && d.open) {
      d.close();
    }
  }, [number]);

  const submitting = view.kind === "submitting";

  // Si mientras llenaba el formulario otra persona tomó el número, se avisa.
  const takenMeanwhile = view.kind === "form" && number !== null && number.status !== "available";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!number || !openedId) return;
    const n = cleanName(name);
    const c = normalizeCode(code);
    if (n.length === 0 || n.length > 40 || !NAME_RE.test(n)) {
      setFieldError("Escribe solo tu nombre de pila, con letras (máximo 40).");
      return;
    }
    if (c.length !== 12) {
      setFieldError("El código tiene 12 caracteres, por ejemplo K7QF-M2XR-9WTB.");
      return;
    }
    setFieldError(null);
    setView({ kind: "submitting" });
    const outcome = await claimNumber(openedId, n, c);
    setView({ kind: "done", outcome });
    onSettled();
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="claim-title"
      onClose={onClose}
      onCancel={(e) => {
        if (submitting) e.preventDefault(); // no cerrar con Esc mientras se envía
      }}
      onClick={(e) => {
        // Clic en el fondo oscuro = cerrar (salvo durante el envío).
        if (e.target === ref.current && !submitting) ref.current?.close();
      }}
    >
      {number && openedId && (
        <div className={styles.body}>
          <div className={styles.seatBadge} aria-hidden="true">
            {openedId}
          </div>

          {view.kind === "info" && <InfoView number={number} />}

          {(view.kind === "form" || view.kind === "submitting") && (
            <form onSubmit={onSubmit} noValidate>
              <h2 id="claim-title" className={styles.title}>
                Registrar el número {openedId}
              </h2>
              <p className={styles.help}>
                Escribe tu nombre de pila y el código que te entregó {site.organizer} para este número.
                {price && <> El número cuesta <strong>{price}</strong> y lo pagas directamente a {site.organizer}.</>}
              </p>

              {takenMeanwhile && (
                <p className={styles.alert} role="alert">
                  Este número acaba de ser registrado por otra persona. Cierra y elige otro.
                </p>
              )}

              <label className={styles.field}>
                <span>Nombre de pila</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="given-name"
                  maxLength={40}
                  required
                  disabled={submitting || takenMeanwhile}
                />
                <small>Es lo único que se mostrará en el tablero.</small>
              </label>

              <label className={styles.field}>
                <span>Código de autorización</span>
                <input
                  value={code}
                  onChange={(e) => setCode(formatCodeInput(e.target.value))}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="XXXX-XXXX-XXXX"
                  className={styles.codeInput}
                  required
                  disabled={submitting || takenMeanwhile}
                />
              </label>

              {fieldError && (
                <p className={styles.alert} role="alert">
                  {fieldError}
                </p>
              )}

              <div className={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || takenMeanwhile}>
                  {submitting ? "Registrando…" : `Registrar el ${openedId}`}
                </button>
              </div>
            </form>
          )}

          {view.kind === "done" && (
            <ResultView outcome={view.outcome} id={openedId} onClose={() => ref.current?.close()} />
          )}
        </div>
      )}
    </dialog>
  );
}

function InfoView({ number }: { number: BoardNumber }) {
  return (
    <>
      <h2 id="claim-title" className={styles.title}>
        {number.status === "available" ? `El ${number.id} está disponible` : `El ${number.id} es de ${number.public_name}`}
      </h2>
      <p className={styles.help}>
        {number.status === "paid" && "Pago confirmado. Este número ya está participando."}
        {number.status === "reserved" && "Reservado, en espera de que se confirme el pago."}
        {number.status === "available" && "Cierra esta ventana y vuelve a tocarlo para registrarlo."}
      </p>
      <div className={styles.actions}>
        <form method="dialog">
          <button className="btn btn-primary">Volver al tablero</button>
        </form>
      </div>
    </>
  );
}

function ResultView({ outcome, id, onClose }: { outcome: ClaimOutcome; id: NumberId; onClose: () => void }) {
  if (outcome.kind === "server" && outcome.result.ok) {
    const r = outcome.result;
    const amount =
      r.price != null
        ? new Intl.NumberFormat("es-MX", { style: "currency", currency: r.currency }).format(r.price)
        : null;
    return (
      <div role="status">
        <h2 id="claim-title" className={styles.title}>
          ¡Listo, {r.first_name}! El {id} está reservado a tu nombre
        </h2>
        <p className={styles.help}>
          Tu reserva queda <strong>pendiente de pago</strong>. Cuando {site.organizer} confirme tu pago, el número
          aparecerá como ocupado.
          {amount && <> Monto a pagar: <strong>{amount}</strong>.</>}
        </p>
        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={onClose}>
            Volver al tablero
          </button>
        </div>
      </div>
    );
  }

  let title = "No se pudo registrar";
  let text: string;
  if (outcome.kind === "server" && !outcome.result.ok) {
    text = ERROR_TEXT[outcome.result.error];
    if (outcome.result.error === "number_unavailable") title = "Este número ya no está disponible";
  } else if (outcome.kind === "unknown") {
    title = "No pudimos confirmar tu registro";
    text = `${outcome.message} Antes de intentarlo otra vez, revisa en el tablero si el ${id} ya aparece a tu nombre.`;
  } else {
    text = "La rifa todavía no está conectada. Inténtalo más tarde.";
  }

  return (
    <div role="alert">
      <h2 id="claim-title" className={styles.title}>
        {title}
      </h2>
      <p className={styles.help}>{text}</p>
      <div className={styles.actions}>
        <button className="btn btn-primary" onClick={onClose}>
          Volver al tablero
        </button>
      </div>
    </div>
  );
}

// Exportado para pruebas.
export const __test = { normalizeCode, formatCodeInput, cleanName, NAME_RE };
