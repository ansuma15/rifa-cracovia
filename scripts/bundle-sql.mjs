// Une las migraciones en supabase/instalacion_completa.sql para pegarlas
// de una sola vez en el SQL Editor de Supabase.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const header = [
  "-- =====================================================================",
  "-- INSTALACIÓN COMPLETA (generado a partir de supabase/migrations/)",
  "-- Pega TODO este archivo en Supabase → SQL Editor y ejecútalo una vez.",
  "-- Si cambias una migración, regenera este archivo: npm run sql:bundle",
  "-- =====================================================================",
].join("\n");
const body = files.map((f) => `\n-- >>> ${f}\n${readFileSync(join(dir, f), "utf8")}`).join("");
writeFileSync("supabase/instalacion_completa.sql", `${header}\n${body}`);
console.log(`instalacion_completa.sql: ${files.length} migraciones`);
