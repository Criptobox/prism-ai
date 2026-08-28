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

/** Instrucciones de sistema que activan el bucle del agente */
export function agentPrompt(maxLoops: number): string {
  const loops = Math.min(8, Math.max(1, Math.round(maxLoops) || 3));
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
<project-map>{"name":"Nombre","description":"1 línea","files":[{"name":"index.html","kind":"html","summary":"qué contiene","links":["styles.css","app.js"]}],"features":["función 1"],"notes":["tema principal: azul"]}</project-map>`;
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
