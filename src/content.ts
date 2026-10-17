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
      image: "Tv.webp" as string | null,
      adjust: {} as PhotoAdjust, // p. ej. { x: -5, zoom: 1.1 }
      alt: "Televisión Samsung de 75 pulgadas",
    },
    {
      name: "Equipo de sonido Samsung con subwoofer",
      image: "Sonido.png" as string | null,
      adjust: {} as PhotoAdjust,
      alt: "Equipo de sonido Samsung con subwoofer",
    },
  ],
};

export const purpose = {
  heading: "Para qué es esta rifa",
  need: {
    title: "¿Qué necesito?",
    intro: "Reunir los fondos para tres gastos de mi intercambio en AGH University of Krakow, Polonia:",
  },
  why: {
    title: "¿Por qué lo necesito?",
    intro: "En este video te cuento quién soy y por qué este intercambio es tan importante para mí.",
  },
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

/**
 * Video horizontal (16:9). Usa UNA de las dos opciones:
 *  - youtube: el enlace del video, de preferencia "No listado". Ej. "https://youtu.be/AbCdEfGhIjK"
 *  - file:    un .mp4 dentro de public/video/ (máx. ~50 MB), con su portada en `poster`.
 * Mientras ambos estén en null se muestra "Video próximamente".
 */
export const video = {
  youtube: null as string | null,
  file: null as string | null,
  poster: null as string | null,
  title: "Quién soy y por qué esta rifa",
};

/** Personas que invitan a la rifa: reciben comprobantes y pagos en efectivo. */
export const team = {
  name: "Tripulación Cracovia",
  members: ["Astrit", "Estefany", "Dede", "Luis Arturo", "Juan", "Norma"],
};

/** "Astrti, Estefany, Dede, Luis Arturo, Juan o Norma" */
export const teamList = (joiner: "o" | "y" = "o") =>
  team.members.length > 1
    ? `${team.members.slice(0, -1).join(", ")} ${joiner} ${team.members[team.members.length - 1]}`
    : team.members[0] ?? "";

export const payment = {
  clabe: "646990404078801466",
  holder: "Jesús Antonio Suárez Martínez",
  /**
   * WhatsApp para recibir comprobantes: código de país + número, solo dígitos.
   * Ej. México: "525512345678". El número NO se escribe en la página; se usa
   * únicamente dentro del botón "Enviar comprobante por WhatsApp".
   */
    whatsapp: "525610135623" as string | null,
};

export const rules = {
  heading: "Cómo participar",
  steps: [
    {
      title: "Reserva tu número",
      detail:
        "Elige un número disponible en el tablero y pide tu código a la persona que te contó de esta rifa. Toca el número, escribe tu nombre y tu código y, si quieres, déjanos un correo o teléfono para avisarte si ganas.",
    },
    {
      title: "Realiza tu pago",
      detail:
        "Haz el pago por los medios disponibles para confirmar tu reserva y comparte tu comprobante con la persona que te contó de esta rifa.",
    },
  ],
  done: {
    title: "¡Listo!",
    detail: "Ya estás participando para ganar.",
  },
  notes: [
    "En el tablero solo se muestra tu nombre de pila. Tu correo y teléfono solo los ve el organizador para avisarte si ganas.",
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
