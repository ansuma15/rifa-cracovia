-- =====================================================================
-- INSTALACIÓN COMPLETA (generado a partir de supabase/migrations/)
-- Pega TODO este archivo en Supabase → SQL Editor y ejecútalo una vez.
-- Si cambias una migración, regenera este archivo: npm run sql:bundle
-- =====================================================================

-- >>> 20261011000100_schema.sql
-- =====================================================================
-- Rifa Cracovia · Migración 1: esquema de datos
-- ---------------------------------------------------------------------
-- Principio rector: el esquema público ("public") contiene SOLO lo que
-- cualquier visitante puede ver. Todo lo privado vive en el esquema
-- "private", que PostgREST no expone y al que anon/authenticated no
-- tienen acceso. Las operaciones se hacen mediante funciones RPC.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

-- ---------------------------------------------------------------------
-- 1. Tablero público: exactamente 100 números, del "00" al "99".
--    El id es TEXTO para conservar el cero inicial ("00", "07").
--    Esta tabla se replica por Realtime, por eso solo tiene columnas
--    públicas. Nadie la escribe directamente: la mantiene un trigger
--    a partir de private.participations (fuente de verdad).
-- ---------------------------------------------------------------------
create table public.raffle_numbers (
  id          text primary key
              check (id ~ '^[0-9]{2}$'),
  status      text not null default 'available'
              check (status in ('available', 'reserved', 'paid')),
  public_name text
              check (public_name is null or char_length(public_name) between 1 and 40),
  updated_at  timestamptz not null default now(),
  -- Un número disponible nunca muestra nombre; uno asignado siempre.
  constraint raffle_numbers_name_matches_status
    check ((status = 'available') = (public_name is null))
);

comment on table public.raffle_numbers is
  'Vista pública del tablero. Solo id, estado y nombre de pila. Mantenida por private.sync_number().';

insert into public.raffle_numbers (id)
select lpad(g::text, 2, '0') from generate_series(0, 99) as g;

-- ---------------------------------------------------------------------
-- 2. Administradores (vinculados a Supabase Auth)
-- ---------------------------------------------------------------------
create table private.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Configuración (fila única)
-- ---------------------------------------------------------------------
create table private.settings (
  id                 boolean primary key default true check (id),
  registrations_open boolean not null default true,
  -- null = las reservas no expiran (valor por defecto: el administrador
  -- confirma o cancela cada reserva manualmente). Si algún día se fija un
  -- plazo, private.expire_reservations() libera las vencidas.
  reservation_ttl    interval default null
                     check (reservation_ttl is null or reservation_ttl >= interval '5 minutes'),
  price_per_number   numeric(10, 2) check (price_per_number is null or price_per_number >= 0),
  currency           text not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);

insert into private.settings default values;

-- ---------------------------------------------------------------------
-- 4. Participantes: solo lo mínimo. El registro público pide únicamente
--    el nombre de pila; contacto y notas los agrega el administrador.
-- ---------------------------------------------------------------------
create table private.participants (
  id         uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 40),
  contact    text check (contact is null or char_length(contact) <= 120),
  notes      text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Códigos de autorización. Se guarda SOLO el hash bcrypt; el texto
--    plano se devuelve una única vez al generarlo.
--    Máquina de estados: issued -> consumed | revoked (ambos terminales).
-- ---------------------------------------------------------------------
create table private.authorization_codes (
  id            uuid primary key default gen_random_uuid(),
  number_id     text not null references public.raffle_numbers (id),
  code_hash     text not null,
  status        text not null default 'issued'
                check (status in ('issued', 'consumed', 'revoked')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  delivery_note text check (delivery_note is null or char_length(delivery_note) <= 200),
  consumed_at   timestamptz,
  revoked_at    timestamptz,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 200),
  constraint codes_consumed_has_date check ((status = 'consumed') = (consumed_at is not null)),
  constraint codes_revoked_has_date  check ((status = 'revoked')  = (revoked_at  is not null))
);

-- Como máximo un código vigente por número: el código del 25 jamás
-- compite con otro, y la validación compara contra un único hash.
create unique index authorization_codes_one_issued_per_number
  on private.authorization_codes (number_id)
  where status = 'issued';

create index authorization_codes_number_idx on private.authorization_codes (number_id);

-- ---------------------------------------------------------------------
-- 6. Participaciones (asignaciones). Fuente de verdad del tablero.
--    reserved -> paid -> cancelled
--    reserved -> cancelled | expired
--    cancelled y expired son terminales (historial inmutable).
-- ---------------------------------------------------------------------
create table private.participations (
  id             uuid primary key default gen_random_uuid(),
  number_id      text not null references public.raffle_numbers (id),
  participant_id uuid not null references private.participants (id),
  -- unique: un código solo puede originar UNA participación, nunca dos.
  code_id        uuid not null unique references private.authorization_codes (id),
  status         text not null default 'reserved'
                 check (status in ('reserved', 'paid', 'cancelled', 'expired')),
  reserved_at    timestamptz not null default now(),
  expires_at     timestamptz,
  paid_at        timestamptz,
  amount_paid    numeric(10, 2) check (amount_paid is null or amount_paid >= 0),
  payment_note   text check (payment_note is null or char_length(payment_note) <= 300),
  confirmed_by   uuid references auth.users (id) on delete set null,
  ended_at       timestamptz,
  end_reason     text check (end_reason is null or char_length(end_reason) <= 300),
  constraint participations_paid_has_data
    check (status <> 'paid' or (paid_at is not null and amount_paid is not null)),
  constraint participations_reserved_not_paid
    check (status <> 'reserved' or (paid_at is null and ended_at is null)),
  constraint participations_ended_has_date
    check ((status in ('cancelled', 'expired')) = (ended_at is not null))
);

-- Última línea de defensa contra duplicados: aunque una función tuviera
-- un error, la base de datos rechaza dos participaciones activas
-- para el mismo número.
create unique index participations_one_active_per_number
  on private.participations (number_id)
  where status in ('reserved', 'paid');

create index participations_expiry_idx
  on private.participations (expires_at)
  where status = 'reserved';

create index participations_participant_idx on private.participations (participant_id);

-- ---------------------------------------------------------------------
-- 7. Historial administrativo (solo anexar)
-- ---------------------------------------------------------------------
create table private.admin_audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,          -- null = visitante público o sistema
  actor_label text not null, -- correo del admin, 'public' o 'system'
  action      text not null,
  number_id   text,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb
);

create index admin_audit_log_created_idx on private.admin_audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- 8. Intentos de registro (limitación de intentos fallidos).
--    client_key es un hash truncado de la IP, no la IP en claro.
-- ---------------------------------------------------------------------
create table private.claim_attempts (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  client_key text not null,
  number_id  text,
  outcome    text not null
);

create index claim_attempts_lookup_idx on private.claim_attempts (client_key, created_at desc);

-- >>> 20261011000200_integrity.sql
-- =====================================================================
-- Rifa Cracovia · Migración 2: integridad
-- ---------------------------------------------------------------------
-- Los CHECK y los índices únicos protegen cada fila por separado.
-- Estos triggers protegen las TRANSICIONES: aunque alguien con acceso
-- directo a la base (o un error futuro en una función) intente
-- "revivir" un código consumido o editar el historial, la base de
-- datos lo rechaza.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sincronización del tablero público desde la fuente de verdad
-- ---------------------------------------------------------------------
create or replace function private.sync_number(p_number text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_name   text;
begin
  select p.status, pa.first_name
    into v_status, v_name
    from private.participations p
    join private.participants pa on pa.id = p.participant_id
   where p.number_id = p_number
     and p.status in ('reserved', 'paid');

  v_status := coalesce(v_status, 'available');

  update public.raffle_numbers
     set status      = v_status,
         public_name = v_name,
         updated_at  = now()
   where id = p_number
     and (status is distinct from v_status or public_name is distinct from v_name);
end;
$$;

create or replace function private.trg_participations_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.sync_number(new.number_id);
  return null;
end;
$$;

create trigger participations_sync_board
after insert or update on private.participations
for each row execute function private.trg_participations_sync();

-- Si el administrador corrige un nombre, el tablero se actualiza solo.
create or replace function private.trg_participants_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_number text;
begin
  if new.first_name is distinct from old.first_name then
    for v_number in
      select number_id from private.participations
       where participant_id = new.id and status in ('reserved', 'paid')
    loop
      perform private.sync_number(v_number);
    end loop;
  end if;
  return null;
end;
$$;

create trigger participants_sync_board
after update on private.participants
for each row execute function private.trg_participants_sync();

-- ---------------------------------------------------------------------
-- Máquina de estados de los códigos
-- ---------------------------------------------------------------------
create or replace function private.trg_codes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'authorization codes cannot be deleted' using errcode = '42501';
  end if;

  if new.id <> old.id or new.number_id <> old.number_id or new.code_hash <> old.code_hash
     or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'immutable code fields cannot change' using errcode = '42501';
  end if;

  if old.status <> 'issued' then
    raise exception 'code in terminal state % cannot change', old.status using errcode = '42501';
  end if;

  if new.status not in ('issued', 'consumed', 'revoked') then
    raise exception 'invalid code transition' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger authorization_codes_guard
before update or delete on private.authorization_codes
for each row execute function private.trg_codes_guard();

-- ---------------------------------------------------------------------
-- Máquina de estados de las participaciones
-- ---------------------------------------------------------------------
create or replace function private.trg_participations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'participations cannot be deleted' using errcode = '42501';
  end if;

  if new.id <> old.id or new.number_id <> old.number_id
     or new.participant_id <> old.participant_id or new.code_id <> old.code_id
     or new.reserved_at <> old.reserved_at then
    raise exception 'immutable participation fields cannot change' using errcode = '42501';
  end if;

  if old.status in ('cancelled', 'expired') then
    raise exception 'participation in terminal state % cannot change', old.status
      using errcode = '42501';
  end if;

  if not (
       (old.status = 'reserved' and new.status in ('reserved', 'paid', 'cancelled', 'expired'))
    or (old.status = 'paid'     and new.status in ('paid', 'cancelled'))
  ) then
    raise exception 'invalid participation transition % -> %', old.status, new.status
      using errcode = '42501';
  end if;

  -- Un pago confirmado no se puede reescribir en silencio.
  if old.status = 'paid' and (new.paid_at <> old.paid_at or new.amount_paid <> old.amount_paid) then
    raise exception 'confirmed payment data cannot change' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger participations_guard
before update or delete on private.participations
for each row execute function private.trg_participations_guard();

-- ---------------------------------------------------------------------
-- Historial de solo anexar
-- ---------------------------------------------------------------------
create or replace function private.trg_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit log is append-only' using errcode = '42501';
end;
$$;

create trigger admin_audit_log_append_only
before update or delete on private.admin_audit_log
for each row execute function private.trg_audit_append_only();

create trigger admin_audit_log_no_truncate
before truncate on private.admin_audit_log
for each statement execute function private.trg_audit_append_only();

-- El tablero público solo tiene 100 filas fijas.
create or replace function private.trg_numbers_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'raffle numbers are fixed (00-99)' using errcode = '42501';
end;
$$;

create trigger raffle_numbers_no_delete
before delete on public.raffle_numbers
for each row execute function private.trg_numbers_fixed();

create trigger raffle_numbers_no_truncate
before truncate on public.raffle_numbers
for each statement execute function private.trg_numbers_fixed();

-- >>> 20261011000300_functions.sql
-- =====================================================================
-- Rifa Cracovia · Migración 3: funciones
-- ---------------------------------------------------------------------
-- Todas las funciones expuestas son SECURITY DEFINER con
-- search_path = '' (nombres totalmente calificados). Así el visitante
-- nunca necesita permisos sobre las tablas privadas: solo puede pedir
-- operaciones concretas, y cada operación valida todo en el servidor.
-- =====================================================================

-- =====================================================================
-- A. Utilidades internas (esquema private, no invocables por el público)
-- =====================================================================

-- Alfabeto Crockford Base32: sin I, L, O ni U para evitar confusiones
-- al dictar o copiar. 12 caracteres × 5 bits = 60 bits de entropía.
create or replace function private.random_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code  text  := '';
begin
  for i in 0..11 loop
    -- 32 símbolos = 2^5: tomar 5 bits de cada byte no introduce sesgo.
    v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- Normaliza lo que escribe el participante: ignora guiones, espacios y
-- mayúsculas, y aplica las equivalencias Crockford (O->0, I/L->1).
create or replace function private.normalize_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
$$;

create or replace function private.format_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substr(p_code, 1, 4) || '-' || substr(p_code, 5, 4) || '-' || substr(p_code, 9, 4);
$$;

-- Devuelve el nombre limpio o null si no es válido. Se aceptan letras
-- (con acentos), espacios, apóstrofo, punto y guion. Sin dígitos ni
-- símbolos: evita que alguien publique enlaces o teléfonos en el tablero.
create or replace function private.clean_first_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v) between 1 and 40
     and v ~ '^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'' .-]*$' then
    return v;
  end if;
  return null;
end;
$$;

-- Identificador del cliente para limitar intentos: hash truncado de la IP.
create or replace function private.client_key()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers json;
  v_ip      text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  v_ip := coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    split_part(v_headers ->> 'x-forwarded-for', ',', 1)
  );
  v_ip := nullif(btrim(v_ip), '');

  if v_ip is null then
    return 'unknown';
  end if;
  return left(encode(extensions.digest(v_ip, 'sha256'), 'hex'), 24);
end;
$$;

create or replace function private.current_admin_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select au.user_id from private.admin_users au where au.user_id = auth.uid();
$$;

create or replace function private.assert_admin()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid := private.current_admin_id();
begin
  if v_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

create or replace function private.audit(
  p_action      text,
  p_number      text default null,
  p_entity      uuid default null,
  p_details     jsonb default '{}'::jsonb,
  p_actor_label text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into private.admin_audit_log (actor_id, actor_label, action, number_id, entity_id, details)
  values (
    auth.uid(),
    coalesce(p_actor_label, auth.jwt() ->> 'email', case when auth.uid() is null then 'public' else 'admin' end),
    p_action,
    p_number,
    p_entity,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

-- Expira las reservas vencidas. Si se pasa un número, solo revisa ese.
-- El código consumido sigue consumido: liberar un número NUNCA lo reactiva.
create or replace function private.expire_reservations(p_number text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_number text;
  v_part   private.participations;
  v_count  integer := 0;
begin
  for v_number in
    select p.number_id
      from private.participations p
     where p.status = 'reserved'
       and p.expires_at is not null
       and p.expires_at <= now()
       and (p_number is null or p.number_id = p_number)
     order by p.number_id
  loop
    -- Mismo orden de bloqueo que el resto de funciones: primero el número,
    -- luego la participación. Así nunca hay interbloqueos. Si otra
    -- transacción tiene el número, se omite y se reintenta en la
    -- siguiente ejecución (el propio llamante ya posee su bloqueo).
    perform 1 from public.raffle_numbers where id = v_number for update skip locked;
    if not found then
      continue;
    end if;

    select * into v_part
      from private.participations
     where number_id = v_number and status = 'reserved'
       and expires_at is not null and expires_at <= now()
     for update;
    if not found then
      continue;
    end if;

    update private.participations
       set status = 'expired', ended_at = now(), end_reason = 'reservation_expired'
     where id = v_part.id;

    perform private.audit('reservation_expired', v_number, v_part.id,
                          jsonb_build_object('expires_at', v_part.expires_at), 'system');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Limpieza periódica de intentos antiguos.
create or replace function private.purge_claim_attempts()
returns integer
language sql
set search_path = ''
as $$
  with d as (
    delete from private.claim_attempts where created_at < now() - interval '7 days' returning 1
  )
  select count(*)::integer from d;
$$;

-- =====================================================================
-- B. API pública
-- =====================================================================

-- Configuración visible para todos (precio, plazo de reserva, etc.)
create or replace function public.get_public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registrations_open', s.registrations_open,
    'price_per_number',   s.price_per_number,
    'currency',           s.currency,
    'reservation_hours',  case when s.reservation_ttl is null then null
                               else round(extract(epoch from s.reservation_ttl) / 3600.0, 2) end
  )
  from private.settings s;
$$;

-- ---------------------------------------------------------------------
-- claim_number: el corazón del sistema.
-- Devuelve jsonb {ok, error?...} en lugar de lanzar excepciones para
-- que (1) el registro de intentos fallidos sí se guarde y (2) los
-- mensajes al público sean siempre genéricos y no filtren información.
--
-- Errores posibles (todos sin datos sensibles):
--   invalid_input       número, nombre o formato de código inválidos
--   raffle_closed       el administrador cerró los registros
--   rate_limited        demasiados códigos incorrectos desde este cliente
--   number_unavailable  el número ya está reservado o pagado
--   invalid_code        código inexistente, de otro número, revocado o usado
-- ---------------------------------------------------------------------
create or replace function public.claim_number(p_number text, p_first_name text, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Hash señuelo: se compara contra él cuando no hay código vigente para
  -- que el tiempo de respuesta no revele qué números tienen código.
  c_dummy_hash constant text := '$2a$08$2bAWyAjWCjdI2zLdeXh9hO80RZgkoGlF3OkxyXSmw.MTaV3Pyjmna';
  c_max_failures constant integer := 8;
  c_window constant interval := interval '15 minutes';

  v_key        text := private.client_key();
  v_name       text := private.clean_first_name(p_first_name);
  v_code_norm  text := private.normalize_code(p_code);
  v_settings   private.settings;
  v_number     public.raffle_numbers;
  v_code       private.authorization_codes;
  v_hash       text;
  v_valid      boolean;
  v_failures   integer;
  v_participant_id uuid;
  v_participation  private.participations;
begin
  -- 1. Validación de forma (barata, antes de tocar nada)
  if p_number is null or p_number !~ '^[0-9]{2}$' or v_name is null
     or v_code_norm !~ '^[0-9A-Z]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select * into v_settings from private.settings;
  if not v_settings.registrations_open then
    return jsonb_build_object('ok', false, 'error', 'raffle_closed');
  end if;

  -- 2. Límite de intentos fallidos por cliente
  select count(*) into v_failures
    from private.claim_attempts
   where client_key = v_key
     and outcome = 'invalid_code'
     and created_at > now() - c_window;

  if v_failures >= (case when v_key = 'unknown' then c_max_failures * 10 else c_max_failures end) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- 3. Bloquear la fila del número. Cualquier otra solicitud para el
  --    mismo número espera aquí hasta que esta transacción termine:
  --    esto es lo que hace imposible la doble asignación.
  select * into v_number from public.raffle_numbers where id = p_number for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- 3b. Expiración perezosa: si la reserva vigente ya venció, se libera
  --     aquí mismo aunque el job periódico todavía no haya corrido.
  if v_number.status = 'reserved' then
    perform private.expire_reservations(p_number);
    select * into v_number from public.raffle_numbers where id = p_number;
  end if;

  if v_number.status <> 'available' then
    insert into private.claim_attempts (client_key, number_id, outcome)
    values (v_key, p_number, 'number_unavailable');
    return jsonb_build_object('ok', false, 'error', 'number_unavailable');
  end if;

  -- 4. Buscar el único código vigente de ESTE número y bloquearlo.
  --    El código de otro número simplemente no aparece en esta consulta.
  select * into v_code
    from private.authorization_codes
   where number_id = p_number and status = 'issued'
   for update;

  v_hash  := coalesce(v_code.code_hash, c_dummy_hash);
  v_valid := (extensions.crypt(v_code_norm, v_hash) = v_hash) and v_code.id is not null;

  if not v_valid then
    insert into private.claim_attempts (client_key, number_id, outcome)
    values (v_key, p_number, 'invalid_code');
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  -- 5. Escritura atómica. Si cualquier paso falla, el sub-bloque se
  --    revierte completo: el código NO queda consumido a medias.
  begin
    update private.authorization_codes
       set status = 'consumed', consumed_at = now()
     where id = v_code.id and status = 'issued';
    if not found then
      raise exception using errcode = 'P0001', message = 'code_race';
    end if;

    insert into private.participants (first_name)
    values (v_name)
    returning id into v_participant_id;

    insert into private.participations (number_id, participant_id, code_id, expires_at)
    values (p_number, v_participant_id, v_code.id, now() + v_settings.reservation_ttl)
    returning * into v_participation;

    perform private.audit('number_claimed', p_number, v_participation.id,
                          jsonb_build_object('code_id', v_code.id), 'public');
  exception
    when unique_violation or raise_exception then
      insert into private.claim_attempts (client_key, number_id, outcome)
      values (v_key, p_number, 'number_unavailable');
      return jsonb_build_object('ok', false, 'error', 'number_unavailable');
  end;

  insert into private.claim_attempts (client_key, number_id, outcome)
  values (v_key, p_number, 'ok');

  return jsonb_build_object(
    'ok',         true,
    'number',     p_number,
    'first_name', v_name,
    'status',     'reserved',
    'expires_at', v_participation.expires_at,
    'price',      v_settings.price_per_number,
    'currency',   v_settings.currency
  );
end;
$$;

-- =====================================================================
-- C. API de administración (requiere sesión de un admin registrado)
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_admin_id() is not null;
$$;

-- Genera códigos para los números indicados (o para todos los disponibles
-- sin código vigente si p_numbers es null). Devuelve el texto plano UNA
-- sola vez: el frontend lo ofrece como descarga y nunca lo vuelve a ver.
-- Operación atómica: si un número no es elegible, no se genera ninguno.
create or replace function public.admin_generate_codes(p_numbers text[] default null)
returns table (number_id text, code text, code_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin   uuid := private.assert_admin();
  v_targets text[];
  v_bad     text[];
  v_num     text;
  v_plain   text;
  v_id      uuid;
begin
  if p_numbers is null then
    select array_agg(rn.id order by rn.id) into v_targets
      from public.raffle_numbers rn
     where rn.status = 'available'
       and not exists (select 1 from private.authorization_codes c
                        where c.number_id = rn.id and c.status = 'issued');
  else
    select array_agg(distinct x order by x) into v_targets from unnest(p_numbers) x;
  end if;

  if v_targets is null or cardinality(v_targets) = 0 then
    return;
  end if;

  -- Bloquear en orden para evitar interbloqueos con registros simultáneos.
  perform 1 from public.raffle_numbers rn where rn.id = any(v_targets) order by rn.id for update;

  select array_agg(t order by t) into v_bad
    from unnest(v_targets) t
   where t !~ '^[0-9]{2}$'
      or not exists (select 1 from public.raffle_numbers rn where rn.id = t and rn.status = 'available')
      or exists (select 1 from private.authorization_codes c where c.number_id = t and c.status = 'issued');

  if v_bad is not null then
    raise exception 'not_eligible: %', array_to_string(v_bad, ',')
      using errcode = '22023',
            hint = 'Solo se generan códigos para números disponibles sin código vigente.';
  end if;

  foreach v_num in array v_targets loop
    v_plain := private.random_code();
    insert into private.authorization_codes (number_id, code_hash, created_by)
    values (v_num, extensions.crypt(v_plain, extensions.gen_salt('bf', 8)), v_admin)
    returning id into v_id;

    perform private.audit('code_generated', v_num, v_id);

    number_id := v_num;
    code      := private.format_code(v_plain);
    code_id   := v_id;
    return next;
  end loop;
end;
$$;

create or replace function public.admin_revoke_code(p_code_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code private.authorization_codes;
begin
  perform private.assert_admin();

  select * into v_code from private.authorization_codes where id = p_code_id for update;
  if not found then
    raise exception 'code_not_found' using errcode = 'P0002';
  end if;
  if v_code.status <> 'issued' then
    raise exception 'code_not_revocable: %', v_code.status using errcode = '22023';
  end if;

  update private.authorization_codes
     set status = 'revoked', revoked_at = now(), revoke_reason = left(p_reason, 200)
   where id = p_code_id;

  perform private.audit('code_revoked', v_code.number_id, p_code_id,
                        jsonb_build_object('reason', left(p_reason, 200)));
end;
$$;

create or replace function public.admin_mark_code_delivered(p_code_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code private.authorization_codes;
begin
  perform private.assert_admin();

  select * into v_code from private.authorization_codes where id = p_code_id for update;
  if not found then
    raise exception 'code_not_found' using errcode = 'P0002';
  end if;
  if v_code.status <> 'issued' then
    raise exception 'code_not_pending: %', v_code.status using errcode = '22023';
  end if;

  update private.authorization_codes
     set delivered_at = now(), delivery_note = left(p_note, 200)
   where id = p_code_id;

  perform private.audit('code_delivered', v_code.number_id, p_code_id,
                        jsonb_build_object('note', left(p_note, 200)));
end;
$$;

-- Lista de códigos SIN hash ni texto plano.
create or replace function public.admin_list_codes(p_status text default null)
returns table (
  id uuid, number_id text, status text, created_at timestamptz,
  delivered_at timestamptz, delivery_note text, consumed_at timestamptz,
  revoked_at timestamptz, revoke_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  return query
    select c.id, c.number_id, c.status, c.created_at, c.delivered_at, c.delivery_note,
           c.consumed_at, c.revoked_at, c.revoke_reason
      from private.authorization_codes c
     where p_status is null or c.status = p_status
     order by c.number_id, c.created_at desc;
end;
$$;

create or replace function public.admin_list_numbers()
returns table (
  number_id text, status text, participation_id uuid, first_name text,
  contact text, notes text, reserved_at timestamptz, expires_at timestamptz,
  paid_at timestamptz, amount_paid numeric, payment_note text,
  active_code_id uuid, active_code_delivered boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  return query
    select rn.id, rn.status, p.id, pa.first_name, pa.contact, pa.notes,
           p.reserved_at, p.expires_at, p.paid_at, p.amount_paid, p.payment_note,
           c.id, c.delivered_at is not null
      from public.raffle_numbers rn
      left join private.participations p
             on p.number_id = rn.id and p.status in ('reserved', 'paid')
      left join private.participants pa on pa.id = p.participant_id
      left join private.authorization_codes c
             on c.number_id = rn.id and c.status = 'issued'
     order by rn.id;
end;
$$;

-- Confirmación MANUAL de pago. Es la única vía para llegar a "paid".
create or replace function public.admin_mark_paid(
  p_number text,
  p_amount numeric default null,
  p_note   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid := private.assert_admin();
  v_part   private.participations;
  v_amount numeric;
begin
  perform 1 from public.raffle_numbers where id = p_number for update;

  select * into v_part from private.participations
   where number_id = p_number and status = 'reserved'
   for update;
  if not found then
    raise exception 'no_pending_reservation' using errcode = 'P0002';
  end if;

  select coalesce(p_amount, s.price_per_number) into v_amount from private.settings s;
  if v_amount is null or v_amount < 0 then
    raise exception 'amount_required' using errcode = '22023',
      hint = 'Configura el precio por número o indica el monto recibido.';
  end if;

  update private.participations
     set status = 'paid', paid_at = now(), amount_paid = v_amount,
         payment_note = left(p_note, 300), confirmed_by = v_admin, expires_at = null
   where id = v_part.id;

  perform private.audit('payment_confirmed', p_number, v_part.id,
                        jsonb_build_object('amount', v_amount, 'note', left(p_note, 300)));
end;
$$;

-- Cancela la participación activa (reservada o pagada) y libera el número.
-- El código usado permanece consumido; para reasignar hay que generar uno nuevo.
create or replace function public.admin_cancel_participation(p_number text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part private.participations;
begin
  perform private.assert_admin();

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  perform 1 from public.raffle_numbers where id = p_number for update;

  select * into v_part from private.participations
   where number_id = p_number and status in ('reserved', 'paid')
   for update;
  if not found then
    raise exception 'no_active_participation' using errcode = 'P0002';
  end if;

  update private.participations
     set status = 'cancelled', ended_at = now(), end_reason = left(p_reason, 300)
   where id = v_part.id;

  perform private.audit('participation_cancelled', p_number, v_part.id,
                        jsonb_build_object('previous_status', v_part.status,
                                           'reason', left(p_reason, 300)));
end;
$$;

-- Corrige nombre y datos privados del participante de un número.
create or replace function public.admin_update_participant(
  p_number     text,
  p_first_name text,
  p_contact    text default null,
  p_notes      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_first_name(p_first_name);
  v_pa   private.participants;
begin
  perform private.assert_admin();

  if v_name is null then
    raise exception 'invalid_first_name' using errcode = '22023';
  end if;

  perform 1 from public.raffle_numbers where id = p_number for update;

  select pa.* into v_pa
    from private.participations p
    join private.participants pa on pa.id = p.participant_id
   where p.number_id = p_number and p.status in ('reserved', 'paid')
   for update of pa;
  if not found then
    raise exception 'no_active_participation' using errcode = 'P0002';
  end if;

  update private.participants
     set first_name = v_name, contact = left(p_contact, 120), notes = left(p_notes, 500),
         updated_at = now()
   where id = v_pa.id;

  perform private.audit('participant_updated', p_number, v_pa.id,
                        jsonb_build_object('old_first_name', v_pa.first_name,
                                           'new_first_name', v_name,
                                           'contact_changed', v_pa.contact is distinct from left(p_contact, 120)));
end;
$$;

create or replace function public.admin_get_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.assert_admin();
  select jsonb_build_object(
    'total',              (select count(*) from public.raffle_numbers),
    'available',          (select count(*) from public.raffle_numbers where status = 'available'),
    'reserved',           (select count(*) from public.raffle_numbers where status = 'reserved'),
    'paid',               (select count(*) from public.raffle_numbers where status = 'paid'),
    -- Recaudación confirmada: SOLO participaciones pagadas vigentes.
    'confirmed_revenue',  (select coalesce(sum(amount_paid), 0) from private.participations where status = 'paid'),
    'pending_revenue_estimate',
                          (select count(*) * s.price_per_number from private.participations, private.settings s
                            where status = 'reserved' group by s.price_per_number),
    'codes_issued',       (select count(*) from private.authorization_codes where status = 'issued'),
    'codes_undelivered',  (select count(*) from private.authorization_codes where status = 'issued' and delivered_at is null),
    'currency',           (select currency from private.settings)
  ) into v;
  return v;
end;
$$;

create or replace function public.admin_list_audit(p_limit integer default 50)
returns table (
  id bigint, created_at timestamptz, actor_label text, action text,
  number_id text, entity_id uuid, details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  return query
    select l.id, l.created_at, l.actor_label, l.action, l.number_id, l.entity_id, l.details
      from private.admin_audit_log l
     order by l.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;

-- Cambia la configuración. Claves aceptadas en p_patch:
--   registrations_open (bool), reservation_hours (número o null),
--   price_per_number (número o null), currency (texto ISO-4217)
create or replace function public.admin_update_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.assert_admin();
  v_old   private.settings;
  v_new   private.settings;
begin
  select * into v_old from private.settings for update;
  v_new := v_old;

  if p_patch ? 'registrations_open' then
    v_new.registrations_open := (p_patch ->> 'registrations_open')::boolean;
  end if;
  if p_patch ? 'reservation_hours' then
    v_new.reservation_ttl := case when jsonb_typeof(p_patch -> 'reservation_hours') = 'null' then null
                                  else make_interval(secs => (p_patch ->> 'reservation_hours')::numeric * 3600) end;
  end if;
  if p_patch ? 'price_per_number' then
    v_new.price_per_number := (p_patch ->> 'price_per_number')::numeric;
  end if;
  if p_patch ? 'currency' then
    v_new.currency := upper(p_patch ->> 'currency');
  end if;

  update private.settings
     set registrations_open = v_new.registrations_open,
         reservation_ttl    = v_new.reservation_ttl,
         price_per_number   = v_new.price_per_number,
         currency           = v_new.currency,
         updated_at         = now(),
         updated_by         = v_admin;

  perform private.audit('settings_updated', null, null,
                        jsonb_build_object('patch', p_patch));
  return public.get_public_config();
end;
$$;

-- >>> 20261011000400_security.sql
-- =====================================================================
-- Rifa Cracovia · Migración 4: permisos y RLS
-- ---------------------------------------------------------------------
-- IMPORTANTE (trampa común de Supabase): por defecto, las tablas y
-- funciones nuevas del esquema public reciben permisos para anon y
-- authenticated, y PostgreSQL concede EXECUTE de toda función a PUBLIC.
-- Por eso aquí se REVOCA todo explícitamente y luego se concede lo
-- mínimo. Cualquier función nueva en migraciones futuras debe repetir
-- este patrón.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Esquema privado: invisible para el público y para usuarios autenticados
-- ---------------------------------------------------------------------
revoke all on schema private from public, anon, authenticated;
revoke all on all tables    in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

alter default privileges in schema private revoke all on tables    from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;

-- RLS activado SIN políticas = acceso denegado aunque algún día se
-- concediera un permiso por error (defensa en profundidad).
alter table private.admin_users         enable row level security;
alter table private.settings            enable row level security;
alter table private.participants        enable row level security;
alter table private.authorization_codes enable row level security;
alter table private.participations      enable row level security;
alter table private.admin_audit_log     enable row level security;
alter table private.claim_attempts      enable row level security;

-- ---------------------------------------------------------------------
-- Tablero público: solo lectura
-- ---------------------------------------------------------------------
revoke all on public.raffle_numbers from public, anon, authenticated;
grant select on public.raffle_numbers to anon, authenticated;

alter table public.raffle_numbers enable row level security;

drop policy if exists raffle_numbers_public_read on public.raffle_numbers;
create policy raffle_numbers_public_read
  on public.raffle_numbers
  for select
  to anon, authenticated
  using (true);
-- Sin políticas de INSERT/UPDATE/DELETE: nadie fuera de las funciones
-- SECURITY DEFINER puede escribir en el tablero.

-- ---------------------------------------------------------------------
-- Funciones públicas: se revoca todo y se concede una por una
-- ---------------------------------------------------------------------
revoke execute on function public.get_public_config()                         from public, anon, authenticated;
revoke execute on function public.claim_number(text, text, text)              from public, anon, authenticated;
revoke execute on function public.is_admin()                                  from public, anon, authenticated;
revoke execute on function public.admin_generate_codes(text[])                from public, anon, authenticated;
revoke execute on function public.admin_revoke_code(uuid, text)               from public, anon, authenticated;
revoke execute on function public.admin_mark_code_delivered(uuid, text)       from public, anon, authenticated;
revoke execute on function public.admin_list_codes(text)                      from public, anon, authenticated;
revoke execute on function public.admin_list_numbers()                        from public, anon, authenticated;
revoke execute on function public.admin_mark_paid(text, numeric, text)        from public, anon, authenticated;
revoke execute on function public.admin_cancel_participation(text, text)      from public, anon, authenticated;
revoke execute on function public.admin_update_participant(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_get_stats()                           from public, anon, authenticated;
revoke execute on function public.admin_list_audit(integer)                   from public, anon, authenticated;
revoke execute on function public.admin_update_settings(jsonb)                from public, anon, authenticated;

-- Público (visitantes sin sesión)
grant execute on function public.get_public_config()            to anon, authenticated;
grant execute on function public.claim_number(text, text, text) to anon, authenticated;

-- Administración: solo usuarios con sesión. Además, CADA función verifica
-- internamente que auth.uid() esté en private.admin_users.
grant execute on function public.is_admin()                                  to authenticated;
grant execute on function public.admin_generate_codes(text[])                to authenticated;
grant execute on function public.admin_revoke_code(uuid, text)               to authenticated;
grant execute on function public.admin_mark_code_delivered(uuid, text)       to authenticated;
grant execute on function public.admin_list_codes(text)                      to authenticated;
grant execute on function public.admin_list_numbers()                        to authenticated;
grant execute on function public.admin_mark_paid(text, numeric, text)        to authenticated;
grant execute on function public.admin_cancel_participation(text, text)      to authenticated;
grant execute on function public.admin_update_participant(text, text, text, text) to authenticated;
grant execute on function public.admin_get_stats()                           to authenticated;
grant execute on function public.admin_list_audit(integer)                   to authenticated;
grant execute on function public.admin_update_settings(jsonb)                to authenticated;

-- >>> 20261011000500_realtime_jobs.sql
-- =====================================================================
-- Rifa Cracovia · Migración 5: Realtime y tareas periódicas
-- =====================================================================

-- Realtime: el tablero recibe cambios de public.raffle_numbers.
-- Realtime respeta RLS, así que los clientes solo reciben las columnas
-- públicas que ya pueden leer (id, status, public_name, updated_at).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'raffle_numbers') then
    alter publication supabase_realtime add table public.raffle_numbers;
  end if;
end;
$$;

-- Expiración de reservas cada minuto y limpieza diaria de intentos.
-- pg_cron debe estar habilitado (Dashboard → Database → Extensions).
-- Si no lo está, la migración no falla: la expiración perezosa dentro
-- de claim_number sigue protegiendo el registro, pero el tablero
-- mostrará "reservado" hasta que alguien intente registrar ese número.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('rifa-expire-reservations', '* * * * *',
                            'select private.expire_reservations()');
      perform cron.schedule('rifa-purge-claim-attempts', '17 3 * * *',
                            'select private.purge_claim_attempts()');
    exception when others then
      -- Opcional: con reservas sin vencimiento el sistema funciona igual.
      raise notice 'No se pudo programar pg_cron (%). Se puede activar después.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: habilítalo y vuelve a ejecutar esta migración.';
  end if;
end;
$$;

-- >>> 20261011000600_config_inicial.sql
-- =====================================================================
-- Rifa Cracovia · Migración 6: configuración inicial de esta rifa
-- Precio por número: $700 MXN. Las reservas no expiran (las confirma o
-- cancela el administrador). Se puede cambiar después desde el panel.
-- =====================================================================
update private.settings
   set price_per_number = 700,
       currency         = 'MXN',
       reservation_ttl  = null,
       updated_at       = now();
