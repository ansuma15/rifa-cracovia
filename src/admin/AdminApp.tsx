import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { adminApi } from "./api";
import { Dashboard } from "./Dashboard";
import styles from "./Admin.module.css";

type Gate = "loading" | "signed_out" | "not_admin" | "admin";

/**
 * Puerta de entrada del panel. Ocultar la interfaz NO es la seguridad:
 * aunque alguien viera el panel, cada operación la valida el servidor
 * (private.assert_admin). Esto solo evita mostrar algo que no funcionaría.
 */
export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState<Gate>("loading");

  const evaluate = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) return setGate("signed_out");
    try {
      setGate((await adminApi.isAdmin()) ? "admin" : "not_admin");
    } catch {
      setGate("not_admin");
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      void evaluate(s);
    });
    return () => data.subscription.unsubscribe();
  }, [evaluate]);

  if (!supabase) {
    return (
      <Centered title="Panel sin conexión">
        <p>Faltan las variables de Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY).</p>
      </Centered>
    );
  }

  if (gate === "loading") return <Centered title="Cargando…" />;
  if (gate === "signed_out") return <Login />;
  if (gate === "not_admin") {
    return (
      <Centered title="Sin permisos">
        <p>La cuenta {session?.user.email} no es administradora de esta rifa.</p>
        <button className="btn btn-ghost" onClick={() => void supabase?.auth.signOut()}>
          Cerrar sesión
        </button>
      </Centered>
    );
  }
  return <Dashboard email={session?.user.email ?? ""} onSignOut={() => void supabase?.auth.signOut()} />;
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className={styles.centered}>
      <div className={styles.card}>
        <h1 className={styles.cardTitle}>{title}</h1>
        {children}
      </div>
    </main>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // Mensaje genérico: no revelar si el correo existe.
    if (error) setError("Correo o contraseña incorrectos.");
  };

  return (
    <Centered title="Panel de la rifa">
      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.field}>
          <span>Correo</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={styles.field}>
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </Centered>
  );
}
