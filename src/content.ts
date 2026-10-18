// Textos editables del sitio. Cambiar algo aquí no requiere tocar componentes.
// Los valores marcados como pendientes se muestran como "por anunciar".

export const site = {
  title: "Una rifa, una oportunidad para llegar más lejos",
  subtitle: "Ayúdame a llegar a Cracovia, Polonia, y participa por increíbles premios.",
  organizer: "Antonio Suarez",
};


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

      image: "Tv.webp" as string | null,
      adjust: {} as PhotoAdjust, 
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
  title: "¿Quién soy?",
  intro:
    `Hola, soy ${site.organizer}, estudiante de Ingeniería en Inteligencia Artificial en el IPN, con un promedio de 9.79. Soy una persona normal con sueños grandes, y me he esforzado día con día para alcanzarlos. Cada desvelo y cada hora de estudio me trajeron hasta aquí: voy a estudiar un intercambio en AGH University of Krakow, en Polonia.`,
  whyKrakow: {
    title: "¿Por qué Cracovia?",
    text: "Porque AGH University of Krakow es una de las mejores opciones para hacer investigación científica, el camino que más me apasiona. Quiero innovar, crear nuevas implementaciones con inteligencia artificial y, con ellas, ayudar a transformar el mundo. Este intercambio es el siguiente paso para lograrlo.",
  },
  closing:
    "Cada número que apartas o apoyo que me brindes me acerca un poco más a Cracovia y a una experiencia que estoy dispuesto a aprovechar al máximo.",
  videoCaption: "En este video te cuento quién soy y por qué este intercambio es tan importante para mí.",
  usesTitle: "Para llegar necesito cubrir tres gastos",
  uses: [
    { title: "Vuelos", detail: "El primer paso: ida y vuelta entre Ciudad de México y Cracovia." },
    { title: "Seguro médico", detail: "Obligatorio para estudiar allá, y la tranquilidad de estar cubierto." },
    { title: "Gastos de vida", detail: "Hospedaje, comida y transporte para vivir y estudiar en Cracovia." },
  ],
  from: "Ciudad de México",
  to: "Cracovia",
  distanceKm: 10_260,
  university: "AGH University of Krakow",
};


export const proofs = {
  title: "Comprobantes (datos personales ocultos)",
  items: [
    {
      file: "boleta.jpg" as string | null, 
      label: "Boleta: promedio 9.79",
      alt: "Boleta de calificaciones del IPN con promedio de 9.79, los datos personales están tapados je.",
    },
    {
      file: "aceptacion-agh.jpg" as string | null, 
      label: "Aceptación en AGH",
      alt: "Captura de la aceptación al intercambio en AGH University of Krakow.",
    },
  ],
};

/**
 * Video horizontal (16:9). Usa UNA de las dos opciones:
 *  - youtube: el enlace del video, de preferencia "No listado". Ej. "https://youtu.be/AbCdEfGhIjK"
 *  - file:    un .mp4 dentro de public/video/ (máx. ~50 MB), con su portada en `poster`.
 * Mientras ambos estén en null se muestra "Video próximamente".
 */
export const video = {
  youtube: null as string | null,
  file: "videop.mp4" as string | null,
  poster: "portada.jpg" as string | null,
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
  holder: "Antonio Suárez",
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
        "Elige un número disponible en el tablero y tócalo. Escribe tu nombre y tu código y, si quieres, déjanos un correo o teléfono para avisarte si ganas.",
      // Cada número necesita su propio código de autorización.
      codeHelp: "¿Aún no tienes tu código? Pídelo a la persona que te contó de esta rifa o directamente por WhatsApp.",
      codeButton: "Pedir código por WhatsApp",
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
