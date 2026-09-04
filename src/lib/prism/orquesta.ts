/** Prism AI — Un director reparte, varios ejecutan, el director da el veredicto.
 *
 * `consensus.ts` manda LA MISMA pregunta a varios y uno compone la respuesta.
 * Esto es distinto: el director **parte el encargo** en trozos que se pueden
 * hacer por separado, cada ejecutor hace el suyo, y el director revisa lo que
 * volvió y decide. Es la forma de que un modelo bueno —el que pagas— dirija a
 * varios gratis en vez de hacerlo todo él.
 *
 * ——— Por qué esto NO estaba antes ———
 *
 * Se descartó un orquestador multiagente con el argumento de que los modelos
 * gratis fallan en cadenas largas. El argumento era incompleto: falla si TODA
 * la cadena es gratis. Con el director de pago y los ejecutores gratis, el que
 * razona y verifica es el bueno, y los baratos solo hacen trabajo acotado. Esa
 * es justo la arquitectura correcta para este producto.
 *
 * ——— Las tres cosas que lo hacen usable con dinero de por medio ———
 *
 * 1. **Techo duro de llamadas.** Un encargo son `2 + n` llamadas y ya está: el
 *    reparto, los ejecutores, y el veredicto. No hay bucle, no hay reintentos
 *    en cascada, no hay «una ronda más». Se sabe ANTES de empezar.
 * 2. **Compartimentación.** Cada ejecutor recibe SU sub-encargo y el contexto
 *    que el director le dio, no la conversación entera. Es a la vez más barato
 *    y menos superficie: tu historial no se reparte entre cuatro proveedores
 *    porque sí.
 * 3. **El veredicto dice de dónde sale cada cosa.** Si el director no puede
 *    verificar algo, lo dice en vez de firmarlo.
 *
 * Y lo que aquí NO se hace: **estimar el gasto en dinero**. Los precios varían
 * por proveedor, por modelo y con el tiempo, y no hay forma de saberlos desde
 * el dispositivo. Se cuentan llamadas y caracteres, que son datos duros. Un
 * «≈ 0,02 $» inventado en pantalla es peor que no poner nada.
 */

import type { ProviderId } from "./types";

/** Quién hace qué. */
export interface Miembro {
  providerId: ProviderId;
  modelId: string;
}

/** Un trozo del encargo, tal como lo repartió el director. */
export interface SubEncargo {
  /** título corto, para la traza */
  titulo: string;
  /** el encargo completo para el ejecutor: se le manda TAL CUAL */
  instruccion: string;
}

/** Cuántos ejecutores como mucho.
 *
 * Cuatro sub-encargos ya obligan al director a partir el trabajo de verdad; a
 * partir de ahí las piezas se solapan, el veredicto se alarga y cada ejecutor
 * extra es una llamada más por un trozo cada vez más pequeño. */
export const MAX_EJECUTORES = 4;

/** Por defecto. Dos es poco reparto, tres es donde empieza a compensar. */
export const EJECUTORES_POR_DEFECTO = 3;

/** Tope de caracteres del encargo que se le pasa al director.
 *
 * El director tiene que ver el encargo entero para poder partirlo, pero no la
 * conversación de cien mensajes: eso ya lo lleva el prompt de sistema. */
export const MAX_CHARS_ENCARGO = 24_000;

/** Tope de lo que vuelve de cada ejecutor y entra en el veredicto.
 *
 * Sin esto, cuatro ejecutores verbosos hacen que la llamada del veredicto —la
 * del modelo que pagas— sea la más cara de las seis. */
export const MAX_CHARS_RESULTADO = 12_000;

/** Cuántas llamadas cuesta un encargo con `n` ejecutores.
 *
 * Es una cuenta cerrada a propósito: reparto (1) + ejecutores (n) + veredicto
 * (1). Que se pueda decir el número exacto ANTES de arrancar es lo que
 * convierte esto en una herramienta y no en una ruleta.
 */
export function llamadasDe(n: number): number {
  return 2 + Math.max(1, Math.min(MAX_EJECUTORES, n));
}

export interface Aviso {
  llamadas: number;
  /** llamadas que hace el DIRECTOR (las que suelen costar dinero) */
  llamadasDirector: number;
  /** llamadas que hacen los ejecutores */
  llamadasEjecutores: number;
  /** caracteres que se le mandan al director en el reparto */
  charsEncargo: number;
  texto: string;
}

/**
 * Lo que hay que decirle al usuario ANTES de arrancar.
 *
 * Sin dinero: llamadas y caracteres. Y se separa lo del director de lo de los
 * ejecutores porque es la distinción que importa cuando uno se paga y los
 * otros no.
 */
export function avisoPrevio(n: number, encargo: string): Aviso {
  const ejecutores = Math.max(1, Math.min(MAX_EJECUTORES, n));
  const charsEncargo = Math.min(encargo.length, MAX_CHARS_ENCARGO);
  return {
    llamadas: llamadasDe(ejecutores),
    llamadasDirector: 2,
    llamadasEjecutores: ejecutores,
    charsEncargo,
    texto:
      `${llamadasDe(ejecutores)} llamadas en total: 2 al director (repartir y dar el veredicto) ` +
      `y ${ejecutores} a los ejecutores. No hay más rondas.`,
  };
}

/* ------------------------------------------------------------------ */
/* 1. El reparto                                                       */
/* ------------------------------------------------------------------ */

/** Lo que se le pide al director para que parta el encargo. */
export function promptDeReparto(encargo: string, n: number): string {
  const ejecutores = Math.max(1, Math.min(MAX_EJECUTORES, n));
  return [
    `Eres el director de un equipo de ${ejecutores} asistentes que trabajan EN PARALELO y NO se ven entre sí.`,
    "Tu trabajo AHORA es partir el encargo del usuario en trozos que se puedan hacer por separado.",
    "",
    "Reglas del reparto:",
    `- Exactamente ${ejecutores} trozos, ni uno más.`,
    "- Cada trozo tiene que poder hacerse SIN ver lo que hacen los demás. Si dos trozos dependen el uno del otro, están mal partidos.",
    "- Cada trozo lleva TODO lo que su ejecutor necesita saber: no puedes decir «como en el punto 2» ni «lo que ya se dijo».",
    "- Reparte por partes del trabajo, no por «tú lo haces y tú lo revisas»: revisar lo haces tú al final.",
    "- Si el encargo es tan pequeño que partirlo no aporta, dilo poniendo un solo trozo con el encargo entero.",
    "",
    "Responde SOLO con este formato, sin nada antes ni después:",
    "",
    "<trozo titulo=\"título corto\">",
    "el encargo completo para ese ejecutor",
    "</trozo>",
    "",
    `<encargo>\n${encargo.slice(0, MAX_CHARS_ENCARGO).trim()}\n</encargo>`,
  ].join("\n");
}

/**
 * Lee los trozos que devolvió el director.
 *
 * Tolerante a propósito: un modelo se deja una comilla, mete texto antes o
 * numera los trozos. Lo que NO se hace es inventar: si no hay ni un `<trozo>`
 * legible, se devuelve la lista vacía y el que llama decide (lo razonable es
 * hacer el encargo del tirón, sin orquesta).
 */
export function parseReparto(texto: string, max = MAX_EJECUTORES): SubEncargo[] {
  const out: SubEncargo[] = [];
  const re = /<trozo\s+titulo\s*=\s*["']?([^"'>]*)["']?\s*>([\s\S]*?)<\/trozo\s*>/gi;
  for (let m = re.exec(texto); m && out.length < max; m = re.exec(texto)) {
    const instruccion = m[2].trim();
    if (!instruccion) continue;
    out.push({ titulo: (m[1] || "").trim() || `Parte ${out.length + 1}`, instruccion });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 2. Los ejecutores                                                   */
/* ------------------------------------------------------------------ */

/**
 * Lo que ve un ejecutor: su trozo y nada más.
 *
 * **Aquí está la compartimentación.** No se le manda la conversación, ni los
 * trozos de los demás, ni el encargo original completo: solo lo que el
 * director decidió que necesita. Es más barato y, sobre todo, tu historial no
 * acaba repartido entre cuatro proveedores distintos porque sí.
 */
export function promptDeEjecutor(sub: SubEncargo): string {
  return [
    "Formas parte de un equipo, pero trabajas solo: no ves lo que hacen los demás y no falta información.",
    "Haz EXACTAMENTE lo que se te pide aquí abajo y nada más. No preguntes, no propongas alternativas, no expliques el enfoque: entrega el trabajo hecho.",
    "Si algo del encargo es imposible o falta un dato, dilo en una línea al final y entrega el resto igualmente.",
    "",
    `<tu-encargo titulo="${sub.titulo}">\n${sub.instruccion.trim()}\n</tu-encargo>`,
  ].join("\n");
}

/** Lo que devolvió un ejecutor. */
export interface Resultado {
  sub: SubEncargo;
  quien: Miembro;
  texto: string;
  /** si falló, el motivo. `texto` estará vacío. */
  error?: string;
  ms?: number;
}

/* ------------------------------------------------------------------ */
/* 3. El veredicto                                                     */
/* ------------------------------------------------------------------ */

/**
 * Lo que se le pide al director para cerrar.
 *
 * Se le manda el encargo original y lo que volvió de cada uno, RECORTADO: sin
 * el tope, cuatro ejecutores verbosos convierten la llamada del veredicto —la
 * del modelo que pagas— en la más cara de todas.
 *
 * Y se le pide explícitamente que diga qué NO pudo verificar. Un veredicto que
 * firma lo que no comprobó vale menos que ninguno.
 */
export function promptDeVeredicto(encargo: string, resultados: readonly Resultado[]): string {
  const bloques = resultados
    .map((r, i) => {
      const cuerpo = r.error
        ? `[no entregó: ${r.error}]`
        : r.texto.slice(0, MAX_CHARS_RESULTADO).trim() || "[respuesta vacía]";
      return `<parte n="${i + 1}" titulo="${r.sub.titulo}">\n${cuerpo}\n</parte>`;
    })
    .join("\n\n");

  const fallaron = resultados.filter((r) => r.error || !r.texto.trim()).length;

  return [
    "Eres el director. Repartiste este encargo y esto es lo que ha vuelto de cada parte.",
    "",
    "Tu trabajo AHORA:",
    "- Junta las partes en UNA entrega final, completa y coherente, que responda al encargo original.",
    "- Corrige lo que esté mal. No lo firmes por venir de otro.",
    "- Si dos partes se contradicen, decide tú y quédate con lo correcto.",
    fallaron > 0
      ? `- ${fallaron} parte(s) no entregaron. Haz tú esa parte si puedes; si no puedes, dilo al final en una línea.`
      : "- Si alguna parte se dejó algo, complétalo tú.",
    "",
    "IMPORTANTE — di la verdad sobre lo que no sabes:",
    "- Si algo de lo que entregas no lo has podido comprobar, dilo al final, en una línea, empezando por «Sin verificar:».",
    "- No inventes para tapar un hueco. Un hueco dicho vale más que un relleno.",
    "",
    "Entrega la respuesta final directamente, en el formato e idioma del encargo.",
    "NO menciones a los ejecutores, ni las partes, ni que hubo reparto: el usuario pidió un trabajo, no un informe del proceso.",
    "",
    `<encargo>\n${encargo.slice(0, MAX_CHARS_ENCARGO).trim()}\n</encargo>`,
    "",
    bloques,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Estado para la pantalla                                             */
/* ------------------------------------------------------------------ */

export type FaseOrquesta = "repartiendo" | "ejecutando" | "veredicto";

/** Qué se está haciendo, en una línea. Sin porcentajes inventados: se dice
 * cuántos han terminado de cuántos, que es lo que se sabe. */
export function estadoOrquesta(fase: FaseOrquesta, hechos = 0, total = 0): string {
  if (fase === "repartiendo") return "El director está repartiendo el trabajo…";
  if (fase === "ejecutando") return `Trabajando en paralelo… (${hechos}/${total})`;
  return "El director está revisando y cerrando…";
}

/**
 * ¿Merece la pena orquestar este encargo?
 *
 * Con un encargo de tres palabras, repartir cuesta dos llamadas del director
 * para no ganar nada. El umbral es bajo y conservador: no se trata de adivinar
 * la complejidad, sino de no gastar seis llamadas en un «gracias».
 */
export function mereceOrquesta(encargo: string): boolean {
  const limpio = encargo.trim();
  return limpio.length >= 40 && limpio.split(/\s+/).length >= 8;
}

/** Un reparto que no se pudo leer no debe parar el trabajo: se hace el encargo
 * del tirón. Esto lo dice, para poder contarlo en la traza. */
export function repartoFallido(subs: readonly SubEncargo[]): boolean {
  return subs.length === 0;
}
