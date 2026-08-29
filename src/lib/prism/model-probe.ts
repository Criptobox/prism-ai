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
    .filter(([, r]) => esCulpaDelModelo(r.verdict))
    .map(([m]) => m);
}
