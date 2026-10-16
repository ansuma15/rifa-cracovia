# Publicar el sitio en GitHub Pages

Resultado: el sitio queda en **https://ansuma15.github.io/rifa-cracovia/** y el panel en
**https://ansuma15.github.io/rifa-cracovia/admin/**.

Si eliges otro nombre de repositorio, la dirección cambia sola; no hay que tocar código.

---

## 1. Preparar la carpeta (WSL)

```bash
cd ~
unzip rifa-krakow-etapa4.zip          # o la ruta donde lo descargaste
cd rifa-krakow
cp /ruta/de/tu/.env.local .            # opcional: solo para probar en local
npm install
npm test && npm run build              # debe terminar sin errores
```

## 2. Crear el repositorio y subir el código

**Opción A: con GitHub CLI** (la más sencilla)

```bash
gh auth login                          # solo la primera vez
git init -b main
git add .
git status                             # revisa que NO aparezca .env.local
git commit -m "Rifa rumbo a Cracovia"
gh repo create rifa-cracovia --public --source=. --push
```

**Opción B: desde la web**

1. En GitHub: **New repository** → nombre `rifa-cracovia` → **Public** → sin README.
2. En WSL:

```bash
git init -b main
git add .
git status                             # revisa que NO aparezca .env.local
git commit -m "Rifa rumbo a Cracovia"
git remote add origin https://github.com/ansuma15/rifa-cracovia.git
git push -u origin main
```

> El repositorio debe ser **público**: GitHub Pages gratuito solo publica repositorios
> públicos. No pasa nada, porque en el código no hay ningún secreto: la URL y la clave de
> Supabase son públicas por diseño y `.env.local` está en `.gitignore`.

## 3. Activar GitHub Pages

En el repositorio: **Settings** → **Pages** → **Build and deployment** → **Source**:
**GitHub Actions**.

## 4. Configurar las variables

**Settings** → **Secrets and variables** → **Actions** → pestaña **Variables** →
**New repository variable**. Crea dos:

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (o la anon key) |

Van en **Variables**, no en *Secrets*: son públicas y deben quedar incrustadas en el sitio.

## 5. Publicar

El push del paso 2 ya lanzó el workflow, pero sin las variables. Vuelve a ejecutarlo:

**Actions** → **Desplegar en GitHub Pages** → **Run workflow** → **Run workflow**.

Tarda 1–2 minutos. Cuando aparezca la palomita verde, abre la dirección del sitio. Cada vez
que hagas `git push` a `main` se vuelve a publicar solo.

## 6. Ajustar la dirección en Supabase

**Authentication** → **URL Configuration** → **Site URL**:
`https://ansuma15.github.io/rifa-cracovia/`

Con contraseña no es indispensable, pero así cualquier correo de Supabase (por ejemplo,
para recuperar tu contraseña) apuntará a tu sitio y no a `localhost`.

## 7. Verificar antes de compartir

- [ ] El sitio muestra "100 números libres", el precio de $700 y la fecha del sorteo.
- [ ] `/admin/` te pide correo y contraseña, y con los tuyos entra al panel.
- [ ] Desde el panel generas un código, lo registras en el sitio desde tu celular, aparece
      en "Por cobrar" y luego lo cancelas con el motivo "Prueba".
- [ ] Mandas el enlace a tu propio chat de WhatsApp y aparece la vista previa con la imagen.
- [ ] Ya pusiste las fotos del premio (ver abajo).

## Fotos del premio

1. Copia las fotos tal como las tengas a `fotos-originales/` (por ejemplo `tv.jpg` y
   `sonido.jpg`).
2. Ejecuta:
   ```bash
   npm run fotos
   ```
   Recorta el margen sobrante, deja el producto **centrado con el mismo espacio en los
   cuatro lados** y guarda una versión ligera en `public/premios/` (`tv.webp`, `sonido.webp`).
3. En `src/content.ts`, dentro de `prize.items`, cambia `image: null` por `image: "tv.webp"`
   y `image: "sonido.webp"`.
4. Revisa con `npm run dev`. Si aún quieres moverla un poco, usa `adjust` en el mismo archivo:
   `{ x: -3 }` mueve a la izquierda, `{ y: 2 }` hacia abajo, `{ zoom: 1.1 }` agranda.
5. `git add . && git commit -m "Fotos del premio" && git push`.

El recorte automático funciona mejor con fotos de **fondo liso** (blanco, gris o
transparente), como las de la página del fabricante.

## Si la vista previa de WhatsApp no aparece o sale vieja

WhatsApp guarda en caché la vista previa la primera vez que ve un enlace. Si compartiste el
enlace antes de que el sitio estuviera listo, pega la dirección en el
[Sharing Debugger de Facebook](https://developers.facebook.com/tools/debug/) y pulsa
**Scrape Again**; WhatsApp usa la misma información. Los chats nuevos mostrarán la versión
actualizada.
