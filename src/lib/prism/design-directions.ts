/** Prism AI — Dirección de diseño: tokens obligatorios antes de generar UI
 * (Pilar 2 del plan de escalado).
 *
 * El problema típico de «hazme una landing»: hero centrado, botones
 * redondeados, Inter/system-ui y tres cards. Se arregla con DIRECCIÓN
 * EXPLÍCITA, no dejándolo a discreción del modelo.
 *
 * Las 5 direcciones visuales están curadas (inspiradas en el concepto de
 * «visual directions» de OpenDesign, Apache-2.0 — adaptadas, no copiadas):
 * paleta en OKLCH, pareja tipográfica, radios, sombras y reglas de
 * composición ya resueltos. Cuando el usuario no da dirección clara, el
 * sistema ELIGE una (rotando para no repetirse entre proyectos) y la
 * anuncia — elicitación mínima: una pregunta de alto nivel, nunca un
 * formulario técnico de hex y fuentes.
 *
 * Este módulo es puro: nada de React ni storage. La variación entre
 * proyectos se guarda en `memoria-proyecto.ts` (DisenoUsado).
 */

/** Una dirección visual completa y autocontenida. */
export interface DireccionVisual {
  id: string;
  nombre: string;
  /** para qué tipo de proyecto brilla */
  cuando: string;
  /** paleta en OKLCH: fondo, superficie, texto primario, secundario, acento, acento 2 */
  paleta: {
    fondo: string;
    superficie: string;
    texto: string;
    textoSuave: string;
    acento: string;
    acento2: string;
  };
  /** pareja tipográfica: display (personalidad) + cuerpo (trabajo) */
  fuentes: { display: string; cuerpo: string; mono: string };
  radios: string;
  sombras: string;
  /** separación vertical característica (escala de espaciado) */
  espaciado: string;
  /** reglas de composición: layout prohibido y el preferido */
  composicion: string;
  /** micro-detalles con intención */
  detalle: string;
}

/** Las 5 direcciones curadas. Cada una es un mundo completo: si una
 * propiedad no encaja con las demás, la dirección entera pierde
 * credibilidad (un neobrutalismo con sombras suaves no es nada). */
export const DIRECCIONES: readonly DireccionVisual[] = [
  {
    id: "editorial",
    nombre: "Editorial de revista",
    cuando: "contenidos, portfolios, marcas con historia y texto protagonista",
    paleta: {
      fondo: "oklch(0.97 0.005 85)",
      superficie: "oklch(1 0 0)",
      texto: "oklch(0.22 0.01 60)",
      textoSuave: "oklch(0.45 0.01 60)",
      acento: "oklch(0.55 0.18 25)",
      acento2: "oklch(0.75 0.1 85)",
    },
    fuentes: { display: "Playfair Display", cuerpo: "Source Sans 3", mono: "IBM Plex Mono" },
    radios: "0px (bordes rectos, líneas finas de 1px)",
    sombras: "ninguna — jerarquía por peso tipográfico, líneas y espacio",
    espaciado: "generoso y vertical: secciones de 96–128px, retícula de 12 columnas",
    composicion:
      "PROHIBIDO hero centrado con botón. Composición asimétrica tipo revista: titulares enormes que cruzan columnas, texto en dos columnas con capitular, imágenes sangradas al borde, numeración de secciones (01, 02…)",
    detalle:
      "filetes horizontales finos, números de sección en serif, hover de enlaces subrayando con transición de izquierda a derecha",
  },
  {
    id: "minimal",
    nombre: "Minimal cálido",
    cuando: "productos digitales, apps SaaS serias, marcas que respiran",
    paleta: {
      fondo: "oklch(0.985 0.004 90)",
      superficie: "oklch(1 0 0)",
      texto: "oklch(0.2 0.005 90)",
      textoSuave: "oklch(0.5 0.01 90)",
      acento: "oklch(0.58 0.13 155)",
      acento2: "oklch(0.85 0.06 80)",
    },
    fuentes: { display: "Fraunces", cuerpo: "Inter Tight", mono: "JetBrains Mono" },
    radios: "12px en tarjetas, 999px en botones píldora",
    sombras: "sombra única muy suave: 0 1px 2px rgba(0,0,0,.05) — nada flotante",
    espaciado: "mucho aire: 8/16/32/64px, una sola idea por pantalla",
    composicion:
      "PROHIBIDO tres tarjetas iguales. Un titular grande a la izquierda con una composición viva a la derecha, listas con mucho aire en vez de cards, una sola llamada a la acción por pantalla",
    detalle:
      "divisores casi invisibles, iconografía de trazo fino de 1.5px, un solo elemento con color en cada vista para guiar el ojo",
  },
  {
    id: "tech",
    nombre: "Tech utility",
    cuando: "herramientas para desarrolladores, dashboards, productos técnicos",
    paleta: {
      fondo: "oklch(0.16 0.012 250)",
      superficie: "oklch(0.21 0.015 250)",
      texto: "oklch(0.93 0.005 250)",
      textoSuave: "oklch(0.68 0.02 250)",
      acento: "oklch(0.75 0.14 195)",
      acento2: "oklch(0.7 0.17 300)",
    },
    fuentes: { display: "Space Grotesk", cuerpo: "IBM Plex Sans", mono: "IBM Plex Mono" },
    radios: "6px — precisión, no redondez amable",
    sombras: "sin sombras difusas: bordes de 1px en oklch con alfa 0.1 y glow puntual solo en el estado activo",
    espaciado: "denso y alineado a retícula de 4px: panel, no póster",
    composicion:
      "PROHIBIDO landing de marketing con hero. App de verdad: barra lateral, barra superior con estado, datos densos en tablas/monospace, números tabulares, badges de estado con punto de color",
    detalle:
      "fondo con retícula sutil de puntos, código y medidas en mono, tooltips con borde, focus ring de 2px en acento",
  },
  {
    id: "brutalista",
    nombre: "Neobrutalismo",
    cuando: "proyectos culturales, eventos, marcas jóvenes que quieren ser recordadas",
    paleta: {
      fondo: "oklch(0.9 0.06 85)",
      superficie: "oklch(0.97 0.02 85)",
      texto: "oklch(0.15 0.02 280)",
      textoSuave: "oklch(0.35 0.03 280)",
      acento: "oklch(0.62 0.24 30)",
      acento2: "oklch(0.8 0.19 130)",
    },
    fuentes: { display: "Archivo Black", cuerpo: "Space Mono", mono: "Space Mono" },
    radios: "0px — bordes de 2–3px sólidos en negro",
    sombras: "sombra dura desplazada: 6px 6px 0 #000 — sin difuminar nunca",
    espaciado: "denso y directo, bloques que chocan entre sí",
    composicion:
      "PROHIBIDO elegancia neutra. Bloques de color puro con bordes negros gruesos, titulares en mayúsculas gigantes, marcos con sombra dura, stickers/girados levemente (rotate -2deg), marquee de texto si encaja",
    detalle:
      "botones que se «hunden» (translate + sombra que se acorta) al hover, subrayados marcadores, listas con guiones en cuadrado",
  },
  {
    id: "calido",
    nombre: "Cálido orgánico",
    cuando: "gastronomía, bienestar, artesanía, tiendas con producto físico",
    paleta: {
      fondo: "oklch(0.96 0.015 70)",
      superficie: "oklch(0.99 0.008 70)",
      texto: "oklch(0.28 0.02 50)",
      textoSuave: "oklch(0.5 0.02 50)",
      acento: "oklch(0.5 0.12 45)",
      acento2: "oklch(0.72 0.1 140)",
    },
    fuentes: { display: "DM Serif Display", cuerpo: "Nunito Sans", mono: "DM Mono" },
    radios: "16px en tarjetas, imágenes de 24px, círculos donde sume",
    sombras: "sombra cálida y baja: 0 8px 24px rgba(80,50,20,.08)",
    espaciado: "respirado, con ondas o formas orgánicas separando secciones",
    composicion:
      "PROHIBIDO grid mecánico. Composición en ondas/diagonales suaves, fotografía protagonista con máscaras orgánicas (blob), texto que abraza imágenes, secciones alternando fondo claro y crema",
    detalle:
      "transiciones suaves de 300ms, texturas de papel sutil en el fondo, iconografía redondeada, botones con estado hover que crece 2%",
  },
] as const;

export const IDS_DIRECCIONES = DIRECCIONES.map((d) => d.id);

export function direccionPorId(id: string): DireccionVisual | null {
  return DIRECCIONES.find((d) => d.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* elección de dirección (elicitación mínima)                         */
/* ------------------------------------------------------------------ */

/** Palabras que PIDE una dirección concreta. Es la capa 1: si el prompt
 * trae dirección clara («landing minimalista», «estilo brutalista»), se
 * respeta sin preguntar nada.
 * Sin `\b` final a propósito: «restaurante» tiene que casar con
 * «restaurant» y «orgánico» con «orgánic» (los sufijos españoles bailan). */
const SEÑALES: Record<string, RegExp> = {
  editorial: /\b(editorial|revista|magazine|peri[óo]dico|art[íi]culo|portafolio de escrit|tipograf[íi]a serif)/i,
  minimal: /\b(minimal|minimalista|limpio|sencillo|elegante|premium|saas|serio|corporativo|fintech)/i,
  tech: /\b(tech|t[ée]cnic|developer|c[óo]digo|dashboard|herramienta|terminal|devtool|dark mode)/i,
  brutalista: /\b(brutalis|neobrutal|atrevido|llamativo|bold|joven|punk|festival|cultura)/i,
  calido: /\b(c[áa]lid|org[áa]nic|natural|restaurant|gastronom|bienestar|spa|artesan[íi]a|ecol[óo]gic|cafeter[íi]a|pasteler[íi]a)/i,
};

export interface EleccionDireccion {
  direccion: DireccionVisual;
  /** cómo se decidió: la del usuario (palabra clave) o la del sistema (rotación) */
  origen: "usuario" | "sistema";
}

/** Elige la dirección visual para un encargo de UI.
 *
 * Capa 1: el prompt ya trae dirección → esa, sin preguntar (plan §2.0).
 * Capa 2: rotación determinista evitando lo ya usado en este proyecto
 * (memoria) y en esta conversación: así la enésima landing no se parece
 * a las anteriores. `evitar` son ids de direcciones recientes. */
export function elegirDireccion(
  prompt: string,
  evitar: readonly string[] = []
): EleccionDireccion {
  const t = prompt ?? "";
  for (const [id, rx] of Object.entries(SEÑALES)) {
    if (rx.test(t)) {
      const d = direccionPorId(id);
      if (d) return { direccion: d, origen: "usuario" };
    }
  }
  // rotación: las candidatas son todas menos las recientes; si todas están
  // quemadas, se empieza de nuevo (mejor repetir el ciclo que no decidir)
  const candidatas = DIRECCIONES.filter((d) => !evitar.includes(d.id));
  const pool = candidatas.length ? candidatas : DIRECCIONES;
  // determinista: hash simple del prompt para que el mismo encargo decida
  // igual (reproducible) pero distinto encargo varíe
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return { direccion: pool[h % pool.length], origen: "sistema" };
}

/* ------------------------------------------------------------------ */
/* DESIGN.md — el contrato de marca del proyecto                      */
/* ------------------------------------------------------------------ */

/** Genera el `DESIGN.md` del proyecto a partir de la dirección elegida.
 * Estructura adaptada del concepto de contrato de marca de OpenDesign
 * (Apache-2.0): paleta, tipografía, tono, reglas. Viaja como archivo del
 * proyecto (se puede commitear) y como bloque del prompt. */
export function aDesignMd(d: DireccionVisual, nombreProyecto?: string): string {
  return [
    `# DESIGN.md — ${nombreProyecto ? nombreProyecto : "Dirección de diseño"}${nombreProyecto ? "" : `: ${d.nombre}`}`,
    "",
    `> Dirección: **${d.nombre}** (${d.id}). Brilla en: ${d.cuando}.`,
    "> Este documento es el contrato visual del proyecto: cualquier UI nueva lo respeta.",
    "",
    "## Paleta (OKLCH)",
    `- Fondo: ${d.paleta.fondo}`,
    `- Superficie: ${d.paleta.superficie}`,
    `- Texto: ${d.paleta.texto}`,
    `- Texto secundario: ${d.paleta.textoSuave}`,
    `- Acento: ${d.paleta.acento}`,
    `- Acento secundario: ${d.paleta.acento2}`,
    "",
    "## Tipografía",
    `- Display: ${d.fuentes.display}`,
    `- Cuerpo: ${d.fuentes.cuerpo}`,
    `- Mono: ${d.fuentes.mono}`,
    "",
    "## Forma",
    `- Radios: ${d.radios}`,
    `- Sombras: ${d.sombras}`,
    `- Espaciado: ${d.espaciado}`,
    "",
    "## Composición",
    d.composicion,
    "",
    "## Detalles con intención",
    d.detalle,
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* el bloque del prompt                                               */
/* ------------------------------------------------------------------ */

/** Checklist anti-AI-slop: el modelo se autoevalúa ANTES de entregar
 * (plan §2.4, tercera fila). Cinco dimensiones, corrección antes de
 * mostrar. */
export const CHECKLIST_ANTI_SLOP = [
  "JERARQUÍA — ¿un solo elemento domina la vista y el ojo sabe a dónde ir? Si todo pesa igual, falla.",
  "TIPOGRAFÍA — ¿la pareja tipográfica se usa con intención (pesos, tamaños, tracking) o es la de por defecto?",
  "COLOR — ¿cada color tiene un porqué (acento en la acción principal, superficies diferenciadas)? ¿Hay al menos un contraste fuerte y deliberado?",
  "ESPACIO — ¿la densidad es una decisión (aire generoso O denso alineado), no un accidente?",
  "DETALLE MEMORABLE — ¿hay UN gesto visual que se recuerde (una forma, un patrón, una micro-interacción)? Si lo quitaras y la página siguiera igual de genérica, falla.",
].join("\n");

/** El bloque de dirección de diseño que se inyecta en el system prompt
 * cuando el encargo es de UI. Tope acotado: viaja en TODA generación web. */
export function promptDireccion(e: EleccionDireccion): string {
  const d = e.direccion;
  const anuncio =
    e.origen === "sistema"
      ? "Has decidido tú (el encargo no traía estilo claro): anúncialo en UNA frase al responder («He elegido una dirección X porque…»). Si te piden otra cosa, cámbiala sin quejarte."
      : "El encargo trae la dirección clara: respétala sin anunciarla.";
  return [
    "## DIRECCIÓN DE DISEÑO (obligatoria, decide ANTES de escribir una línea de UI)",
    `Dirección: ${d.nombre} — ${d.cuando}.`,
    `Paleta (OKLCH): fondo ${d.paleta.fondo} · superficie ${d.paleta.superficie} · texto ${d.paleta.texto} · secundario ${d.paleta.textoSuave} · acento ${d.paleta.acento} · acento2 ${d.paleta.acento2}.`,
    `Tipografía: ${d.fuentes.display} (display) + ${d.fuentes.cuerpo} (cuerpo) + ${d.fuentes.mono} (mono). Cárgalas de Google Fonts si usas HTML autónomo.`,
    `Radios: ${d.radios}. Sombras: ${d.sombras}. Espaciado: ${d.espaciado}.`,
    `Composición: ${d.composicion}.`,
    `Detalles: ${d.detalle}.`,
    anuncio,
    "",
    "Antes de entregar, corrígete contra esta checklist y arregla lo que falle:",
    CHECKLIST_ANTI_SLOP,
  ].join("\n");
}

/** Variación forzada: ¿el encargo pide UI nueva (y no un retoque)?
 * Se usa para decidir si inyectar dirección y registrarla. Un retoque
 * («cambia el botón») no debe cambiar la dirección del proyecto. */
export function esEncargoUINueva(prompt: string): boolean {
  const t = prompt ?? "";
  if (!t.trim()) return false;
  const construir =
    /\b(cr[eé]a|crea|haz|hazme|construye|dise[ñn]a|genera|programa|monta|desarrolla|build|create|make|design)\b/i;
  const ui = /\b(web|p[áa]gina|sitio|landing|app|aplicaci[óo]n|dashboard|panel|portfolio|tienda|blog|formulario|componente|ui|interfaz)\b/i;
  return construir.test(t) && ui.test(t);
}
