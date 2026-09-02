/** Prism AI — Comprobar que un modelo responde ANTES de fiarse de él.
 *
 * Los catálogos mienten. Un proveedor lista glm-4.5 con la etiqueta de gratis y
 * al usarlo devuelve que ese modelo no está disponible en la capa gratuita; un
 * router arrastra ids que ya retiró. El resultado es siempre el mismo: eliges
 * un modelo, escribes tu mensaje y descubres el fallo cuando ya has perdido el
 * turno.
 *
 * Una prueba cuesta un token. Aquí está la parte que decide qué significa cada
 * respuesta, sin red y sin React, para poder fijarla con pruebas.
 */

export type ProbeVerdict =
  | "ok"
  | "no-existe"
  | "sin-permiso"
  | "limitado"
  | "caido"
  | "sin-red"
  | "sin-clave";

export interface ProbeResult {
  verdict: ProbeVerdict;
  /** código HTTP (0 si no hubo respuesta) */
  status: number;
  /** lo que dijo el proveedor, recortado */
  detail?: string;
  ms: number;
  at: number;
}

/** Señales de «ese modelo no existe» que llegan con un 400, no con un 404. */
const NO_EXISTE = [
  "model_not_found",
  "model not found",
  "unknown model",
  "does not exist",
  "no such model",
  "invalid model",
  "unsupported model",
  "modelo no",
  "not available",
  "no longer available",
  "deprecated",
  "no permission to access model",
];

/**
 * Qué significa la respuesta a la prueba.
 *
 * El 400 es el caso interesante: media docena de proveedores lo usan para «ese
 * modelo no existe» en vez del 404, así que hay que mirar el cuerpo. Si el 400
 * no habla del modelo, se trata como caída y no como id inválido: acusar a un
 * modelo bueno es peor que dejar pasar uno malo.
 */
export function classifyProbe(status: number, body = ""): ProbeVerdict {
  const t = body.toLowerCase();
  if (status === 0) return "sin-red";
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "limitado";
  if (status === 404) return "no-existe";
  // 410 Gone: el proveedor lo retiró y no va a volver. NVIDIA jubiló varios
  // modelos el 26/08/2026 y devolvía este código con la fecha en el cuerpo;
  // sin tratarlo caía en el cajón de «caído» y se reintentaba para siempre.
  if (status === 410) return "no-existe";
  if (status === 401) return "sin-clave";
  if (status === 403) {
    return NO_EXISTE.some((s) => t.includes(s)) ? "no-existe" : "sin-permiso";
  }
  if (status === 400 || status === 422) {
    return NO_EXISTE.some((s) => t.includes(s)) ? "no-existe" : "caido";
  }
  return "caido";
}

/**
 * ¿Se puede seguir contando con este modelo?
 *
 * «limitado» cuenta como sí a propósito: un 429 dice que el modelo existe y
 * responde, solo que ahora mismo has gastado la cuota. Quitarlo de la lista por
 * eso sería tirar justo los gratuitos, que son los que más se limitan.
 */
export function esUtilizable(v: ProbeVerdict): boolean {
  return v === "ok" || v === "limitado";
}

/** ¿El fallo es del modelo, o del proveedor/tu conexión? */
export function esCulpaDelModelo(v: ProbeVerdict): boolean {
  return v === "no-existe" || v === "sin-permiso";
}

export function mensajeProbe(v: ProbeVerdict): string {
  switch (v) {
    case "ok":
      return "Responde";
    case "limitado":
      return "Existe, pero has gastado la cuota";
    case "no-existe":
      return "El proveedor no reconoce este modelo";
    case "sin-permiso":
      return "Tu clave no tiene acceso a este modelo";
    case "sin-clave":
      return "Clave no válida o caducada";
    case "caido":
      return "El proveedor devolvió un error";
    case "sin-red":
      return "No hubo respuesta";
  }
}

/* ------------------------------------------------------------------ */
/* qué hacer con el fallo                                             */
/* ------------------------------------------------------------------ */

/**
 * Pista accionable a partir de lo que dijo el proveedor.
 *
 * Un 404 se traducía siempre por «el proveedor no reconoce este modelo», y con
 * eso se ofrecía quitarlos de la lista. Pero OpenRouter contesta 404 a TODOS
 * los `:free` de golpe cuando la cuenta no permite el uso de sus datos, y esos
 * modelos existen perfectamente: siguiendo el aviso te cargabas cinco modelos
 * buenos. Aquí solo se reconocen frases LITERALES del proveedor; si no encaja
 * ninguna se devuelve null y la interfaz enseña el texto crudo, que es la
 * verdad aunque sea fea.
 */
/** ¿El proveedor rechaza la petición por llevar una imagen?
 *
 * Se comprueba aparte porque el texto de OpenRouter —«No endpoints found that
 * support image input»— casa con el patrón genérico de «no hay proveedor
 * sirviendo el modelo», y son dos problemas distintos con dos soluciones
 * distintas. */
export function esFalloDeImagen(body = ""): boolean {
  const t = body.toLowerCase();
  return (
    t.includes("support image input") ||
    t.includes("support image") ||
    t.includes("image input") ||
    (t.includes("image") && t.includes("not supported"))
  );
}

export function pistaDelFallo(status: number, body = ""): string | null {
  const t = body.toLowerCase();
  if (t.includes("data policy") || t.includes("data-policy")) {
    return "No es que el modelo no exista: OpenRouter bloquea los modelos gratis hasta que aceptes su política de datos. Se activa en openrouter.ai/settings/privacy.";
  }
  // ANTES que el «no endpoints found» genérico, que también casa con este
  // texto: «No endpoints found that support image input». No es lo mismo —
  // el modelo se está sirviendo perfectamente, lo que no admite es la imagen—
  // y decir «ningún proveedor lo sirve» manda a buscar el fallo donde no está.
  if (esFalloDeImagen(body)) {
    return "Ese modelo no admite imágenes: la petición llevaba una y por eso la rechaza. Manda solo texto, o elige un modelo con visión.";
  }
  if (t.includes("no endpoints found") || t.includes("no allowed providers")) {
    return "Ahora mismo ningún proveedor está sirviendo ese modelo. Suele volver solo; no hace falta quitarlo.";
  }
  if (status === 429 || t.includes("rate limit") || t.includes("rate-limit")) {
    return "Has llegado al límite de peticiones. El modelo está bien; espera y vuelve a probar.";
  }
  if (status === 401) {
    return "La clave no es válida o ha caducado. Es la clave, no el modelo.";
  }
  return null;
}

/**
 * ¿Se puede afirmar que la culpa es del modelo?
 *
 * Solo cuando NO hay una explicación mejor. Sin esto, un bloqueo de la cuenta
 * o un límite de peticiones se presentaban como «este modelo no existe» y se
 * ofrecía borrarlo.
 */
export function culpaConfirmadaDelModelo(r: Pick<ProbeResult, "verdict" | "status" | "detail">): boolean {
  if (!esCulpaDelModelo(r.verdict)) return false;
  return pistaDelFallo(r.status, r.detail ?? "") === null;
}

/* ------------------------------------------------------------------ */
/* recorrido con límite de concurrencia                               */
/* ------------------------------------------------------------------ */

/**
 * Prueba una lista sin abrir treinta peticiones a la vez.
 *
 * Con capas gratuitas eso es contraproducente: la ráfaga se come el límite de
 * peticiones por minuto y la propia comprobación provoca los 429 que luego
 * interpretaría como fallo.
 */
export async function probeAll<T>(
  items: T[],
  probe: (item: T) => Promise<ProbeResult>,
  opts: { concurrency?: number; onResult?: (item: T, r: ProbeResult) => void } = {}
): Promise<Map<T, ProbeResult>> {
  const limite = Math.max(1, opts.concurrency ?? 3);
  const salida = new Map<T, ProbeResult>();
  let i = 0;

  const obrero = async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      const item = items[idx];
      const r = await probe(item);
      salida.set(item, r);
      opts.onResult?.(item, r);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, obrero));
  return salida;
}

/** Los que hay que proponer quitar tras una tanda de pruebas. */
export function modelosRotos<T>(resultados: Map<T, ProbeResult>): T[] {
  return [...resultados.entries()]
    .filter(([, r]) => culpaConfirmadaDelModelo(r))
    .map(([m]) => m);
}
