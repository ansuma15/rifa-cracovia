# Rifa solidaria · Rumbo a Cracovia

Plataforma web para la rifa que financia mi intercambio académico en AGH University of
Krakow (vuelos, seguro médico y gastos de vida).

- **Frontend:** React + TypeScript + Vite, publicado en GitHub Pages.
- **Backend:** Supabase (PostgreSQL, Auth, Realtime). Toda la lógica sensible vive en
  funciones de la base de datos; el navegador nunca decide nada importante.

## Estado

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Arquitectura, esquema SQL, funciones seguras, RLS, pruebas de base de datos | ✅ |
| 2 | Interfaz pública (encabezado, premio, propósito, reglas, tablero) | ✅ |
| 3 | Integración Supabase en el frontend (tablero en vivo, registro) | ✅ |
| 4 | Panel administrativo (`/admin/`) | ✅ |
| 5 | Vista previa para WhatsApp, botones para compartir, despliegue en GitHub Pages | ✅ |

## Guías

| Para | Lee |
|---|---|
| Instalar la base de datos | [docs/INSTALAR_SUPABASE.md](docs/INSTALAR_SUPABASE.md) |
| Publicar el sitio | [docs/PUBLICAR.md](docs/PUBLICAR.md) |
| Generar códigos, cobrar, cancelar, cerrar el registro | [docs/OPERAR_LA_RIFA.md](docs/OPERAR_LA_RIFA.md) |
| Entender cómo está hecho | [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) |

## Estructura

```
src/                          sitio público en React + TypeScript (ver ARQUITECTURA §11)
src/admin/ + admin/index.html panel de administración
public/compartir.jpg          imagen de vista previa para WhatsApp
docs/ARQUITECTURA.md          decisiones técnicas, modelo de datos y flujos
supabase/migrations/          esquema, integridad, funciones, permisos, Realtime/cron, config
supabase/instalacion_completa.sql  las migraciones en un solo archivo para el SQL Editor
supabase/snippets/            registrar al admin y prueba rápida
tests/db/                     pruebas de los casos críticos contra PostgreSQL
.github/workflows/            CI de base de datos y frontend, despliegue a Pages
```

## Ejecutar el sitio en local

Requiere Node 22.

```bash
npm install
cp .env.example .env.local   # pon la URL y la clave PÚBLICA de tu proyecto Supabase
npm run dev
```

Sin `.env.local` el sitio funciona igual, pero el tablero muestra "en preparación".

```bash
npm test          # pruebas del frontend
npm run build     # compilación de producción
```

## Desplegar en GitHub Pages

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables** (no secretos, son públicos):
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Cada push a `main` compila y publica en `https://<usuario>.github.io/<repositorio>/`.

## Editar textos y fotos del premio

- Textos: `src/content.ts`.
- Fotos: colócalas en `public/premios/` y escribe el nombre del archivo en
  `prize.items[].image` dentro de `src/content.ts`.

## Pruebas de la base de datos

Requiere PostgreSQL 16 y Python 3.11+.

```bash
pip install -r tests/db/requirements.txt
cd tests/db
DATABASE_URL=postgresql://postgres@localhost:5432/postgres pytest -q
```

## Configurar Supabase

Guía paso a paso: [docs/INSTALAR_SUPABASE.md](docs/INSTALAR_SUPABASE.md).

**Nunca** subas al repositorio la clave de servicio de Supabase ni códigos de autorización.
