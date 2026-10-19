# Instalar Supabase para la rifa

Tiempo estimado: 15–20 minutos. Todo se hace desde el navegador.

> **Qué puedes compartir y qué no**
>
> | Dato | ¿Es secreto? | Dónde va |
> |---|---|---|
> | Project URL (`https://xxxx.supabase.co`) | No | `.env.local` y variables de GitHub |
> | Publishable key (`sb_publishable_…`) o la *anon key* | No | `.env.local` y variables de GitHub |
> | Secret key (`sb_secret_…`) o *service_role* | **Sí** | En ningún lado: este proyecto no la usa |
> | Contraseña de la base de datos | **Sí** | Tu gestor de contraseñas |
> | Contraseña de tu usuario admin | **Sí** | Solo tú la conoces |
>
> Las dos primeras son públicas *por diseño*: cualquiera las puede ver en el código del sitio.
> La seguridad no depende de ocultarlas, sino de las reglas de la base de datos (RLS y funciones).

---

## 1. Crear el proyecto

1. Entra a <https://supabase.com> y crea una cuenta (puedes usar GitHub).
2. **New project**:
   - Nombre: `rifa-cracovia`.
   - Database password: genera una y guárdala en tu gestor de contraseñas. Este proyecto
     no la vuelve a pedir, pero no la pierdas.
   - Región: la más cercana a México que ofrezca (una de Estados Unidos).
   - Si aparece la opción **Data API**, déjala **activada**: es por donde el sitio lee el
     tablero.
3. Espera a que termine de aprovisionarse (1–2 minutos).

## 2. Instalar el esquema (un solo paso)

1. Menú lateral → **SQL Editor** → **New query**.
2. Abre `supabase/instalacion_completa.sql`, copia **todo** el contenido, pégalo y pulsa **Run**.
3. Resultado esperado: *Success*. Si ves avisos (*NOTICE*), son informativos.

Comprueba que quedó bien, en una consulta nueva:

```sql
select count(*) as numeros from public.raffle_numbers;   -- 100
select public.get_public_config();                        -- price_per_number: 700, MXN
```

## 3. Cerrar el registro público de usuarios

Nadie debe poder crearse una cuenta: el único usuario será el tuyo.

**Authentication** → **Sign In / Providers** (o *Providers*) → desactiva
**Allow new users to sign up**. Deja activado el proveedor **Email**.

> Aunque alguien lograra crear una cuenta, no podría administrar nada: cada función
> de administración verifica que el usuario esté en la lista `private.admin_users`.
> Cerrar el registro es una segunda barrera.

## 4. Crear tu usuario administrador

**Authentication** → **Users** → **Add user** → **Create new user**:

- Tu correo y una contraseña larga (guárdala en tu gestor).
- Marca **Auto Confirm User**.

## 5. Darle permisos de administrador

En el SQL Editor, pega y ejecuta `supabase/snippets/01_registrar_admin.sql` **sin editar
nada**. Registra como administrador al único usuario que existe (el del paso 4) y muestra tu
correo. Si no muestra nada, revisa que en *Authentication → Users* haya exactamente un usuario.

## 6. Copiar la URL y la clave pública

**Project Settings** → **API Keys** (y **Data API** para la URL), o el botón **Connect**
de la parte superior:

- **Project URL** → `https://xxxx.supabase.co`
- **Publishable key** → `sb_publishable_…` (si solo ves la *anon key* de formato anterior,
  también funciona).

## 7. Probar el sitio en tu computadora

En la carpeta del proyecto (en WSL):

```bash
npm install
cp .env.example .env.local
# edita .env.local y pega la URL y la publishable key
npm run dev
```

Abre la dirección que imprime (`http://localhost:5173`). Debes ver las 100 butacas en azul,
"100 números libres" en el boleto y "$700" como precio.

## 8. Probar un registro de punta a punta

La forma más directa es desde el sitio:

1. Toca el **99**, escribe tu nombre y tu WhatsApp, y reserva.
2. Debe confirmarse la reserva y el 99 debe ponerse en ámbar con tu nombre. Si abres el
   sitio en otra ventana o en tu celular, también debe cambiar ahí (Realtime).
3. Intenta reservarlo otra vez: debe decir que ya no está disponible.
4. Ejecuta `supabase/snippets/03_prueba_cancelar.sql` para dejar el 99 disponible otra vez.
   Queda en el historial como "Prueba de instalación".

Si prefieres probar sin abrir el sitio, `supabase/snippets/02_prueba_reservar.sql` aparta el
99 desde el SQL Editor.

> **Consejo para el SQL Editor:** abre una consulta nueva (*New query*) para cada archivo,
> pega el contenido completo y no selecciones texto antes de pulsar *Run*. Si hay texto
> seleccionado, el editor ejecuta solo esa parte.

## 9. Publicar en GitHub Pages

1. Sube el proyecto a un repositorio de GitHub (por ejemplo `rifa-cracovia`).
2. **Settings** → **Pages** → **Source**: *GitHub Actions*.
3. **Settings** → **Secrets and variables** → **Actions** → pestaña **Variables** →
   **New repository variable** (variables, no secretos):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Haz push a `main`. El workflow *Desplegar en GitHub Pages* compila, prueba y publica en
   `https://<tu-usuario>.github.io/rifa-cracovia/`.

---

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| El tablero dice "Tablero en preparación" | Faltan las variables en `.env.local` o en GitHub, o tienen otro nombre |
| "No pudimos cargar el tablero" | URL o clave mal copiadas, o el paso 2 no se ejecutó completo |
| El paso 5 no muestra ningún correo | No hay usuarios, o hay más de uno, en *Authentication → Users* |
| La prueba responde `forbidden` | El paso 5 no se completó |
| `syntax error` | Se ejecutó solo una parte del archivo (había texto seleccionado) o se modificó una comilla al copiar. Vuelve a pegar el archivo completo en una consulta nueva |
| Los cambios no aparecen al instante en otro dispositivo | Realtime no conectó; el sitio igual se actualiza cada 30 s. Revisa en *Database → Publications* que `supabase_realtime` incluya `raffle_numbers` |
