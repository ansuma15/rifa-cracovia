-- =====================================================================
-- Paso 5: convierte en administrador al ÚNICO usuario de Authentication.
-- No hay que editar nada: copia, pega y ejecuta.
-- Resultado esperado: una fila con tu correo.
-- =====================================================================
do $$
declare
  n integer := (select count(*) from auth.users);
begin
  if n = 0 then
    raise exception 'No hay usuarios. Crea el tuyo en Authentication → Users → Add user (paso 4).';
  elsif n > 1 and not exists (select 1 from private.admin_users) then
    raise exception 'Hay % usuarios y no sé cuál eres tú. Usa la variante por correo al final de este archivo.', n;
  end if;
  insert into private.admin_users (user_id)
  select id from auth.users where n = 1
  on conflict do nothing;
end;
$$;

select u.email as administrador
from private.admin_users a
join auth.users u on u.id = a.user_id;

-- Variante si hay más de un usuario (escribe el correo con cuidado, entre comillas simples):
-- insert into private.admin_users (user_id)
-- select id from auth.users where lower(email) = lower('tu-correo@ejemplo.com')
-- on conflict do nothing;
