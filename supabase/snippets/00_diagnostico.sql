-- =====================================================================
-- Diagnóstico: ¿qué usuarios existen y cuál es administrador?
-- No hay que editar nada. Debe salir tu usuario con es_admin = true.
-- =====================================================================
select u.email,
       u.created_at::date          as creado,
       (a.user_id is not null)     as es_admin
from auth.users u
left join private.admin_users a on a.user_id = u.id
order by u.created_at;
