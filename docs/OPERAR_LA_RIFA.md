# Operar la rifa desde el panel

Panel: `https://ansuma15.github.io/rifa-cracovia/admin/`

## El ciclo de cada número

```
Disponible ──(cualquiera lo aparta: nombre + WhatsApp)──► Por cobrar ──(confirmas pago)──► Pagado
                                                              │
                         (Liberar, o vence el plazo) ◄────────┴── el número vuelve a Disponible
```

Ya no hay códigos: cualquier persona aparta tocando un número. Tu trabajo es **revisar** quién
es real y **cobrar**. Para que nadie acapare el tablero, la página aplica sola estas reglas:

| Regla | Valor | Dónde se cambia |
|---|---|---|
| Teléfono obligatorio (correo opcional) | — | — |
| Números sin pagar por teléfono | 5 | **Ajustes → Números sin pagar por teléfono** |
| Reservas por hora desde la misma conexión | 8 | Fijo en la base de datos |
| Plazo para pagar | 72 horas | **Ajustes → Horas para pagar una reserva** |

## 1. Revisar (todos los días)

Entra a **Números → Por revisar** (es el filtro con el que abre el panel). Ahí están los
apartados que nadie ha verificado, **los que vencen primero arriba**.

En cada fila:

1. **WhatsApp**: abre un chat con un mensaje ya escrito: le agradece, le recuerda el plazo y
   le da la CLABE. Si responde, es una persona real.
2. **Verificar**: márcalo cuando sepas que es de fiar (respondió, lo conoces, alguien de la
   Tripulación lo responde). Solo lo ves tú; el tablero no cambia.
3. Si ves **"Este teléfono tiene N números apartados sin pagar"** en ámbar, revísalo con más
   cuidado.
4. **Liberar**: si es falso o no responde, libéralo con un motivo. El número vuelve a estar
   disponible al instante.

## 2. Cobrar

Cuando recibas el dinero (comprobante por WhatsApp o efectivo con la Tripulación Cracovia):
**Marcar pagado** → el monto ya viene con el precio ($700) → agrega una nota (efectivo,
transferencia…) → **Confirmar pago**. Al pagar, el número también queda **verificado**.

Confirmar un pago **no se puede deshacer**. Si te equivocas de número, cancela con un motivo y
vuelve a apartarlo.

Si el plazo vence sin pago, la reserva se cancela sola y el número vuelve a quedar libre.
Revisa **Vencen en 24 h** para escribirles antes de que pase.

## 3. Extender el plazo (casos especiales)

**Extender plazo** en la fila del número:

- **+24 h, +48 h o +72 h**: suma ese tiempo al plazo actual. Si ya había vencido (y el sistema
  aún no lo liberaba), cuenta desde ahora.
- **Fecha y hora exactas**: por ejemplo "paga antes del 10 de diciembre a las 20:00". También
  sirve para acortar un plazo.

Queda registrado en el **Historial**.

Recuerda la regla publicada: los números que no estén cubiertos por completo para la fecha del
sorteo no participan, y lo abonado no se reembolsa.

## 4. Alguien quiere más de 5 números

Dos caminos:

- Que pague alguno de los que tiene: los pagados no cuentan para el límite.
- Sube el límite en **Ajustes → Números sin pagar por teléfono** (aplica a todos). Bájalo
  otra vez cuando termine de apartar.

## 5. Corregir o cancelar

- **Editar**: corrige el nombre que se ve en el tablero, o el teléfono, correo y notas
  privadas. Nada de eso, salvo el nombre, es público.
- **Liberar / Cancelar**: deja el número disponible (pide un motivo).

## 6. Si llegan reservas falsas en masa

**Ajustes → Cerrar registro**. Nadie podrá apartar mientras esté cerrado. Libera las falsas
desde **Por revisar** y vuelve a abrir el registro.

## 7. Antes del sorteo

1. Revisa **Por cobrar**: cobra o libera todas las reservas pendientes.
2. **Ajustes** → **Cerrar registro**.
3. Toma una captura del tablero público como constancia de quién tiene cada número.

## 8. El día del sorteo (sábado 12 de diciembre de 2026, 20:00 h)

1. Consulta el resultado oficial del Sorteo Especial No. 319 de la Lotería Nacional.
2. Toma las **dos últimas cifras del premio mayor**: ese es el número ganador.
3. Búscalo en el tablero: el nombre que aparece es el de quien gana.

## Historial

La pestaña **Historial** registra cada operación (quién, qué, cuándo y el motivo), incluidas
las extensiones de plazo. No se puede editar ni borrar, ni siquiera desde la base de datos.
