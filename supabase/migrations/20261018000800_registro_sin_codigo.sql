-- =====================================================================
-- Rifa Cracovia · Migración 8: registro sin código de autorización
-- ---------------------------------------------------------------------
-- Antes: para apartar un número había que pedir un código al equipo.
-- Ahora: cualquier persona aparta tocando el número y escribiendo su
-- nombre y su teléfono. El administrador revisa quién es de fiar.
--
-- Como el código ya no filtra a nadie, estas reglas evitan que una sola
-- persona (o un programa) acapare el tablero, sin estorbar al resto:
--   1. Teléfono obligatorio (correo opcional).
--   2. Máximo N números apartados SIN PAGAR por teléfono (5 por defecto,
--      configurable desde el panel). Los pagados no cuentan.
--   3. Máximo 8 reservas por hora desde la misma conexión, y freno a
--      ráfagas de solicitudes.
-- Y para el administrador:
--   4. Extender el plazo de una reserva (+horas o fecha exacta).
--   5. Marcar una reserva como "verificada" (solo la ve el panel).
--
-- Los códigos que ya se usaron se conservan en el historial. Los que
-- estaban vigentes se retiran (quedan como revocados).
--
-- Es re-ejecutable: correrlo dos veces no rompe nada.
-- Para un proyecto ya instalado basta con ejecutar ESTE archivo en el
-- SQL Editor de Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Configuración: límite de números sin pagar por teléfono
-- ---------------------------------------------------------------------
alter table private.settings
  add column if not exists max_active_per_phone integer not null default 5;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_max_active_per_phone_range') then
    alter table private.settings
      add constraint settings_max_active_per_phone_range check (max_active_per_phone between 1 and 100);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- B. Participaciones: el código deja de ser obligatorio; nueva marca
--    "verificado" para el panel.
-- ---------------------------------------------------------------------
alter table private.participations alter column code_id drop not null;
alter table private.participations add column if not exists verified_at timestamptz;
alter table private.participations
  add column if not exists verified_by uuid references auth.users (id) on delete set null;

-- El guardián de transiciones comparaba code_id con "<>"; con valores
-- nulos esa comparación da null y no detectaría un cambio. "is distinct
-- from" sí lo detecta.
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
     or new.participant_id <> old.participant_id
     or new.code_id is distinct from old.code_id
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

  if old.status = 'paid' and (new.paid_at <> old.paid_at or new.amount_paid <> old.amount_paid) then
    raise exception 'confirmed payment data cannot change' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- C. Clave de teléfono para comparar: "+52 55 1234 5678", "5215512345678"
--    y "55 1234 5678" son la misma persona → "5512345678".
-- ---------------------------------------------------------------------
create or replace function private.phone_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p is null then null
           when regexp_replace(p, '\D', '', 'g') ~ '^521[0-9]{10}$'
             then right(regexp_replace(p, '\D', '', 'g'), 10)
           when regexp_replace(p, '\D', '', 'g') ~ '^52[0-9]{10}$'
             then right(regexp_replace(p, '\D', '', 'g'), 10)
           else regexp_replace(p, '\D', '', 'g')
         end;
$$;

create index if not exists participants_phone_key_idx
  on private.participants (private.phone_key(phone))
  where phone is not null;

-- Cuántos números tiene apartados SIN PAGAR (y aún vigentes) un teléfono.
create or replace function private.active_reservations_for_phone(p_phone_key text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from private.participations p
    join private.participants pa on pa.id = p.participant_id
   where p.status = 'reserved'
     and (p.expires_at is null or p.expires_at > now())
     and pa.phone is not null
     and private.phone_key(pa.phone) = p_phone_key;
$$;

-- ---------------------------------------------------------------------
-- D. Registro público sin código
--    La firma conserva p_code (se ignora) para que una versión anterior
--    del sitio, que todavía lo envía, no falle durante el despliegue.
--
--    Errores posibles (todos sin datos sensibles):
--      invalid_input       número o nombre inválidos
--      phone_required      falta el teléfono
--      invalid_contact     teléfono o correo mal escritos
--      raffle_closed       el administrador cerró los registros
--      rate_limited        demasiadas reservas desde esta conexión
--      number_unavailable  el número ya está apartado o pagado
--      phone_limit         ese teléfono ya tiene el máximo de números sin pagar
-- ---------------------------------------------------------------------
drop function if exists public.claim_number(text, text, text, text, text);
drop function if exists public.claim_number(text, text, text);

create or replace function public.claim_number(
  p_number     text,
  p_first_name text,
  p_phone      text default null,
  p_email      text default null,
  p_code       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_ok_per_hour   constant integer := 8;
  c_max_tries_10min   constant integer := 40;

  v_key       text := private.client_key();
  v_name      text := private.clean_first_name(p_first_name);
  v_email     text := private.normalize_email(p_email);
  v_phone     text := private.normalize_phone(p_phone);
  v_phone_key text;
  v_mult      integer;
  v_ok_hour   integer;
  v_tries     integer;
  v_active    integer;
  v_settings  private.settings;
  v_number    public.raffle_numbers;
  v_participant_id uuid;
  v_participation  private.participations;
begin
  -- 1. Validación de forma (barata, antes de tocar nada)
  if p_number is null or p_number !~ '^[0-9]{2}$' or v_name is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'phone_required');
  end if;
  if not private.is_valid_email(v_email) or not private.is_valid_phone(p_phone, v_phone) then
    return jsonb_build_object('ok', false, 'error', 'invalid_contact');
  end if;
  v_phone_key := private.phone_key(v_phone);

  select * into v_settings from private.settings;
  if not v_settings.registrations_open then
    return jsonb_build_object('ok', false, 'error', 'raffle_closed');
  end if;

  -- 2. Límite por conexión. Si no se conoce la IP, el límite es más
  --    holgado para no bloquear a todos los que lleguen sin ella.
  v_mult := case when v_key = 'unknown' then 10 else 1 end;
  select count(*) filter (where outcome = 'ok'),
         count(*) filter (where created_at > now() - interval '10 minutes')
    into v_ok_hour, v_tries
    from private.claim_attempts
   where client_key = v_key
     and created_at > now() - interval '1 hour';

  if v_ok_hour >= c_max_ok_per_hour * v_mult or v_tries >= c_max_tries_10min * v_mult then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- 3. Un teléfono a la vez: dos solicitudes simultáneas con el mismo
  --    teléfono se forman en fila, así el límite no se puede rebasar
  --    enviándolas al mismo tiempo. (Siempre se toma este candado ANTES
  --    que el del número, en el mismo orden en todas las solicitudes.)
  perform pg_advisory_xact_lock(hashtextextended('rifa-phone:' || v_phone_key, 0));

  -- 4. Bloquear la fila del número (evita la doble asignación)
  select * into v_number from public.raffle_numbers where id = p_number for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- 4b. Expiración perezosa de una reserva vencida
  if v_number.status = 'reserved' then
    perform private.expire_reservations(p_number);
    select * into v_number from public.raffle_numbers where id = p_number;
  end if;

  if v_number.status <> 'available' then
    insert into private.claim_attempts (client_key, number_id, outcome)
    values (v_key, p_number, 'number_unavailable');
    return jsonb_build_object('ok', false, 'error', 'number_unavailable');
  end if;

  -- 5. Límite de números sin pagar por teléfono
  v_active := private.active_reservations_for_phone(v_phone_key);
  if v_active >= v_settings.max_active_per_phone then
    insert into private.claim_attempts (client_key, number_id, outcome)
    values (v_key, p_number, 'phone_limit');
    return jsonb_build_object('ok', false, 'error', 'phone_limit',
                              'limit', v_settings.max_active_per_phone);
  end if;

  -- 6. Escritura atómica
  begin
    insert into private.participants (first_name, email, phone)
    values (v_name, v_email, v_phone)
    returning id into v_participant_id;

    insert into private.participations (number_id, participant_id, expires_at)
    values (p_number, v_participant_id, now() + v_settings.reservation_ttl)
    returning * into v_participation;

    -- El historial registra SI dejó contacto, nunca el dato en sí.
    perform private.audit('number_claimed', p_number, v_participation.id,
                          jsonb_build_object('left_email', v_email is not null,
                                             'left_phone', true,
                                             'phone_active', v_active + 1),
                          'public');
  exception
    when unique_violation then
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

-- ---------------------------------------------------------------------
-- E. Configuración pública: ahora incluye el límite por teléfono
-- ---------------------------------------------------------------------
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
                               else round(extract(epoch from s.reservation_ttl) / 3600.0, 2) end,
    'max_per_phone',      s.max_active_per_phone
  )
  from private.settings s;
$$;

-- ---------------------------------------------------------------------
-- F. Panel: listado con "verificado" y cuántos apartados tiene el mismo
--    teléfono (para detectar a quien acapara).
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_numbers();

create or replace function public.admin_list_numbers()
returns table (
  number_id text, status text, participation_id uuid, first_name text,
  email text, phone text, notes text, reserved_at timestamptz, expires_at timestamptz,
  paid_at timestamptz, amount_paid numeric, payment_note text,
  verified boolean, phone_active integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin();
  return query
    select rn.id, rn.status, p.id, pa.first_name, pa.email, pa.phone, pa.notes,
           p.reserved_at, p.expires_at, p.paid_at, p.amount_paid, p.payment_note,
           p.verified_at is not null,
           case when pa.phone is null then null
                else private.active_reservations_for_phone(private.phone_key(pa.phone)) end
      from public.raffle_numbers rn
      left join private.participations p
             on p.number_id = rn.id and p.status in ('reserved', 'paid')
      left join private.participants pa on pa.id = p.participant_id
     order by rn.id;
end;
$$;

-- ---------------------------------------------------------------------
-- G. Panel: extender el plazo de una reserva
--    Se indica UNA de las dos opciones:
--      p_hours → suma horas al plazo actual (o a "ahora" si ya venció)
--      p_until → fija una fecha y hora exactas
-- ---------------------------------------------------------------------
create or replace function public.admin_extend_reservation(
  p_number text,
  p_hours  numeric     default null,
  p_until  timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part private.participations;
  v_new  timestamptz;
begin
  perform private.assert_admin();

  if (p_hours is null) = (p_until is null) then
    raise exception 'invalid_extension' using errcode = '22023',
      hint = 'Indica horas a sumar o una fecha exacta, no ambas.';
  end if;
  if p_hours is not null and (p_hours <= 0 or p_hours > 24 * 60) then
    raise exception 'invalid_extension' using errcode = '22023',
      hint = 'Las horas deben estar entre 1 y 1440 (60 días).';
  end if;
  if p_until is not null and (p_until <= now() + interval '5 minutes'
                              or p_until > now() + interval '365 days') then
    raise exception 'invalid_extension' using errcode = '22023',
      hint = 'La fecha debe ser futura (y dentro del próximo año).';
  end if;

  perform 1 from public.raffle_numbers where id = p_number for update;

  select * into v_part from private.participations
   where number_id = p_number and status = 'reserved'
   for update;
  if not found then
    raise exception 'no_pending_reservation' using errcode = 'P0002';
  end if;

  v_new := coalesce(p_until,
                    greatest(coalesce(v_part.expires_at, now()), now())
                      + make_interval(secs => p_hours * 3600));

  update private.participations set expires_at = v_new where id = v_part.id;

  perform private.audit('reservation_extended', p_number, v_part.id,
                        jsonb_build_object('old_expires_at', v_part.expires_at,
                                           'new_expires_at', v_new,
                                           'hours', p_hours,
                                           'until', p_until));
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- H. Panel: marcar / desmarcar como verificado (solo visible en el panel)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_verified(p_number text, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.assert_admin();
  v_part  private.participations;
begin
  perform 1 from public.raffle_numbers where id = p_number for update;

  select * into v_part from private.participations
   where number_id = p_number and status in ('reserved', 'paid')
   for update;
  if not found then
    raise exception 'no_active_participation' using errcode = 'P0002';
  end if;

  update private.participations
     set verified_at = case when p_verified then coalesce(v_part.verified_at, now()) end,
         verified_by = case when p_verified then coalesce(v_part.verified_by, v_admin) end
   where id = v_part.id;

  perform private.audit(case when p_verified then 'participation_verified'
                             else 'participation_unverified' end,
                        p_number, v_part.id);
end;
$$;

-- ---------------------------------------------------------------------
-- I. Confirmar pago: además, lo marca como verificado (si pagó, es real)
-- ---------------------------------------------------------------------
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
         payment_note = left(p_note, 300), confirmed_by = v_admin, expires_at = null,
         verified_at = coalesce(verified_at, now()),
         verified_by = coalesce(verified_by, v_admin)
   where id = v_part.id;

  perform private.audit('payment_confirmed', p_number, v_part.id,
                        jsonb_build_object('amount', v_amount, 'note', left(p_note, 300)));
end;
$$;

-- ---------------------------------------------------------------------
-- J. Estadísticas: sin códigos; con "por revisar" y "vencen en 24 h"
-- ---------------------------------------------------------------------
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
    'confirmed_revenue',  (select coalesce(sum(amount_paid), 0) from private.participations where status = 'paid'),
    'pending_revenue_estimate',
                          (select count(*) * s.price_per_number from private.participations, private.settings s
                            where status = 'reserved' group by s.price_per_number),
    'unverified',         (select count(*) from private.participations
                            where status = 'reserved' and verified_at is null),
    'expiring_24h',       (select count(*) from private.participations
                            where status = 'reserved' and expires_at is not null
                              and expires_at <= now() + interval '24 hours'),
    'currency',           (select currency from private.settings)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- K. Ajustes: acepta también max_active_per_phone
-- ---------------------------------------------------------------------
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
  if p_patch ? 'max_active_per_phone' then
    v_new.max_active_per_phone := (p_patch ->> 'max_active_per_phone')::integer;
  end if;

  update private.settings
     set registrations_open   = v_new.registrations_open,
         reservation_ttl      = v_new.reservation_ttl,
         price_per_number     = v_new.price_per_number,
         currency             = v_new.currency,
         max_active_per_phone = v_new.max_active_per_phone,
         updated_at           = now(),
         updated_by           = v_admin;

  perform private.audit('settings_updated', null, null,
                        jsonb_build_object('patch', p_patch));
  return public.get_public_config();
end;
$$;

-- ---------------------------------------------------------------------
-- L. Retirar los códigos: las funciones del panel desaparecen y los
--    códigos vigentes quedan revocados. Los ya usados se conservan tal
--    cual en el historial (la tabla no se borra).
-- ---------------------------------------------------------------------
drop function if exists public.admin_generate_codes(text[]);
drop function if exists public.admin_revoke_code(uuid, text);
drop function if exists public.admin_mark_code_delivered(uuid, text);
drop function if exists public.admin_list_codes(text);

do $$
declare
  v_count integer;
begin
  with r as (
    update private.authorization_codes
       set status = 'revoked', revoked_at = now(),
           revoke_reason = 'Registro sin códigos (migración 8)'
     where status = 'issued'
    returning 1
  )
  select count(*) into v_count from r;

  if v_count > 0 then
    perform private.audit('codes_retired', null, null,
                          jsonb_build_object('count', v_count), 'system');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- M. Permisos (mismo patrón que la migración 4)
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function public.claim_number(text, text, text, text, text)                from public, anon, authenticated;
revoke execute on function public.get_public_config()                                        from public, anon, authenticated;
revoke execute on function public.admin_list_numbers()                                       from public, anon, authenticated;
revoke execute on function public.admin_extend_reservation(text, numeric, timestamptz)       from public, anon, authenticated;
revoke execute on function public.admin_set_verified(text, boolean)                          from public, anon, authenticated;
revoke execute on function public.admin_mark_paid(text, numeric, text)                       from public, anon, authenticated;
revoke execute on function public.admin_get_stats()                                          from public, anon, authenticated;
revoke execute on function public.admin_update_settings(jsonb)                               from public, anon, authenticated;

grant execute on function public.claim_number(text, text, text, text, text)                to anon, authenticated;
grant execute on function public.get_public_config()                                        to anon, authenticated;
grant execute on function public.admin_list_numbers()                                       to authenticated;
grant execute on function public.admin_extend_reservation(text, numeric, timestamptz)       to authenticated;
grant execute on function public.admin_set_verified(text, boolean)                          to authenticated;
grant execute on function public.admin_mark_paid(text, numeric, text)                       to authenticated;
grant execute on function public.admin_get_stats()                                          to authenticated;
grant execute on function public.admin_update_settings(jsonb)                               to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación rápida (aparece como resultado en el SQL Editor)
-- ---------------------------------------------------------------------
select
  (select max_active_per_phone from private.settings)                              as limite_por_telefono,
  (select extract(epoch from reservation_ttl) / 3600 from private.settings)        as horas_de_reserva,
  (select count(*) from private.authorization_codes where status = 'issued')       as codigos_vigentes,
  (select count(*) from pg_proc where proname in ('admin_generate_codes', 'admin_list_codes')) as funciones_de_codigos;
