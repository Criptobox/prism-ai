/** Prism AI — Biblioteca de prompts integrada */
import type { PromptItem } from "./types";

export const PROMPT_CATEGORIES = [
  "Desarrollo",
  "Escritura",
  "Productividad",
  "Marketing",
  "Diversión",
] as const;

export const BUILTIN_PROMPTS: PromptItem[] = [
  {
    id: "p-landing",
    title: "Página de aterrizaje",
    category: "Desarrollo",
    builtin: true,
    content:
      "Crea una página de aterrizaje moderna en un solo archivo HTML para: [tu producto o negocio]. Incluye héroe con titular potente, sección de beneficios, testimonios, precios y llamada a la acción. Diseño responsive con animaciones suaves.",
  },
  {
    id: "p-webapp",
    title: "Mini app web",
    category: "Desarrollo",
    builtin: true,
    content:
      "Crea una mini aplicación web en un solo archivo HTML que: [describe la app, ej. lista de tareas con categorías y guardado local]. Debe ser responsive, con diseño pulido y todas las interacciones funcionando.",
  },
  {
    id: "p-game",
    title: "Juego en HTML",
    category: "Diversión",
    builtin: true,
    content:
      "Crea el juego de [ej. serpiente / memorama / piedra-papel-tijera] en un solo archivo HTML con canvas o DOM, controles táctiles y de teclado, puntuación y pantalla de game over con reinicio.",
  },
  {
    id: "p-debug",
    title: "Cazador de bugs",
    category: "Desarrollo",
    builtin: true,
    content:
      "Revisa este código, encuentra los errores y explícame cada problema antes de darme la versión corregida:\n\n```\n[pega tu código aquí]\n```",
  },
  {
    id: "p-email",
    title: "Correo profesional",
    category: "Escritura",
    builtin: true,
    content:
      "Redacta un correo profesional para [destinatario] con el objetivo de [objetivo]. Tono [formal/cercano], máximo 150 palabras, con asunto incluido y una llamada a la acción clara.",
  },
  {
    id: "p-resume",
    title: "Resumir texto largo",
    category: "Productividad",
    builtin: true,
    content:
      "Resume el siguiente texto en: 1) 3 ideas clave, 2) un párrafo de resumen ejecutivo, 3) acciones recomendadas.\n\n[pega el texto]",
  },
  {
    id: "p-plan",
    title: "Plan de trabajo",
    category: "Productividad",
    builtin: true,
    content:
      "Ayúdame a crear un plan de trabajo para [objetivo] con plazo de [tiempo]. Divide en fases semanales, tareas concretas, hitos medibles y posibles obstáculos con su solución.",
  },
  {
    id: "p-ideas",
    title: "Lluvia de ideas",
    category: "Marketing",
    builtin: true,
    content:
      "Dame 15 ideas creativas y accionables para [tema/proyecto]. Para cada una: nombre, descripción de 1 línea, dificultad (baja/media/alta) e impacto potencial.",
  },
  {
    id: "p-social",
    title: "Post para redes",
    category: "Marketing",
    builtin: true,
    content:
      "Escribe 3 publicaciones para [red social] sobre [tema]. Una informativa, una emocional y otra con humor. Incluye ganchos de primeros 3 segundos y hashtags relevantes.",
  },
  {
    id: "p-explain",
    title: "Explícame como a un niño",
    category: "Escritura",
    builtin: true,
    content:
      "Explícame [concepto complejo] como si tuviera 12 años: usa una analogía cotidiana, un ejemplo real y evita tecnicismos. Termina con un resumen de 3 frases.",
  },
  {
    id: "p-translate",
    title: "Traducción con matices",
    category: "Escritura",
    builtin: true,
    content:
      "Traduce el siguiente texto al [idioma] manteniendo el tono y los matices. Señala con notas cualquier ambigüedad o juego de palabras:\n\n[pega el texto]",
  },
  {
    id: "p-story",
    title: "Historia creativa",
    category: "Diversión",
    builtin: true,
    content:
      "Escribe una historia corta de [género: sci-fi/fantasia/misterio/humor] sobre [tema o personaje], con giro inesperado al final. Máximo 400 palabras.",
  },
];
