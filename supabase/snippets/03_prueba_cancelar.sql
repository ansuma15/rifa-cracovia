-- =====================================================================
-- Deshace la prueba: cancela la reserva del 99 y lo deja disponible.
-- No hay que editar nada. Queda en el historial como cualquier
-- cancelación, y el código usado jamás vuelve a funcionar.
-- =====================================================================
do $$
begin
  if not exists (select 1 from private.admin_users) then
    raise exception 'Todavía no hay administrador. Ejecuta primero 01_registrar_admin.sql (paso 5).';
  end if;
end;
$$;

select public.admin_cancel_participation((
  select '99'
  from (
    select set_config(
             'request.jwt.claims',
             json_build_object('sub', u.id, 'email', u.email, 'role', 'authenticated')::text,
             true)
    from private.admin_users a
    join auth.users u on u.id = a.user_id
    order by a.created_at
    limit 1
  ) as admin_session
), 'Prueba de instalación');

select id, status, public_name from public.raffle_numbers where id = '99';
