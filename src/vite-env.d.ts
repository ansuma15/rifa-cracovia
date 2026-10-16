/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Los paquetes @fontsource exportan "./700" → "./700.css" (solo CSS, sin tipos).
declare module "@fontsource/big-shoulders-display/*";
