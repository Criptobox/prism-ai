/** Prism AI — Auto Context (plan técnico §2): el usuario no debería tener
 * que explicar qué archivos ni qué decisiones son relevantes. Antes de
 * llamar al modelo, Prism detecta lo pertinente con heurística local
 * (keywords + LIKE), sin gastar una llamada extra ni embeddings.
 *
 * Flujo:
 *   prompt → extraer keywords → buscar en archivos del proyecto (mapa) +
 *   memoria estructurada → bloque de contexto para el prompt + resumen
 *   contable para la UI («4 archivos · 3 memorias · 1 error»).
 *
 * Es puro y keyword-based a propósito: la versión con embeddings locales
 * es fase futura y solo valdría la pena si esta validara su utilidad.
 */

import type { MemoriaProyecto } from "./memoria-proyecto";
import type { ProjectMap } from "./types";

/** Resultado de la búsqueda de contexto para UN turno. */
export interface ContextoEncontrado {
  /** archivos del proyecto mencionados o pertinentes */
  archivos: string[];
  /** decisiones que afectan al encargo */
  decisiones: string[];
  /** errores previos pertinentes (con su solución si existe) */
  errores: string[];
  /** reglas «no tocar» que afectan a los archivos detectados */
  reglas: string[];
  /** notas del mapa pertinentes */
  notas: string[];
}

export const CONTEXTO_VACIO_TURNO: ContextoEncontrado = {
  archivos: [],
  decisiones: [],
  errores: [],
  reglas: [],
  notas: [],
};

/** Stopwords ES/EN mínimas. La heurística es charla local: no hace falta
 * un tokenizador, hace falta no devolver «de la que para». */
const STOPWORDS = new Set([
  "el","la","los","las","un","una","unos","unas","de","del","al","a","ante","bajo","con","contra","desde","en","entre","hacia","para","por","segun","sin","sobre","tras","y","o","u","e","que","como","muy","más","mas","pero","porque","cuando","cual","cuales","donde","quien","quiero","quieras","puedes","podrias","favor","gracias","hola","the","and","for","with","that","this","from","into","your","you","our","are","was","were","have","has","can","could","would","should","please","thanks","hello","make","create","build","page","website","web","app",
]);

/** Extrae términos de búsqueda del prompt: palabras de contenido, nombres
 * de archivo y rutas. Deduplicado y acotado (15 términos). */
export function extraerKeywords(prompt: string): string[] {
  const t = (prompt ?? "").toLowerCase();
  if (!t.trim()) return [];
  const out: string[] = [];

  // rutas y nombres de archivo con extensión primero (máxima señal)
  const rutas = t.match(/[\w./-]+\.(html?|css|js|jsx|ts|tsx|json|md|svg|py|mjs|cjs)/g) ?? [];
  for (const r of rutas) {
    if (!out.includes(r)) out.push(r);
  }

  const palabras = t
    .split(/[^\wáéíóúñü]+/)
    .filter((p) => p.length >= 4 && !STOPWORDS.has(p) && !/^\d+$/.test(p));
  for (const p of palabras) {
    if (out.length >= 15) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** Puntuación de un texto contra las keywords: cuántas aparecen, con
 * bonus por apariciones múltiples (tope 3 por término para no inflar). */
function puntuar(texto: string, keywords: readonly string[]): number {
  if (!texto) return 0;
  const t = texto.toLowerCase();
  let n = 0;
  for (const k of keywords) {
    let i = t.split(k).length - 1;
    if (i > 0) n += 1 + Math.min(2, i - 1);
  }
  return n;
}

/** Busca el contexto relevante para un encargo, cruzando el prompt con el
 * mapa del proyecto y la memoria estructurada.
 *
 * `archivosDisponibles` son las rutas REALES que existen (del Sandbox o
 * del mapa): un archivo que no existe no viaja como contexto, se avisa
 * aparte si el prompt lo nombraba (desalucinación barata). */
export function buscarContexto(
  prompt: string,
  datos: {
    archivosDisponibles?: readonly string[];
    contenidoArchivos?: Record<string, string>;
    mapa?: ProjectMap | null;
    memoria?: MemoriaProyecto | null;
    reglas?: readonly { patron: string; motivo: string }[];
  }
): ContextoEncontrado {
  const kw = extraerKeywords(prompt);
  if (!kw.length) return { ...CONTEXTO_VACIO_TURNO };
  // OJO: copia PROFUNDA de los arrays, no spread. `{...VACIO}` comparte las
  // referencias de los arrays internos y un `push` de una llamada contaminaba
  // a la siguiente (y con ello, el contexto de un turno distinto).
  const res: ContextoEncontrado = {
    archivos: [],
    decisiones: [],
    errores: [],
    reglas: [],
    notas: [],
  };

  // ——— archivos ———
  const disponibles = datos.archivosDisponibles ?? [];
  const contenidos = datos.contenidoArchivos ?? {};
  const puntuados: { path: string; n: number }[] = [];
  for (const path of disponibles) {
    let n = puntuar(path, kw);
    const contenido = contenidos[path];
    if (n === 0 && contenido) {
      // el nombre no menciona nada: mira el contenido (términos, no rutas)
      n = puntuar(contenido.slice(0, 4000), kw) >= 2 ? 1 : 0;
    }
    if (n > 0) puntuados.push({ path, n });
  }
  res.archivos = puntuados
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((p) => p.path);

  // ——— mapa: resumen de archivos pertinentes + notas ———
  const mapa = datos.mapa ?? null;
  if (mapa) {
    for (const f of mapa.files) {
      if (res.archivos.includes(f.name)) continue;
      if (puntuar(`${f.name} ${f.summary} ${(f.features ?? []).join(" ")}`, kw) > 1) {
        res.archivos.push(f.name);
        if (res.archivos.length >= 8) break;
      }
    }
    res.notas = (mapa.notes ?? [])
      .filter((n) => puntuar(n, kw) > 0)
      .slice(0, 4);
  }

  // ——— memoria estructurada ———
  const mem = datos.memoria ?? null;
  if (mem) {
    res.decisiones = mem.decisiones
      .filter((d) => {
        const base = puntuar(d.contenido, kw);
        // una decisión de archivo aplica si se menciona su archivo
        if (d.referencia && kw.some((k) => d.referencia!.toLowerCase().includes(k))) return true;
        return base > 0;
      })
      .slice(0, 5)
      .map((d) => d.contenido);
    res.errores = mem.errores
      .filter((e) => puntuar(`${e.que} ${(e.archivos ?? []).join(" ")}`, kw) > 0)
      .slice(0, 4)
      .map((e) => `${e.que}${e.solucion ? ` — resuelto: ${e.solucion}` : ""}`);
  }

  // ——— reglas que protegen archivos mencionados ———
  const reglas = datos.reglas ?? [];
  const mencionados = [
    ...res.archivos,
    ...(prompt.match(/[\w./-]+\.(html?|css|js|jsx|ts|tsx|json|md|svg|py|mjs|cjs)/g) ?? []),
  ];
  const vistos = new Set<string>();
  for (const r of reglas) {
    const aplica = mencionados.some((m) => m.toLowerCase().includes(r.patron.toLowerCase().replace(/\*/g, "")) || r.patron.replace(/\*/g, "").toLowerCase().includes(m.toLowerCase().replace(/\.(html?|css|js|jsx|ts|tsx|json|md)$/i, "")));
    if (aplica && !vistos.has(r.patron)) {
      vistos.add(r.patron);
      res.reglas.push(`${r.patron} — ${r.motivo}`);
    }
  }
  return res;
}

/** ¿Se encontró algo que valga la pena enseñar? */
export function hayContextoTurno(c: ContextoEncontrado): boolean {
  return !!(c.archivos.length || c.decisiones.length || c.errores.length || c.reglas.length || c.notas.length);
}

/** El bloque que se inyecta en el system prompt. Compacto y accionable:
 * le dice al modelo qué mirar y qué respetar, no le da relleno. */
export function renderContextoParaPrompt(c: ContextoEncontrado): string | null {
  if (!hayContextoTurno(c)) return null;
  const lineas: string[] = ["## Contexto pertinente detectado en el proyecto"];
  if (c.archivos.length) {
    lineas.push(`Archivos implicados: ${c.archivos.join(", ")}. Revísalos antes de proponer cambios.`);
  }
  if (c.decisiones.length) {
    lineas.push("Decisiones ya tomadas (no las contradigas):");
    for (const d of c.decisiones) lineas.push(`- ${d}`);
  }
  if (c.errores.length) {
    lineas.push("Errores previos pertinentes:");
    for (const e of c.errores) lineas.push(`- ${e}`);
  }
  if (c.reglas.length) {
    lineas.push("Reglas del usuario que aplican a ESTE encargo:");
    for (const r of c.reglas) lineas.push(`- NO tocar: ${r}`);
  }
  if (c.notas.length) {
    lineas.push("Notas del proyecto pertinentes:");
    for (const n of c.notas) lineas.push(`- ${n}`);
  }
  return lineas.join("\n");
}

/** El resumen para la UI: «4 archivos · 3 memorias · 1 error». */
export function resumenContextoTurno(c: ContextoEncontrado): string {
  const partes: string[] = [];
  if (c.archivos.length) partes.push(`${c.archivos.length} archivo(s)`);
  if (c.decisiones.length) partes.push(`${c.decisiones.length} decisión(es)`);
  if (c.errores.length) partes.push(`${c.errores.length} error(es) previo(s)`);
  if (c.reglas.length) partes.push(`${c.reglas.length} regla(s)`);
  if (c.notas.length) partes.push(`${c.notas.length} nota(s)`);
  return partes.join(" · ");
}
