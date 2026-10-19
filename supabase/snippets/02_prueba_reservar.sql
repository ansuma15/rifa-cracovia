-- =====================================================================
-- Prueba: aparta el número 99 como lo haría cualquier visitante.
-- No hay que editar nada: copia, pega y ejecuta.
-- Resultado esperado: {"ok": true, "number": "99", "status": "reserved", ...}
-- Después, deshaz la prueba con 03_prueba_cancelar.sql.
-- =====================================================================
select public.claim_number(
  p_number     => '99',
  p_first_name => 'Prueba',
  p_phone      => '5500000099'
);

select id, status, public_name from public.raffle_numbers where id = '99';
