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
