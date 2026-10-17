-- =====================================================================
-- Rifa Cracovia · Migración 7: contacto opcional y reserva de 72 horas
-- ---------------------------------------------------------------------
-- 1. El participante puede dejar, de forma OPCIONAL, un correo y/o un
--    teléfono para avisarle si gana. Son privados: solo el administrador
--    los ve. Reemplazan la columna libre "contact".
-- 2. Cada reserva dura 72 horas. Si no se confirma el pago en ese plazo,
--    se cancela sola y el número vuelve a quedar libre (el código usado
--    NO se reactiva).
--
-- Es re-ejecutable: si se corre dos veces no rompe nada.
-- Para un proyecto ya instalado basta con ejecutar ESTE archivo en el
-- SQL Editor de Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Validación y normalización de contacto
-- ---------------------------------------------------------------------
create or replace function private.normalize_email(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;

create or replace function private.is_valid_email(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null
      or (char_length(p) <= 120 and p ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$');
$$;

-- Conserva solo dígitos (y un "+" inicial si lo había): "55 1234-5678" → "5512345678".
create or replace function private.normalize_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when nullif(btrim(coalesce(p, '')), '') is null then null
           else (case when btrim(p) like '+%' then '+' else '' end)
                || regexp_replace(p, '\D', '', 'g')
         end;
$$;

create or replace function private.is_valid_phone(raw text, normalized text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Lo escrito solo puede tener dígitos, espacios, +, guiones, puntos y paréntesis,
  -- y debe quedar entre 8 y 15 dígitos (estándar internacional E.164).
  select normalized is null
      or (btrim(raw) ~ '^[0-9+ ()\-.]+$' and normalized ~ '^\+?[0-9]{8,15}$');
$$;

-- ---------------------------------------------------------------------
-- B. Columnas nuevas y migración de los datos de "contact"
-- ---------------------------------------------------------------------
alter table private.participants add column if not exists email text;
alter table private.participants add column if not exists phone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'participants_email_valid') then
    alter table private.participants
      add constraint participants_email_valid check (private.is_valid_email(email));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'participants_phone_valid') then
    alter table private.participants
      add constraint participants_phone_valid check (phone is null or phone ~ '^\+?[0-9]{8,15}$');
  end if;

  -- Si todavía existe la columna antigua, se reparten sus valores:
  -- correo → email, teléfono → phone, cualquier otra cosa → notas.
  if exists (select 1 from information_schema.columns
              where table_schema = 'private' and table_name = 'participants'
                and column_name = 'contact') then
    update private.participants
       set email = private.normalize_email(contact)
     where email is null and contact is not null
       and private.normalize_email(contact) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$';

    update private.participants
       set phone = private.normalize_phone(contact)
     where phone is null and email is null and contact is not null
       and private.is_valid_phone(contact, private.normalize_phone(contact));

    update private.participants
       set notes = left(concat_ws(' · ', notes, 'Contacto: ' || contact), 500)
     where contact is not null and email is null and phone is null;

    alter table private.participants drop column contact;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- C. Registro público con contacto opcional
--    La firma cambia, así que se elimina la anterior (si no, quedarían
--    dos funciones con el mismo nombre). Los argumentos nuevos tienen
--    valor por defecto: una versión vieja del sitio que no los envía
--    sigue funcionando durante el despliegue.
-- ---------------------------------------------------------------------
drop function if exists public.claim_number(text, text, text);

create or replace function public.claim_number(
  p_number     text,
  p_first_name text,
  p_code       text,
  p_email      text default null,
  p_phone      text default null
)
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
  v_email      text := private.normalize_email(p_email);
  v_phone      text := private.normalize_phone(p_phone);
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

  if not private.is_valid_email(v_email) or not private.is_valid_phone(p_phone, v_phone) then
    return jsonb_build_object('ok', false, 'error', 'invalid_contact');
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

  -- 3. Bloquear la fila del número (evita la doble asignación)
  select * into v_number from public.raffle_numbers where id = p_number for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- 3b. Expiración perezosa de una reserva vencida
  if v_number.status = 'reserved' then
    perform private.expire_reservations(p_number);
    select * into v_number from public.raffle_numbers where id = p_number;
  end if;

  if v_number.status <> 'available' then
    insert into private.claim_attempts (client_key, number_id, outcome)
    values (v_key, p_number, 'number_unavailable');
    return jsonb_build_object('ok', false, 'error', 'number_unavailable');
  end if;

  -- 4. Único código vigente de ESTE número
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

  -- 5. Escritura atómica
  begin
    update private.authorization_codes
       set status = 'consumed', consumed_at = now()
     where id = v_code.id and status = 'issued';
    if not found then
      raise exception using errcode = 'P0001', message = 'code_race';
    end if;

    insert into private.participants (first_name, email, phone)
    values (v_name, v_email, v_phone)
    returning id into v_participant_id;

    insert into private.participations (number_id, participant_id, code_id, expires_at)
    values (p_number, v_participant_id, v_code.id, now() + v_settings.reservation_ttl)
    returning * into v_participation;

    -- El historial registra SI dejó contacto, nunca el dato en sí.
    perform private.audit('number_claimed', p_number, v_participation.id,
                          jsonb_build_object('code_id', v_code.id,
                                             'left_email', v_email is not null,
                                             'left_phone', v_phone is not null),
                          'public');
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

-- ---------------------------------------------------------------------
-- D. Panel: listado con correo y teléfono
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_numbers();

create or replace function public.admin_list_numbers()
returns table (
  number_id text, status text, participation_id uuid, first_name text,
  email text, phone text, notes text, reserved_at timestamptz, expires_at timestamptz,
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
    select rn.id, rn.status, p.id, pa.first_name, pa.email, pa.phone, pa.notes,
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

-- ---------------------------------------------------------------------
-- E. Panel: corregir nombre, correo, teléfono y notas
-- ---------------------------------------------------------------------
drop function if exists public.admin_update_participant(text, text, text, text);

create or replace function public.admin_update_participant(
  p_number     text,
  p_first_name text,
  p_email      text default null,
  p_phone      text default null,
  p_notes      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := private.clean_first_name(p_first_name);
  v_email text := private.normalize_email(p_email);
  v_phone text := private.normalize_phone(p_phone);
  v_pa    private.participants;
begin
  perform private.assert_admin();

  if v_name is null then
    raise exception 'invalid_first_name' using errcode = '22023';
  end if;
  if not private.is_valid_email(v_email) or not private.is_valid_phone(p_phone, v_phone) then
    raise exception 'invalid_contact' using errcode = '22023';
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
     set first_name = v_name, email = v_email, phone = v_phone,
         notes = left(p_notes, 500), updated_at = now()
   where id = v_pa.id;

  perform private.audit('participant_updated', p_number, v_pa.id,
                        jsonb_build_object('old_first_name', v_pa.first_name,
                                           'new_first_name', v_name,
                                           'contact_changed',
                                             v_pa.email is distinct from v_email
                                             or v_pa.phone is distinct from v_phone));
end;
$$;

-- ---------------------------------------------------------------------
-- F. Reserva de 72 horas
--    Solo afecta a las reservas NUEVAS. Las que ya existían se respetan
--    tal como se hicieron (sin vencimiento); el administrador decide.
-- ---------------------------------------------------------------------
update private.settings
   set reservation_ttl = interval '72 hours',
       updated_at = now();

-- La liberación automática necesita pg_cron. Se vuelve a programar por si
-- en la instalación original no estaba disponible (cron.schedule con el
-- mismo nombre actualiza el trabajo existente en lugar de duplicarlo).
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
      raise warning 'No se pudo programar pg_cron (%): habilítalo en Database → Extensions y vuelve a ejecutar este archivo.', sqlerrm;
    end;
  else
    raise warning 'pg_cron no está disponible: las reservas vencidas se liberarán solo cuando alguien intente reservar ese número.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- G. Permisos (mismo patrón que la migración 4)
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;

revoke execute on function public.claim_number(text, text, text, text, text)            from public, anon, authenticated;
revoke execute on function public.admin_list_numbers()                                   from public, anon, authenticated;
revoke execute on function public.admin_update_participant(text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.claim_number(text, text, text, text, text)            to anon, authenticated;
grant execute on function public.admin_list_numbers()                                   to authenticated;
grant execute on function public.admin_update_participant(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación rápida (aparece como resultado en el SQL Editor)
-- ---------------------------------------------------------------------
select
  (select extract(epoch from reservation_ttl) / 3600 from private.settings)        as horas_de_reserva,
  (select count(*) from information_schema.columns
    where table_schema = 'private' and table_name = 'participants'
      and column_name in ('email', 'phone'))                                         as columnas_contacto,
  (select count(*) from pg_proc where proname = 'claim_number')                      as funciones_claim;
