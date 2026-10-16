// Textos editables del sitio. Cambiar algo aquí no requiere tocar componentes.
// Los valores marcados como pendientes se muestran como "por anunciar".

export const site = {
  title: "Una rifa, una oportunidad para llegar más lejos",
  subtitle: "Ayúdame a llegar a Cracovia, Polonia, y participa por increíbles premios.",
  organizer: "Jesús Antonio",
};

/**
 * Ajuste fino de una foto dentro de su marco (todo opcional):
 *   x:    mueve la foto en horizontal, en % de su ancho. Negativo = izquierda, positivo = derecha.
 *   y:    mueve la foto en vertical, en % de su alto. Negativo = arriba, positivo = abajo.
 *   zoom: agranda la foto (1 = tamaño normal, 1.15 = 15 % más grande). Útil si la foto
 *         trae mucho margen vacío alrededor; lo que sobresale del marco se recorta.
 * Ejemplo: si la TV se ve cargada a la derecha → { x: -5 }.
 */
export interface PhotoAdjust {
  x?: number;
  y?: number;
  zoom?: number;
}

export const prize = {
  heading: "Un solo premio, dos piezas",
  intro:
    "Quien gane se lleva el paquete completo: la televisión y el equipo de sonido, juntos.",
  items: [
    {
      name: "Televisión Samsung de 75 pulgadas",
      // Coloca la foto en public/premios/ y escribe aquí el nombre del archivo.
      image: null as string | null,
      adjust: {} as PhotoAdjust, // p. ej. { x: -5, zoom: 1.1 }
      alt: "Televisión Samsung de 75 pulgadas",
    },
    {
      name: "Equipo de sonido Samsung con subwoofer",
      image: null as string | null,
      adjust: {} as PhotoAdjust,
      alt: "Equipo de sonido Samsung con subwoofer",
    },
  ],
};

export const purpose = {
  heading: "Para qué es esta rifa",
  body: [
    "Esta rifa significa mucho más que ganar un premio; representa la oportunidad de acercarme a un sueño por el que he trabajado y que me permitirá salir de mi zona de confort, aprender de nuevas perspectivas y demostrarme hasta dónde puedo llegar. Mi intercambio en Polonia es un paso más para seguir creciendo, tanto personal como académicamente, y construir el futuro que deseo.",
    "Los fondos recaudados me ayudarán a cubrir los vuelos, el seguro y los gastos de vida durante mi intercambio en AGH University of Krakow, Polonia. Cada aportación, por pequeña que parezca, me acerca un poco más a esta meta y hace posible que pueda vivir una experiencia que estoy dispuesto a aprovechar al máximo.",
    "Gracias por formar parte de este sueño, por confiar en mí y ayudarme a dar este paso. Espero que algún día pueda devolver, a través de lo que aprenda y logre, un poco de todo el apoyo que hoy recibo.",
  ],
  uses: [
    { title: "Vuelos", detail: "Ida y vuelta entre Ciudad de México y Cracovia." },
    { title: "Seguro médico", detail: "Obligatorio durante toda la estancia." },
    { title: "Gastos de vida", detail: "Hospedaje, comida y transporte en Cracovia." },
  ],
  from: "Ciudad de México",
  to: "Cracovia",
  distanceKm: 10_260,
  university: "AGH University of Krakow",
};

export const rules = {
  heading: "Cómo participar",
  steps: [
    {
      title: "Elige un número",
      detail: "Busca en el tablero un número disponible del 00 al 99.",
    },
    {
      title: "Pide tu código",
      detail: `${site.organizer} te entrega personalmente un código para ese número. Cada código sirve una sola vez y solo para su número.`,
    },
    {
      title: "Registra tu número",
      detail: "Toca el número, escribe tu nombre de pila y el código. Quedará reservado a tu nombre.",
    },
    {
      title: "Realiza tu pago",
      detail: `Paga directamente a ${site.organizer}. Tu reserva se mantiene hasta que confirme tu pago.`,
    },
    {
      title: "Listo",
      detail: "Cuando el pago se confirma, tu número aparece como ocupado. Ya estás participando.",
    },
  ],
  notes: [
    "En el tablero solo se muestra tu nombre de pila. Ningún otro dato es público.",
    "Un número reservado o pagado no puede registrarse por otra persona.",
  ],
  draw: {
    date: "Sábado 12 de diciembre de 2026, 20:00 h",
    shortDate: "12 dic 2026",
    lottery: "Sorteo Especial No. 319 de la Lotería Nacional",
    method:
      "Gana el número que coincida con las dos últimas cifras del premio mayor del Sorteo Especial No. 319 de la Lotería Nacional.",
  },
};
