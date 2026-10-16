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
