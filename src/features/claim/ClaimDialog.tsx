import { useEffect, useRef, useState, type FormEvent } from "react";
import { claimNumber } from "../../lib/api";
import { payment } from "../../content";
import { contactErrors, deadlineText, holdHours, hoursText, whatsappLink } from "../../lib/format";
import { PaymentInfo } from "../payment/PaymentInfo";
import type { BoardNumber, ClaimError, ClaimOutcome, NumberId, PublicConfig } from "../../lib/types";
import { formatPrice } from "../../lib/usePublicConfig";
import styles from "./ClaimDialog.module.css";

interface Props {
  /** Número abierto (con su estado actual en vivo) o null si el diálogo está cerrado. */
  number: BoardNumber | null;
  config: PublicConfig | null;
  onClose: () => void;
  /** Se llama tras cualquier respuesta (o falta de ella) para recargar el tablero. */
  onSettled: () => void;
}

const ERROR_TEXT: Record<ClaimError, (limit?: number) => string> = {
  invalid_input: () => "Revisa tu nombre: escribe solo tu nombre de pila, con letras.",
  phone_required: () => "Escribe tu WhatsApp: ahí te confirmamos tu pago.",
  invalid_contact: () => "Revisa tu teléfono o tu correo: parece que algo está mal escrito.",
  number_unavailable: () => "Alguien reservó este número hace un momento. Elige otro en el tablero.",
  rate_limited: () =>
    "Se apartaron muchos números desde esta conexión en poco tiempo. Espera un rato o escríbenos por WhatsApp.",
  phone_limit: (limit) =>
    `Este teléfono ya tiene ${limit ?? "el máximo de"} números apartados sin pagar. Paga alguno de ellos o escríbenos por WhatsApp si quieres apartar más.`,
  raffle_closed: () => "La reserva de números está cerrada.",
};

// Mismas reglas que el servidor (private.clean_first_name).
// Aquí solo sirven para avisar antes de enviar; el servidor decide.
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' .-]*$/;
const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");

type View =
  | { kind: "form" }
  | { kind: "info" }
  | { kind: "submitting" }
  | { kind: "done"; outcome: ClaimOutcome };

export function ClaimDialog({ number, config, onClose, onSettled }: Props) {
  const price = formatPrice(config);
  const hours = holdHours(config);
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>({ kind: "form" });
  const [openedId, setOpenedId] = useState<NumberId | null>(null);
  const [name, setName] = useState("");
  // Trampa para robots: un campo que una persona nunca ve ni llena.
  const [trap, setTrap] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<{ email?: string; phone?: string }>({});

  // Abrir/cerrar el <dialog> nativo según haya número seleccionado.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (number && !d.open) {
      setOpenedId(number.id);
      setView(number.status === "available" ? { kind: "form" } : { kind: "info" });
      setName("");
      setTrap("");
      setEmail("");
      setPhone("");
      setFieldError(null);
      setContactError({});
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
    if (n.length === 0 || n.length > 40 || !NAME_RE.test(n)) {
      setFieldError("Escribe solo tu nombre de pila, con letras (máximo 40).");
      return;
    }
    const ce = contactErrors(email, phone, { phoneRequired: true });
    setContactError(ce);
    if (ce.email || ce.phone) {
      setFieldError(null);
      return;
    }
    setFieldError(null);
    if (trap) {
      // Solo un programa llena el campo oculto: no se envía nada.
      setView({ kind: "done", outcome: { kind: "unknown", message: "No se pudo enviar el registro." } });
      return;
    }
    setView({ kind: "submitting" });
    const outcome = await claimNumber(openedId, n, phone, email);
    setView({ kind: "done", outcome });
    onSettled();
  };

  const locked = submitting || takenMeanwhile;

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
                Reservar el número {openedId}
              </h2>
              <p className={styles.help}>
                Escribe tu nombre de pila y tu WhatsApp.
                {price && (
                  <>
                    {" "}
                    El número cuesta <strong>{price}</strong>.
                  </>
                )}
              </p>

              {takenMeanwhile && (
                <p className={styles.alert} role="alert">
                  Este número acaba de ser reservado por otra persona. Cierra y elige otro.
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
                  disabled={locked}
                />
                <small>Es lo único que se mostrará en el tablero.</small>
              </label>

              <label className={styles.field}>
                <span>WhatsApp</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="55 1234 5678"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (contactError.phone) setContactError((c) => ({ ...c, phone: undefined }));
                  }}
                  maxLength={25}
                  required
                  disabled={locked}
                  aria-invalid={Boolean(contactError.phone)}
                  aria-describedby={contactError.phone ? "err-phone" : "help-phone"}
                />
                {contactError.phone ? (
                  <small id="err-phone" className={styles.fieldError}>
                    {contactError.phone}
                  </small>
                ) : (
                  <small id="help-phone">Ahí te confirmamos tu pago. No se publica.</small>
                )}
              </label>

              <label className={styles.field}>
                <span>
                  Correo <span className={styles.optional}>Opcional</span>
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (contactError.email) setContactError((c) => ({ ...c, email: undefined }));
                  }}
                  maxLength={120}
                  disabled={locked}
                  aria-invalid={Boolean(contactError.email)}
                  aria-describedby={contactError.email ? "err-email" : undefined}
                />
                {contactError.email && (
                  <small id="err-email" className={styles.fieldError}>
                    {contactError.email}
                  </small>
                )}
              </label>

              <div className={styles.trap} aria-hidden="true">
                <label>
                  No llenes este campo
                  <input
                    name="rifa_extra"
                    tabIndex={-1}
                    autoComplete="off"
                    value={trap}
                    onChange={(e) => setTrap(e.target.value)}
                  />
                </label>
              </div>

              {fieldError && (
                <p className={styles.alert} role="alert">
                  {fieldError}
                </p>
              )}

              {hours != null && (
                <p className={styles.notice}>
                  Tu número quedará apartado por <strong>{hoursText(hours)}</strong>. Si no se recibe tu pago en ese
                  plazo, la reserva se cancela y el número podría ya no estar disponible.
                </p>
              )}

              <div className={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={locked}>
                  {submitting ? "Reservando…" : `Reservar el ${openedId}`}
                </button>
              </div>
            </form>
          )}

          {view.kind === "done" && (
            <ResultView
              outcome={view.outcome}
              id={openedId}
              price={price}
              hours={hours}
              onClose={() => ref.current?.close()}
            />
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
        {number.status === "available" && "Cierra esta ventana y vuelve a tocarlo para reservarlo."}
      </p>
      <div className={styles.actions}>
        <form method="dialog">
          <button className="btn btn-primary">Volver al tablero</button>
        </form>
      </div>
    </>
  );
}

interface ResultProps {
  outcome: ClaimOutcome;
  id: NumberId;
  price: string | null;
  hours: number | null;
  onClose: () => void;
}

function ResultView({ outcome, id, price, hours, onClose }: ResultProps) {
  if (outcome.kind === "server" && outcome.result.ok) {
    const r = outcome.result;
    const amount =
      r.price != null
        ? new Intl.NumberFormat("es-MX", { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(
            Number(r.price),
          )
        : price;
    return (
      <div role="status">
        <h2 id="claim-title" className={styles.title}>
          ¡Gracias por ayudarme, {r.first_name}!
        </h2>
        <p className={styles.help}>
          Tu número <strong>{id}</strong> quedó reservado
          {hours != null && (
            <>
              {" "}
              por <strong>{hoursText(hours)}</strong>
            </>
          )}{" "}
          para que puedas realizar tu pago
          {r.expires_at && <> (tienes hasta el {deadlineText(r.expires_at)})</>}. En cuanto me compartas tu comprobante
          de pago, el número quedará bloqueado para ti.
        </p>

        <div className={styles.payBox}>
          <p className={styles.payTitle}>Cómo pagar</p>
          <PaymentInfo price={amount} number={id} name={r.first_name} variant="compact" />
        </div>

        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={onClose}>
            Volver al tablero
          </button>
        </div>
      </div>
    );
  }

  let title = "No se pudo reservar";
  let text: string;
  let wa: string | null = null;
  if (outcome.kind === "server" && !outcome.result.ok) {
    const { error, limit } = outcome.result;
    text = ERROR_TEXT[error](limit);
    if (error === "number_unavailable") title = "Este número ya no está disponible";
    if (error === "phone_limit" || error === "rate_limited")
      wa = whatsappLink(payment.whatsapp, `Hola, quiero apartar el número ${id} de la rifa rumbo a Cracovia.`);
  } else if (outcome.kind === "unknown") {
    title = "No pudimos confirmar tu reserva";
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
        {wa && (
          <a className="btn btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">
            Escribir por WhatsApp
          </a>
        )}
        <button className="btn btn-primary" onClick={onClose}>
          Volver al tablero
        </button>
      </div>
    </div>
  );
}

// Exportado para pruebas.
export const __test = { cleanName, NAME_RE, ERROR_TEXT };
