import { useEffect, useState, type FormEvent } from "react";
import { fetchPublicConfig } from "../lib/api";
import type { PublicConfig } from "../lib/types";
import { adminApi } from "./api";
import type { RunAction } from "./Dashboard";
import styles from "./Admin.module.css";

export function SettingsTab({ run }: { run: RunAction }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("");

  const load = () =>
    fetchPublicConfig().then((c) => {
      setConfig(c);
      setPrice(c.price_per_number != null ? String(Number(c.price_per_number)) : "");
      setHours(c.reservation_hours != null ? String(Number(c.reservation_hours)) : "");
    });

  useEffect(() => {
    void load();
  }, []);

  if (!config) return <p className={styles.empty}>Cargando…</p>;

  const savePrice = async (e: FormEvent) => {
    e.preventDefault();
    if (await run("Precio actualizado", () => adminApi.updateSettings({ price_per_number: Number(price) }))) void load();
  };

  const saveHours = async (e: FormEvent) => {
    e.preventDefault();
    const value = hours.trim() === "" ? null : Number(hours);
    if (value != null && (!Number.isFinite(value) || value < 1)) return;
    if (await run("Plazo de reserva actualizado", () => adminApi.updateSettings({ reservation_hours: value }))) void load();
  };

  const toggleOpen = async () => {
    const next = !config.registrations_open;
    const msg = next
      ? "¿Abrir de nuevo el registro de números?"
      : "¿Cerrar el registro? Nadie podrá registrar números, aunque tenga código. Úsalo antes del sorteo.";
    if (!window.confirm(msg)) return;
    if (await run(next ? "Registro abierto" : "Registro cerrado", () => adminApi.updateSettings({ registrations_open: next })))
      void load();
  };

  return (
    <div className={styles.settings}>
      <form onSubmit={savePrice} className={styles.form}>
        <label className={styles.field}>
          <span>Precio por número (MXN)</span>
          <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <p className={styles.help}>Se muestra en el sitio y se usa como monto sugerido al confirmar pagos.</p>
        <button className="btn btn-primary">Guardar precio</button>
      </form>

      <form onSubmit={saveHours} className={styles.form}>
        <label className={styles.field}>
          <span>Horas para pagar una reserva</span>
          <input type="number" min="1" step="1" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Sin límite" />
        </label>
        <p className={styles.help}>
          Al vencer, la reserva se cancela sola y el número vuelve a quedar libre. Aplica a las reservas nuevas. Vacío =
          sin límite.
        </p>
        <button className="btn btn-primary">Guardar plazo</button>
      </form>

      <div className={styles.form}>
        <p className={styles.fieldLabel}>Registro de números</p>
        <p>
          Ahora está <strong>{config.registrations_open ? "abierto" : "cerrado"}</strong>.
        </p>
        <p className={styles.help}>Ciérralo antes del sorteo para congelar el tablero.</p>
        <button className={`btn ${config.registrations_open ? styles.btnDanger : "btn-primary"}`} onClick={toggleOpen}>
          {config.registrations_open ? "Cerrar registro" : "Abrir registro"}
        </button>
      </div>
    </div>
  );
}
