import { site } from "../content";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.inner}`}>
        <p className={styles.thanks}>Gracias por ayudarme a llegar más lejos.</p>
        <p className={styles.meta}>
          Rifa organizada por {site.organizer}. Los pagos se reciben y confirman de forma personal; este sitio
          nunca te pedirá datos bancarios.
        </p>
      </div>
    </footer>
  );
}
