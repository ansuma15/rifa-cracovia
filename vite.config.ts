import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// GitHub Pages sirve el sitio en https://<usuario>.github.io/<repositorio>/,
// así que todos los recursos deben resolverse bajo /<repositorio>/.
// El workflow de despliegue define BASE_PATH y SITE_URL; en local se usa "/".
const base = process.env.BASE_PATH ?? "/";
// new URL() normaliza el dominio a minúsculas (DeadLogic666.github.io → deadlogic666.github.io).
const siteUrl = process.env.SITE_URL ? new URL(process.env.SITE_URL.replace(/\/?$/, "/")).href : "/";

/**
 * WhatsApp y las redes exigen URLs ABSOLUTAS en og:image y og:url.
 * Este plugin reemplaza __SITE_URL__ en el HTML por la dirección pública.
 * Sin SITE_URL (desarrollo local) se quitan esas etiquetas para no publicar
 * una dirección falsa.
 */
function siteUrlPlugin(): Plugin {
  return {
    name: "site-url",
    transformIndexHtml(html) {
      if (siteUrl === "/") return html.replace(/^\s*<(?:meta|link)[^>]*__SITE_URL__[^>]*>\n/gm, "");
      return html.replaceAll("__SITE_URL__", siteUrl);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), siteUrlPlugin()],
  build: {
    rollupOptions: {
      // Dos páginas reales: el sitio público y el panel.
      // Así /admin/ existe como archivo y GitHub Pages no responde 404.
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    // Las pruebas unitarias nunca hablan con una base real, aunque exista .env.local.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_SUPABASE_ANON_KEY: "" },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
