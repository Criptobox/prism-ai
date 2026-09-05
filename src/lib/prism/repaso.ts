/** Prism AI — Modo Repaso: tus conversaciones se convierten en tarjetas de estudio.
 *
 * La idea: le pides al modelo que te examine sobre lo que acabáis de hablar,
 * él responde con un bloque ```prism-repaso lleno de tarjetas, y Prism las
 * guarda y las trae de vuelta el día que toca repasarlas (repetición espaciada,
 * algoritmo SM-2 de SuperMemo, el mismo que usa Anki). Nada sale del
 * navegador: las tarjetas viven en localStorage y el calendario se calcula aquí.
 *
 * Este archivo es lógica pura (sin React ni DOM) para poder probarla en Node.
 * El store que persiste las tarjetas vive en `repaso-store.ts`.
 */

/** Una tarjeta ya guardada, con su historial de repaso. */
export interface TarjetaRepaso {
  id: string;
  frente: string;
  dorso: string;
  /** aciertos seguidos: en cuánta ronda de intervalos estamos (SM-2) */
  repeticiones: number;
  /** factor de facilidad SM-2. Mínimo 1.3: por debajo, el algoritmo condena
   * a la tarjeta a intervalos de un día para siempre. */
  facilidad: number;
  /** último intervalo concedido, en días */
  intervaloDias: number;
  /** día local en que vuelve a vencer, «YYYY-MM-DD». Texto y no timestamp:
   * se muestra tal cual en la biblioteca y el «hoy» del usuario es la única
   * verdad que importa (no hay zonas horarias que conciliar: todo es local). */
  vencimiento: string;
  /** cuándo se creó (para desempatar la cola de estudio) */
  creada: number;
  /** título de la conversación de la que salió */
  origen?: string;
}

/** Lo que el modelo propone: una tarjeta sin historial todavía. */
export interface PropuestaTarjeta {
  frente: string;
  dorso: string;
}

/** Las cuatro opciones de estudio. Los números son la nota SM-2 (0-5) que
 * cada botón le pone a tu respuesta: «otra vez» suspende, el resto aprueban
 * con distinta facilidad. No hay «regular» (2) porque en cuatro botones
 * sobra: menos opciones, menos duda al pulsar. */
export type Calificacion = 1 | 3 | 4 | 5;

export const CALIFICACIONES: { q: Calificacion; label: string }[] = [
  { q: 1, label: "Otra vez" },
  { q: 3, label: "Difícil" },
  { q: 4, label: "Bien" },
  { q: 5, label: "Fácil" },
];

/** El bloque que pide el prompt y que `extraerTarjetas` sabe leer. */
export const LENGUAJE_BLOQUE = "prism-repaso";

/** Techo por tarjeta: el modelo a veces copia párrafos enteros. Lo que se
 * corta se corta con «…»: una tarjeta kilométrica no se estudia. */
const MAX_FRENTE = 300;
const MAX_DORSO = 1500;
/** Techo por bloque: un examen de 200 preguntas no se quiere tampoco. */
const MAX_POR_BLOQUE = 40;

/** Día local en «YYYY-MM-DD». */
export function fechaHoy(base: number = Date.now()): string {
  const d = new Date(base);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Suma días a una fecha «YYYY-MM-DD» sin caer en la trampa de
 * `new Date("YYYY-MM-DD")`, que parsea en UTC y desplaza un día entero en
 * zonas horarias negativas (la del 90% de Hispanoamérica incluida). */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(y, m - 1, d + dias);
  return fechaHoy(t.getTime());
}

/** Diferencia en días entre dos fechas «YYYY-MM-DD» (b - a). */
export function diasEntre(a: string, b: string): number {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  return Math.round(
    (new Date(pb[0], pb[1] - 1, pb[2]).getTime() - new Date(pa[0], pa[1] - 1, pa[2]).getTime()) /
      86_400_000
  );
}

/** Aplica SM-2 a una tarjeta y devuelve el nuevo estado.
 *
 * Suspendida (q < 3): vuelve a vencer HOY — dentro de la misma sesión de
 * estudio reaparece al final de la cola, que es como se aprende lo que
 * cuesta. Se penaliza la facilidad igualmente, porque algo hubo.
 *
 * Aprobada: primer intervalo 1 día, segundo 6, y a partir de ahí
 * intervalo anterior × facilidad. La facilidad se ajusta con la fórmula
 * original de SuperMemo, con suelo 1.3 y techo 2.9: el suelo es del propio
 * SM-2; el techo lo añade aquí porque sin él una tarjeta fácil que aciertas
 * cinco veces dispara la facilidad y los intervalos dejan de discriminar
 * (todo se mide en meses). Con techo, «fácil» sigue estirando hasta un
 * máximo razonable. */
export function programar(
  t: Pick<TarjetaRepaso, "repeticiones" | "facilidad" | "intervaloDias">,
  q: Calificacion,
  hoy: string
): Pick<TarjetaRepaso, "repeticiones" | "facilidad" | "intervaloDias" | "vencimiento"> {
  const inc = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const facilidad = Math.min(2.9, Math.max(1.3, Math.round((t.facilidad + inc) * 100) / 100));

  if (q < 3) {
    return { repeticiones: 0, facilidad, intervaloDias: 1, vencimiento: hoy };
  }

  const repeticiones = t.repeticiones + 1;
  const intervaloDias =
    repeticiones === 1 ? 1 : repeticiones === 2 ? 6 : Math.max(1, Math.round(t.intervaloDias * facilidad));
  return { repeticiones, facilidad, intervaloDias, vencimiento: sumarDias(hoy, intervaloDias) };
}

/** Etiqueta del intervalo para el botón de calificar: «hoy», «1 día», «6 días». */
export function etiquetaIntervalo(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "1 día";
  return `${dias} días`;
}

/** Recorta y limpia lo que el modelo propuso como tarjeta. Devuelve null si
 * no sirve (vacío, o el frente es una pregunta que no pregunta nada). */
function normalizar(p: unknown): PropuestaTarjeta | null {
  if (typeof p !== "object" || p === null) return null;
  const o = p as Record<string, unknown>;
  const frente = typeof o.frente === "string" ? o.frente.trim() : "";
  const dorso = typeof o.dorso === "string" ? o.dorso.trim() : "";
  // Sin dorso no hay nada que mostrar; sin frente no hay nada que preguntar.
  if (!frente || !dorso) return null;
  return {
    frente: frente.length > MAX_FRENTE ? frente.slice(0, MAX_FRENTE).trimEnd() + "…" : frente,
    dorso: dorso.length > MAX_DORSO ? dorso.slice(0, MAX_DORSO).trimEnd() + "…" : dorso,
  };
}

/** Clave de deduplicación: minúsculas y espacios colapsados, porque el
 * modelo reescribe «¿Qué es X? » con un espacio de más y no por eso son
 * dos tarjetas. */
function claveDedupe(frente: string): string {
  return frente.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Extrae las tarjetas que el modelo propuso en su respuesta.
 *
 * Acepta bloques vallados ```prism-repaso y, por tolerancia, ```json o
 * vallados sin lenguaje SIEMPRE que el JSON traiga una clave «tarjetas» con
 * {frente, dorso}: los modelos rara vez escriben el lenguaje exacto que les
 * pides. Un ```json cualquiera (sin «tarjetas») no se toca: podría ser
 * cualquier cosa de la respuesta y no un examen. */
export function extraerTarjetas(texto: string): PropuestaTarjeta[] {
  if (!texto || !texto.includes("```")) return [];
  const out: PropuestaTarjeta[] = [];
  const vistas = new Set<string>();
  const re = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const lang = m[1].toLowerCase();
    if (lang && lang !== LENGUAJE_BLOQUE && lang !== "json") continue;
    const cuerpo = m[2].trim();
    if (!cuerpo.startsWith("{")) continue;
    let data: unknown;
    try {
      data = JSON.parse(cuerpo);
    } catch {
      continue; // JSON roto: pasa del bloque, no rompe el botón
    }
    const lista =
      typeof data === "object" && data !== null && Array.isArray((data as Record<string, unknown>).tarjetas)
        ? ((data as Record<string, unknown>).tarjetas as unknown[])
        : null;
    if (!lista) continue;
    for (const p of lista.slice(0, MAX_POR_BLOQUE)) {
      const n = normalizar(p);
      if (!n) continue;
      const clave = claveDedupe(n.frente);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      out.push(n);
    }
  }
  return out;
}

/** Plantilla que /repaso y el diálogo ponen en el compositor: el encargo que
 * le pide al modelo que examine de la conversación y responda con el bloque. */
export const PROMPT_REPASO = `Examina esta conversación: hazme tarjetas de estudio con lo importante y comprueba cuánto he entendido.

- Entre 6 y 12 tarjetas, con lo que de verdad merece recordarse de esta conversación (conceptos, decisiones, datos, comandos).
- Preguntas ATÓMICAS: una idea por tarjeta. Respuestas de 1-3 frases, sin rodeos.
- Si hubo errores o correcciones en la conversación, pregúntalas: son justo lo que más cuesta recordar.
- Responde SOLO con el bloque, sin texto antes ni después:

\`\`\`prism-repaso
{ "tarjetas": [ { "frente": "pregunta", "dorso": "respuesta" } ] }
\`\`\``;

/** Resumen para la cabecera del diálogo y la insignia de la barra lateral. */
export interface ResumenRepaso {
  total: number;
  /** vencidas hoy (o antes): las que salen en la cola de estudio */
  vencidas: number;
  /** aún sin primer acierto */
  frescas: number;
  /** con dos o más aciertos seguidos: lo que ya se sabe */
  aprendidas: number;
  /** día del próximo vencimiento futuro, si hay */
  proxima?: string;
}

export function resumenRepaso(tarjetas: readonly TarjetaRepaso[], hoy: string): ResumenRepaso {
  let vencidas = 0;
  let frescas = 0;
  let aprendidas = 0;
  let proxima: string | undefined;
  for (const t of tarjetas) {
    if (t.vencimiento <= hoy) vencidas++;
    if (t.repeticiones === 0) frescas++;
    if (t.repeticiones >= 2) aprendidas++;
    if (t.vencimiento > hoy && (!proxima || t.vencimiento < proxima)) proxima = t.vencimiento;
  }
  return { total: tarjetas.length, vencidas, frescas, aprendidas, proxima };
}

/** La cola de estudio: vencidas, lo más atrasado primero. Determinista —
 * la misma biblioteca produce la misma cola, y un test puede fiarse. */
export function tarjetasVencidas(
  tarjetas: readonly TarjetaRepaso[],
  hoy: string
): TarjetaRepaso[] {
  return tarjetas
    .filter((t) => t.vencimiento <= hoy)
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.creada - b.creada);
}
