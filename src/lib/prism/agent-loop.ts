/** Prism AI — Modo agente: bucle plan → ejecutar → revisar (método iterativo
 * popularizado por Claude Code). El modelo estructura su respuesta con etiquetas
 * XML y este parser las convierte en una línea de tiempo de iteraciones que la
 * UI renderiza EN VIVO mientras llega el streaming.
 */

export interface AgentPlanBlock {
  kind: "plan";
  items: string[];
  open: boolean;
}
export interface AgentStepBlock {
  kind: "step";
  n: number;
  title: string;
  body: string;
  open: boolean;
}
export interface AgentReviewBlock {
  kind: "review";
  pass: boolean;
  notes: string;
}
export interface AgentAnswerBlock {
  kind: "answer";
  body: string;
}
export interface AgentMapBlock {
  kind: "map";
  json: string;
}
export interface AgentTextBlock {
  kind: "text";
  body: string;
}
export type AgentBlock =
  | AgentPlanBlock
  | AgentStepBlock
  | AgentReviewBlock
  | AgentAnswerBlock
  | AgentMapBlock
  | AgentTextBlock;

export interface AgentTrace {
  /** true si el contenido usa la estructura del agente */
  active: boolean;
  blocks: AgentBlock[];
  /** número de iteraciones (steps) detectadas */
  iterations: number;
  /** JSON del <project-map> si el modelo lo emitió */
  mapJson?: string;
}

/** Instrucciones de sistema que activan el bucle del agente.
 * `reglas`: memoria de fallos verificables de intentos anteriores — errores del
 * Sandbox, trabajos a medias, desbordes medidos. El agente las consulta ANTES de
 * actuar, que es donde una regla sirve; leerlas después es un pósit. */
export function agentPrompt(maxLoops: number, reglas?: string[]): string {
  const loops = Math.min(8, Math.max(1, Math.round(maxLoops) || 3));
  const memoria =
    reglas && reglas.length
      ? `\n\n## Memoria de fallos — reglas aprendidas de errores reales\nEn intentos anteriores se verificaron estos fallos. NO los repitas:\n${reglas
          .slice(0, 8)
          .map((r, i) => `${i + 1}. ${r}`)
          .join("\n")}\nSi una regla no aplica a esta tarea concreta, ignórala con juicio.`
      : "";
  return `## MODO AGENTE — bucle plan → ejecutar → revisar
Trabajas como un agente autónomo por ITERACIONES y estructuras tu respuesta EXACTAMENTE con estas etiquetas:

<plan>
- [paso corto]
- [paso corto]
</plan>

<step n="1" title="qué construyes ahora">
Ejecución real del paso. Si generas código o una página, inclúyelo aquí COMPLETO en un bloque de código con su lenguaje.
</step>

<review pass="no">
Revisión honesta del resultado: lista corta de lo que falla o falta.
</review>

<step n="2" title="corrección">
Corrige lo detectado. NO empieces de cero: mejora lo que ya hiciste.
</step>

<review pass="yes">
Confirmación de que TODO el plan se cumplió.
</review>

<answer>
Respuesta final al usuario: qué se construyó, cómo usarlo y pendientes si los hay.
</answer>

Reglas del bucle:
1. Cada iteración = un <step> seguido de su <review>. Si pass="no", continúa OBLIGATORIAMENTE con otro <step> que corrija lo pendiente (máximo ${loops} iteraciones).
2. Tras una revisión con pass="yes", cierra SIEMPRE con <answer>.
3. El código va SIEMPRE dentro de un <step>, nunca suelto. Entre iteraciones NO repitas código que no cambies; cuando entregues un archivo, entrégalo COMPLETO y actualizado.
4. Si la tarea es trivial (saludo, pregunta corta), responde normal sin etiquetas.
5. Si creas o modificas un proyecto, termina con el mapa actualizado (incluye "notes" con las decisiones/reglas del proyecto que debas recordar, y "links" con los archivos locales que cada archivo referencia):
<project-map>{"name":"Nombre","description":"1 línea","files":[{"name":"index.html","kind":"html","summary":"qué contiene","links":["styles.css","app.js"]}],"features":["función 1"],"notes":["tema principal: azul"]}</project-map>${memoria}`;
}

const TAGS = "plan|step|review|answer|project-map";
const TOKEN_RE = new RegExp(`<(/?)(${TAGS})((?:\\s[^>]*)?)>`, "g");

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

function planItems(body: string): string[] {
  return body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 12);
}

function truthy(v: string | null): boolean {
  if (!v) return false;
  return /^(yes|si|sí|true|ok|1)$/i.test(v.trim());
}

/**
 * Parsea la respuesta del agente (soporta streaming: la última etiqueta sin
 * cerrar se emite con open=true). Si no hay etiquetas de agente devuelve
 * active=false para que el mensaje se renderice como markdown normal.
 */
export function parseAgentTrace(content: string | null | undefined): AgentTrace {
  const empty: AgentTrace = { active: false, blocks: [], iterations: 0 };
  if (!content) return empty;

  const blocks: AgentBlock[] = [];
  let saw = false;
  let cur: { tag: string; attrs: string; buf: string } | null = null;
  let idx = 0;

  const flush = (c: { tag: string; attrs: string; buf: string }, open: boolean) => {
    const body = c.buf.trim();
    switch (c.tag) {
      case "plan":
        if (body || open) blocks.push({ kind: "plan", items: planItems(body), open });
        break;
      case "step":
        blocks.push({
          kind: "step",
          n: Number(attr(c.attrs, "n")) || blocks.filter((b) => b.kind === "step").length + 1,
          title: attr(c.attrs, "title") ?? "",
          body,
          open,
        });
        break;
      case "review":
        blocks.push({ kind: "review", pass: truthy(attr(c.attrs, "pass")), notes: body });
        break;
      case "answer":
        if (body) blocks.push({ kind: "answer", body });
        break;
      case "project-map":
        if (body) blocks.push({ kind: "map", json: body });
        break;
    }
  };

  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(content))) {
    const [full, slash, tag, attrs = ""] = m;
    if (cur) {
      cur.buf += content.slice(idx, m.index);
    } else {
      const before = content.slice(idx, m.index);
      if (before.trim()) blocks.push({ kind: "text", body: before.trim() });
    }
    saw = true;
    if (!slash) {
      // etiqueta anidada inesperada: cerramos la anterior de forma defensiva
      if (cur) flush(cur, true);
      cur = { tag, attrs, buf: "" };
    } else if (cur && cur.tag === tag) {
      flush(cur, false);
      cur = null;
    }
    // cierre sin apertura equivalente: se ignora
    idx = m.index + full.length;
  }

  if (!saw) return empty;

  const tail = content.slice(idx);
  if (cur) {
    cur.buf += tail;
    flush(cur, true); // streaming: bloque aún abierto
  } else if (tail.trim()) {
    blocks.push({ kind: "text", body: tail.trim() });
  }

  return {
    active: true,
    blocks,
    iterations: blocks.filter((b) => b.kind === "step").length,
    mapJson: blocks.find((b) => b.kind === "map")?.json,
  };
}

/* ------------------------------------------------------------------ */
/* el agente se queda a medias                                        */
/* ------------------------------------------------------------------ */

export type StalledReason =
  | "revision-pendiente" // la última revisión dijo «no» y no vino la corrección
  | "sin-respuesta" // hubo trabajo pero nunca cerró con <answer>
  | null;

export interface StalledInfo {
  stalled: boolean;
  reason: StalledReason;
  /** iteraciones completadas cuando se paró */
  iterations: number;
}

/**
 * ¿Terminó el agente su trabajo, o se quedó a medias?
 *
 * El bucle es por prompt: se le pide al modelo un máximo de iteraciones y que
 * cierre con <answer>. Cuando choca con ese techo —o simplemente se corta— la
 * respuesta se quedaba ahí, sin decir nada y sin manera de seguir. Detectarlo
 * permite ofrecer «Continuar» en vez de dejar el trabajo colgado.
 *
 * Solo se mira una traza YA terminada: durante el streaming siempre parece
 * incompleta.
 */
export function agentStalled(trace: AgentTrace): StalledInfo {
  const base = { stalled: false, reason: null as StalledReason, iterations: trace.iterations };
  if (!trace.active) return base;

  // una etiqueta sin cerrar significa que aún está escribiendo, o que se cortó
  const abierta = trace.blocks.some((b) => "open" in b && b.open);
  if (abierta) return base;

  const tieneRespuesta = trace.blocks.some((b) => b.kind === "answer");
  if (tieneRespuesta) return base;

  // sin <answer>: ¿llegó a trabajar algo?
  const revisiones = trace.blocks.filter((b): b is AgentReviewBlock => b.kind === "review");
  const ultima = revisiones[revisiones.length - 1];
  if (ultima && !ultima.pass) {
    return { stalled: true, reason: "revision-pendiente", iterations: trace.iterations };
  }
  if (trace.iterations > 0) {
    return { stalled: true, reason: "sin-respuesta", iterations: trace.iterations };
  }
  return base;
}

/** Instrucción para retomar un trabajo del agente que se quedó a medias. */
export function continuePrompt(info: StalledInfo): string {
  const detalle =
    info.reason === "revision-pendiente"
      ? "Tu última revisión marcaba pass=\"no\" y quedó sin corregir."
      : "No llegaste a cerrar con <answer>.";
  return `Continúa el trabajo anterior desde donde lo dejaste. ${detalle}

Sigue con la MISMA estructura de etiquetas (<step>, <review>, <answer>) y numera los <step> a partir de ${info.iterations + 1}. No repitas lo que ya está hecho: corrige lo que quedaba pendiente y cierra con <answer>.`;
}

/* ------------------------------------------------------------------ */
/* sugerir el modo agente                                             */
/* ------------------------------------------------------------------ */

/** Verbos de construcción: piden fabricar algo, no responder algo.
 * Se usan raíces con las terminaciones habituales del español, para que valgan
 * tanto «crea» como «crees» o «que programes». */
const CONSTRUIR = new RegExp(
  "\\b(?:" +
    [
      "cr[eé]([aeo]|as|es|en|ar)?",
      "ha(z|zme|cer|gas|ga)",
      "constru(y[aeo]s?|ye|ir|yan)",
      "desarroll([aeo]|as|es|en|ar)",
      "program([aeo]|as|es|en|ar)",
      "implement([aeo]|as|es|en|ar)",
      "mont([aeo]|as|es|en|ar)",
      "gener([aeo]|as|es|en|ar)",
      "diseñ([aeo]|as|es|en|ar)",
      "build|make|create",
    ].join("|") +
    ")\\b",
  "i"
);

/** Cosas que se construyen y suelen necesitar varias pasadas. */
const ARTEFACTO =
  /\b(web|p[áa]gina|sitio|landing|app|aplicaci[óo]n|juego|dashboard|panel|formulario|api|componente|script|clon|portfolio|tienda|blog|calculadora|chat|editor|proyecto)\b/i;

/** Señales de que hace falta iterar y revisar. */
const ITERATIVO =
  /\b(completa|completo|entera|entero|desde cero|paso a paso|funcional|que funcione|con todo|full|profesional)\b/i;

export interface AgentSuggestion {
  suggest: boolean;
  /** por qué se sugiere, para decírselo a la persona */
  reason: string;
}

/**
 * ¿Este mensaje se beneficiaría del modo agente?
 *
 * Chatbox resuelve esto con un modelo clasificador barato en el primer turno.
 * Aquí se hace con reglas locales a propósito: gastar una llamada extra —y en
 * Prism, una petición a TU clave— para adivinar una preferencia no compensa.
 * A cambio hay que ser conservador: solo se sugiere cuando hay verbo de
 * construcción Y algo concreto que construir, y jamás se activa solo.
 */
export function suggestAgentMode(text: string): AgentSuggestion {
  const t = text.trim();
  if (t.length < 15) return { suggest: false, reason: "" };
  // una pregunta suele querer respuesta, no un proyecto
  if (/^(qu[ée]|c[óo]mo|cu[áa]l|por qu[ée]|cu[áa]ndo|d[óo]nde|qui[ée]n)\b/i.test(t)) {
    return { suggest: false, reason: "" };
  }
  if (!CONSTRUIR.test(t)) return { suggest: false, reason: "" };
  if (!ARTEFACTO.test(t)) return { suggest: false, reason: "" };

  const largo = t.length > 120;
  const iterativo = ITERATIVO.test(t);
  return {
    suggest: true,
    reason: iterativo
      ? "Pides algo completo y funcionando"
      : largo
        ? "Es un encargo con varios detalles"
        : "Parece que quieres construir algo",
  };
}
