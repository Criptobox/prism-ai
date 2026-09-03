/** Prism AI — Escudo PII local (guardrail inspirado en el «PII Shield» de OrcaRouter).
 *
 * Detecta y enmascara parcialmente datos personales en lo que ENVÍAS al modelo:
 * correos, teléfonos (ES/internacionales), tarjetas (validadas con Luhn), IBAN
 * y DNI/NIE. El texto que ves en la burbuja no cambia — solo lo que viaja.
 * Todo se calcula en tu navegador con regex; nada se envía a ningún servidor.
 *
 * Guardianes: el contenido dentro de bloques de código vallados y código en
 * línea NO se enmascara (ahí los «datos» suelen ser ejemplos de prueba).
 */

export interface PiiFinding {
  type: "email" | "phone" | "card" | "iban" | "dni";
  /** muestra parcial de lo detectado, para el toast (ya enmascarada) */
  preview: string;
}

export interface PiiResult {
  masked: string;
  findings: PiiFinding[];
}

/** Algoritmo de Luhn: evita enmascarar números largos que no son tarjetas */
export function luhnValid(digits: string): boolean {
  const s = digits.replace(/[\s-]/g, "");
  if (!/^\d{13,16}$/.test(s)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function maskKeep(text: string, keepHead: number, keepTail: number, ch = "*"): string {
  const n = text.length;
  const head = text.slice(0, keepHead);
  const tail = keepTail > 0 ? text.slice(n - keepTail) : "";
  return head + ch.repeat(Math.max(3, n - keepHead - keepTail)) + tail;
}

function maskEmail(m: string): string {
  const at = m.indexOf("@");
  const local = m.slice(0, at);
  const domain = m.slice(at);
  return (local[0] ?? "*") + "***" + domain;
}

const PATTERNS: { type: PiiFinding["type"]; re: RegExp; mask: (m: string) => string }[] = [
  {
    type: "email",
    // correos estándar (no dentro de URLs ya filtradas por el guardián)
    re: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{2,}\.[A-Za-z]{2,}\b/g,
    mask: maskEmail,
  },
  {
    type: "card",
    re: /\b(?:\d[ -]?){13,16}\b/g,
    mask: (m) => {
      const digits = m.replace(/\D/g, "");
      return luhnValid(digits) ? "**** **** **** " + digits.slice(-4) : m;
    },
  },
  {
    type: "iban",
    re: /\b[A-Z]{2}\d{2}(?:[ ]?\d{4}){3,6}[ ]?\d{1,4}\b/g,
    mask: (m) => m.slice(0, 2) + "** **** **** " + m.replace(/\s/g, "").slice(-4),
  },
  {
    type: "dni",
    re: /\b(?:[XYZ]\d{7}|[HLKLMNPQRSTUVWX]\d{7}|\d{8})[-\s]?[A-Z]\b/g,
    mask: (m) => maskKeep(m, 2, 1),
  },
  {
    type: "phone",
    // +34 6xx … · ES móvil 6/7 · fijo 9/8 · EE.UU. (xxx) xxx-xxxx · genérico +ccc
    re:
      /\+(?:\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{3}(?:[ .-]?\d{2,4}){2,4}\b|\b[679]\d{2}[ .-]?\d{3}[ .-]?\d{3}\b|\b\(\d{3}\)\s?\d{3}[-.]\d{4}\b/g,
    mask: (m) => "***" + m.replace(/\D/g, "").slice(-3),
  },
];

/** Detecta sin modificar (para contadores/avisos) */
export function detectPII(text: string): PiiFinding[] {
  const out: PiiFinding[] = [];
  const { masked } = guard(text);
  for (const { type, re, mask } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
      const preview = mask(m[0]);
      if (type === "card" && preview === m[0]) continue; // no era una tarjeta (Luhn)
      out.push({ type, preview });
    }
  }
  return out;
}

/** Sustituye zonas protegidas por tokens \u0000n\u0000 (como en compress.ts) */
function guard(text: string): { masked: string; restore: (s: string) => string } {
  const vault: string[] = [];
  const keep = (m: string) => {
    const idx = vault.push(m) - 1;
    return `\u0000${idx}\u0000`;
  };
  const masked = text
    .replace(/```[\s\S]*?```/g, keep)
    .replace(/`[^`\n]+`/g, keep)
    .replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, keep);
  return { masked, restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => vault[Number(i)] ?? "") };
}

/** Enmascara los PII del texto. Idempotente: los trozos ya enmascarados no re-casan. */
export function maskPII(text: string): PiiResult {
  if (!text || text.length < 7) return { masked: text, findings: [] };
  const { masked, restore } = guard(text);
  const findings: PiiFinding[] = [];
  let out = masked;
  for (const { type, re, mask } of PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => {
      const replacement = mask(m);
      if (type === "card" && replacement === m) return m; // Luhn no pasó: es otro número
      findings.push({ type, preview: replacement });
      return replacement;
    });
  }
  return { masked: restore(out), findings };
}

/** Etiquetas en español para el toast */
export const PII_LABELS: Record<PiiFinding["type"], string> = {
  email: "correo",
  phone: "teléfono",
  card: "tarjeta",
  iban: "IBAN",
  dni: "DNI/NIE",
};

/* ------------------------------------------------------------------ */
/* El escudo aplicado a una conversación                               */
/* ------------------------------------------------------------------ */

/** Un turno tal como entra al escudo. */
export interface TurnoEscudo {
  role: string;
  /** lo que el usuario ESCRIBIÓ */
  content: string;
}

export interface ResultadoEscudo {
  /** los contenidos ya enmascarados, en el mismo orden */
  contenidos: string[];
  total: number;
  tipos: PiiFinding["type"][];
  /** true si algo se encontró en el ÚLTIMO mensaje del usuario (el que acaba
   * de escribir), false si todo venía de mensajes anteriores */
  enEsteMensaje: boolean;
}

/**
 * Aplica el escudo a los mensajes del usuario de una conversación.
 *
 * Dos cosas que aquí NO se hacen, y las dos son a propósito:
 *
 * · **No se toca lo que el usuario adjuntó.** Un correo dentro de un HTML es
 *   contenido del proyecto, no un dato personal escrito en una frase. Cuando
 *   se enmascaraba, el modelo veía `co***@ejemplo.com` en el código y te
 *   devolvía el archivo con el correo roto: el escudo estropeaba tu trabajo
 *   creyendo que te protegía. Los archivos se adjuntan a propósito.
 *
 * · **No se tocan las respuestas del modelo.** Enmascarar lo que él mismo
 *   escribió no protege nada —ya salió y volvió— y le rompe su propio código
 *   en la siguiente vuelta.
 *
 * Se dice además DÓNDE se encontró, porque el aviso daba a entender que era en
 * lo que acababas de escribir aunque vinera de diez mensajes atrás.
 */
export function escudoHistorial(mensajes: readonly TurnoEscudo[], activo: boolean): ResultadoEscudo {
  const contenidos = mensajes.map((m) => m.content);
  if (!activo) return { contenidos, total: 0, tipos: [], enEsteMensaje: false };

  const tipos = new Set<PiiFinding["type"]>();
  let total = 0;
  let enEsteMensaje = false;
  const ultimoUsuario = mensajes.map((m) => m.role).lastIndexOf("user");

  for (let i = 0; i < mensajes.length; i++) {
    if (mensajes[i].role !== "user") continue;
    const r = maskPII(mensajes[i].content);
    if (!r.findings.length) continue;
    contenidos[i] = r.masked;
    total += r.findings.length;
    for (const f of r.findings) tipos.add(f.type);
    if (i === ultimoUsuario) enEsteMensaje = true;
  }
  return { contenidos, total, tipos: [...tipos], enEsteMensaje };
}
