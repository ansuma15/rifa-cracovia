-- =====================================================================
-- Rifa Cracovia · Migración 6: configuración inicial de esta rifa
-- Precio por número: $700 MXN. Las reservas no expiran (las confirma o
-- cancela el administrador). Se puede cambiar después desde el panel.
-- =====================================================================
update private.settings
   set price_per_number = 700,
       currency         = 'MXN',
       reservation_ttl  = null,
       updated_at       = now();
