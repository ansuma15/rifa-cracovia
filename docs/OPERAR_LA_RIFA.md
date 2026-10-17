# Operar la rifa desde el panel

Panel: `https://ansuma15.github.io/rifa-cracovia/admin/`

## El ciclo de cada número

```
Disponible ──(entregas código)──► el participante lo registra ──► Por cobrar ──(confirmas pago)──► Pagado
                                                                     │
                                                       (Cancelar) ◄──┴── el número vuelve a Disponible
```

## 1. Generar códigos para números exactos

Cuando alguien te diga "quiero el 25":

**Opción rápida:** pestaña **Números** → filtro **Disponibles** → busca `25` → **Generar código**.

**Varios a la vez:** pestaña **Códigos** → escribe los números → **Generar códigos**.

| Escribes | Se generan |
|---|---|
| `25` | 25 |
| `7, 25, 31` | 07, 25, 31 |
| `40-45` | 40, 41, 42, 43, 44, 45 |
| `3 9 12-14` | 03, 09, 12, 13, 14 |

Antes de generar, el panel muestra exactamente qué números va a incluir. Si alguno ya está
ocupado o ya tiene un código sin usar, **no se genera ninguno** y te dice cuál es el problema.

## 2. Entregar el código

Al generarlos aparece un recuadro ámbar con los códigos. **Es la única vez que se muestran.**

- **Copiar mensaje para WhatsApp**: copia un mensaje con el número, el código y la dirección
  del sitio. Pégalo en el chat de la persona.
- **Descargar CSV**: guarda todos los códigos en un archivo que abre Excel (conserva el
  cero de `07`). Guárdalo en un lugar privado, no en el repositorio.
- **Ya los guardé**: cierra el recuadro.

Opcional: en **Códigos** → **Marcar entregado**, para llevar el control de a quién se lo diste.

Si alguien pierde su código: **Revocar** y genera uno nuevo para ese número.

## 3. Cobrar

Cuando la persona reserva su número, aparece en **Números** → **Por cobrar** (filtro
predeterminado) y el panel se actualiza solo. Cada fila muestra:

- **vence en …**: cuánto le queda del plazo de 72 horas (en ámbar cuando faltan menos de 12).
- **correo y teléfono**, si los dejó (opcionales). Tócalos para escribirle o llamarle.

Si el plazo vence sin pago, la reserva se cancela sola, el número vuelve a quedar libre y el
código usado deja de servir. Si esa persona todavía lo quiere, genera un código nuevo.
El plazo se cambia en **Ajustes → Horas para pagar una reserva** (aplica a reservas nuevas).

Los comprobantes llegan a la Tripulación Cracovia o a tu WhatsApp; con eso confirmas el pago.

Cuando recibas el dinero: **Marcar pagado** → el monto ya viene con el precio ($700) →
agrega una nota (efectivo, transferencia…) → **Confirmar pago**.

Confirmar un pago **no se puede deshacer**. Si te equivocas de número, cancela con un motivo y
vuelve a asignar.

## 4. Corregir o cancelar

- **Editar**: corrige el nombre que se ve en el tablero, o agrega un contacto o notas
  privadas. Nada de eso, salvo el nombre, es público.
- **Cancelar**: libera el número (pide un motivo). El código usado ya no sirve; si alguien más
  lo quiere, genera uno nuevo.

## 5. Antes del sorteo

1. Revisa **Por cobrar**: cobra o cancela todas las reservas pendientes.
2. **Ajustes** → **Cerrar registro**. Nadie podrá registrar números aunque tenga código.
3. Toma una captura del tablero público como constancia de quién tiene cada número.

## 6. El día del sorteo (sábado 12 de diciembre de 2026, 20:00 h)

1. Consulta el resultado oficial del Sorteo Especial No. 319 de la Lotería Nacional.
2. Toma las **dos últimas cifras del premio mayor**: ese es el número ganador.
3. Búscalo en el tablero: el nombre que aparece es el de quien gana.

## Historial

La pestaña **Historial** registra cada operación (quién, qué, cuándo y el motivo). No se
puede editar ni borrar, ni siquiera desde la base de datos. Te sirve para aclarar cualquier
duda de un participante.
