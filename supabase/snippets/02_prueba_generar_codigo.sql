-- =====================================================================
-- Prueba: genera un código para el número 99 como si fueras el admin.
-- No hay que editar nada: copia, pega y ejecuta. Devuelve el código.
--
-- Por qué funciona: el SQL Editor no tiene sesión de Supabase Auth, así
-- que las funciones de admin responderían "forbidden". La subconsulta fija
-- request.jwt.claims con tu usuario admin (lo que Supabase hace con tu
-- sesión) y, como los argumentos se evalúan antes de ejecutar la función,
-- ya está fijado cuando la función verifica quién la llama.
-- =====================================================================
do $$
begin
  if not exists (select 1 from private.admin_users) then
    raise exception 'Todavía no hay administrador. Ejecuta primero 01_registrar_admin.sql (paso 5).';
  end if;
end;
$$;

select number_id, code
from public.admin_generate_codes((
  select array['99']
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
));
