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
