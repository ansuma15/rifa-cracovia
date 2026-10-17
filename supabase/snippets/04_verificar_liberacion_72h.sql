-- =====================================================================
-- Verifica que la liberación automática de reservas (72 h) esté activa.
-- No hay que editar nada. Resultado esperado: una fila
--   rifa-expire-reservations | * * * * * | true
-- Si no aparece: Database → Extensions → activa "pg_cron" y vuelve a
-- ejecutar la migración 20261015000700_contacto_y_reserva_72h.sql.
-- =====================================================================
select jobname, schedule, active
from cron.job
where jobname like 'rifa-%'
order by jobname;

-- Últimas ejecuciones (deben decir "succeeded"):
select j.jobname, d.status, d.start_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'rifa-expire-reservations'
order by d.start_time desc
limit 5;
