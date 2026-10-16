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
