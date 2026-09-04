/** Prism AI — Qué ocupa lo que se manda, y el modo ahorro.
 *
 * El system prompt se monta con ocho piezas y hasta ahora nadie lo medía. Los
 * números reales del arranque de fábrica: dos skills activas de 1.797
 * caracteres cada una, más 1.731 del modo agente = unos 5.400 caracteres que
 * viajan ANTES de que el usuario escriba nada. En un producto cuya gracia son
 * los modelos gratis —muchos con 8.000 tokens de contexto— eso es una parte
 * grande del presupuesto gastada de salida, invisible.
 *
 * Aquí se hacen dos cosas y en el mismo sitio a propósito:
 *   1. Montar el prompt.
 *   2. Decir qué ocupa cada pieza.
 *
 * Van juntas porque un medidor que calculara por su cuenta se desincronizaría
 * del prompt de verdad a la primera pieza nueva, y entonces enseñaría un
 * número falso — que es peor que no enseñar nada.
 */

export type PiezaId =
  | "sistema"
  | "estilo"
  | "modos"
  | "skills"
  | "permisos"
  | "agente"
  | "ficha"
  | "mapa"
  | "reglas"
  | "ahorro";

export interface PiezaPrompt {
  id: PiezaId;
  /** nombre para la interfaz */
  label: string;
  /** caracteres EXACTOS que aporta al prompt final */
  chars: number;
  /** de dónde se quita, para que el aviso sea accionable */
  donde: string;
}

export interface Presupuesto {
  piezas: PiezaPrompt[];
  /** caracteres del prompt final, incluidos los separadores */
  total: number;
  /** lo que ocuparía sin modo ahorro (para poder enseñar el ahorro REAL) */
  totalSinAhorro: number;
}

const ETIQUETAS: Record<PiezaId, { label: string; donde: string }> = {
  sistema: { label: "Instrucciones base", donde: "Ajustes → Chat" },
  estilo: { label: "Estilo de salida", donde: "el compositor" },
  modos: { label: "Modos de agente", donde: "Ajustes → Agente" },
  skills: { label: "Skills activas", donde: "Skills" },
  permisos: { label: "Límites de las skills", donde: "se va con las skills" },
  agente: { label: "Modo agente", donde: "el interruptor del agente" },
  ficha: { label: "Ficha del proyecto", donde: "resumen del mapa" },
  mapa: { label: "Mapa del proyecto", donde: "el mapa de la sesión" },
  reglas: { label: "Archivos protegidos", donde: "el mapa → No tocar" },
  ahorro: { label: "Modo ahorro", donde: "Ajustes → Chat" },
};

/**
 * Modo ahorro: al grano, sin relleno.
 *
 * Es corto a propósito —unos 400 caracteres— porque una instrucción de ahorro
 * que ocupe 2.000 se está comiendo lo que dice ahorrar.
 */
export const TEXTO_AHORRO = `[MODO AHORRO — respuesta al grano]
Responde con el mínimo de palabras que resuelva lo pedido:
- Nada de preámbulos ("Claro", "Por supuesto", "Aquí tienes"), ni despedidas, ni ofrecerte a seguir ayudando.
- No repitas la pregunta ni resumas lo que acabas de hacer.
- Sin advertencias obvias ni disculpas. Sin emojis de relleno.
- Si la respuesta es código, entrégalo y para: sin explicarlo salvo que te lo pidan.
- Si algo es ambiguo, elige la lectura más razonable y dilo en media línea, no preguntes.
La precisión manda sobre la brevedad: no recortes datos, código ni pasos necesarios.`;

/** Piezas que el modo ahorro quita, y por qué se pueden quitar.
 *
 * La ficha del proyecto sale porque es un RESUMEN del mapa, y el mapa ya viaja
 * entero justo detrás: se estaba mandando la misma información dos veces.
 * Los límites de las skills se van con las skills que los generan. */
const QUITA_AHORRO: PiezaId[] = ["ficha"];

export interface EntradaPrompt {
  sistema: string;
  estilo?: string | null;
  modos?: string | null;
  skills?: string | null;
  permisos?: string | null;
  agente?: string | null;
  ficha?: string | null;
  mapa?: string | null;
  /** memoria negativa: los archivos que el agente no puede tocar */
  reglas?: string | null;
  /** el modo ahorro cambia lo que entra, no solo lo que sale */
  ahorro?: boolean;
}

/** Orden en el que las piezas entran en el prompt. No es estético: lo general
 *  va antes que lo específico, para que lo concreto pueda matizarlo. */
const ORDEN: PiezaId[] = [
  "sistema",
  "ahorro",
  "estilo",
  "modos",
  "skills",
  "permisos",
  "agente",
  "ficha",
  "mapa",
  // Las reglas van LAS ÚLTIMAS a propósito: son la restricción más concreta y
  // tienen que poder matizar todo lo anterior, incluido el mapa —que termina
  // pidiendo entregar archivos completos—.
  "reglas",
];

const SEPARADOR = "\n\n";

function trozos(e: EntradaPrompt): Partial<Record<PiezaId, string>> {
  return {
    sistema: e.sistema?.trim() || "",
    ahorro: e.ahorro ? TEXTO_AHORRO : "",
    // en ahorro el estilo lo manda el bloque de arriba: dos instrucciones de
    // tono compitiendo es como se consigue que no se cumpla ninguna
    estilo: e.ahorro ? "" : e.estilo ?? "",
    modos: e.modos ?? "",
    skills: e.skills ?? "",
    permisos: e.permisos ?? "",
    agente: e.agente ?? "",
    ficha: e.ficha ?? "",
    mapa: e.mapa ?? "",
    reglas: e.reglas ?? "",
  };
}

/** Monta el prompt final y de paso dice qué ocupa cada pieza. */
export function construirPrompt(e: EntradaPrompt): { prompt: string; presupuesto: Presupuesto } {
  const t = trozos(e);
  const ahorro = !!e.ahorro;

  const piezas: PiezaPrompt[] = [];
  const partes: string[] = [];
  for (const id of ORDEN) {
    if (ahorro && QUITA_AHORRO.includes(id)) continue;
    const texto = (t[id] ?? "").trim();
    if (!texto) continue;
    partes.push(texto);
    piezas.push({ id, label: ETIQUETAS[id].label, chars: texto.length, donde: ETIQUETAS[id].donde });
  }
  const prompt = partes.join(SEPARADOR);

  // Lo mismo sin ahorro, para poder enseñar el ahorro medido en vez de una
  // promesa. Si el ahorro está apagado, es el mismo número.
  const totalSinAhorro = ahorro
    ? construirPrompt({ ...e, ahorro: false }).presupuesto.total
    : prompt.length;

  return { prompt, presupuesto: { piezas, total: prompt.length, totalSinAhorro } };
}

/* ------------------------------------------------------------------ */
/* avisos                                                             */
/* ------------------------------------------------------------------ */

/** Umbrales en caracteres. Salen de una cuenta, no de una corazonada: un
 *  modelo gratis de 8.000 tokens ronda los 32.000 caracteres de contexto
 *  TOTAL —instrucciones, historial, tu pregunta y la respuesta—. Gastar 6.000
 *  solo en instrucciones es la quinta parte antes de empezar. */
export const AVISO_ALTO = 6_000;
export const AVISO_CRITICO = 12_000;

export type NivelPresupuesto = "ok" | "alto" | "critico";

export function nivelPresupuesto(total: number): NivelPresupuesto {
  if (total >= AVISO_CRITICO) return "critico";
  if (total >= AVISO_ALTO) return "alto";
  return "ok";
}

/**
 * Estimación de tokens.
 *
 * Se enseña SIEMPRE como aproximación y con el divisor a la vista, porque no
 * se puede saber sin el tokenizador del modelo, y cada familia parte distinto.
 * Los caracteres son el dato exacto; esto es la traducción de cortesía.
 */
export const CHARS_POR_TOKEN = 4;

export function tokensAprox(chars: number): number {
  return Math.round(chars / CHARS_POR_TOKEN);
}

/** La pieza más gorda, que es por donde se empieza a recortar. */
export function piezaMasGorda(p: Presupuesto): PiezaPrompt | null {
  if (!p.piezas.length) return null;
  return p.piezas.reduce((a, b) => (b.chars > a.chars ? b : a));
}
