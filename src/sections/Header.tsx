import styles from "./Header.module.css";

const LINKS = [
  { href: "#premio", label: "Premio" },
  { href: "#quien-soy", label: "Quién soy" },
  { href: "#numeros", label: "Números" },
  { href: "#participar", label: "Participar" },
];

export function Header() {
  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.inner}`}>
        <a href="#inicio" className={styles.brand}>
          Rumbo a Cracovia
        </a>
        <nav aria-label="Secciones">
          <ul className={styles.links}>
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
