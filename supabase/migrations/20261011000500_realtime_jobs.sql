-- =====================================================================
-- Rifa Cracovia · Migración 5: Realtime y tareas periódicas
-- =====================================================================

-- Realtime: el tablero recibe cambios de public.raffle_numbers.
-- Realtime respeta RLS, así que los clientes solo reciben las columnas
-- públicas que ya pueden leer (id, status, public_name, updated_at).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'raffle_numbers') then
    alter publication supabase_realtime add table public.raffle_numbers;
  end if;
end;
$$;

-- Expiración de reservas cada minuto y limpieza diaria de intentos.
-- pg_cron debe estar habilitado (Dashboard → Database → Extensions).
-- Si no lo está, la migración no falla: la expiración perezosa dentro
-- de claim_number sigue protegiendo el registro, pero el tablero
-- mostrará "reservado" hasta que alguien intente registrar ese número.
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
      -- Opcional: con reservas sin vencimiento el sistema funciona igual.
      raise notice 'No se pudo programar pg_cron (%). Se puede activar después.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: habilítalo y vuelve a ejecutar esta migración.';
  end if;
end;
$$;
