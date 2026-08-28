/** Prism AI — Guardián común de las rutas de servidor.
 *
 * Prism es una app de navegador, pero tiene tres rutas que corren en el
 * servidor. Cuando la despliegas en Vercel esas rutas quedan expuestas a
 * internet, y hasta ahora solo el proxy comprobaba algo — y lo que comprobaba
 * (el `Origin`) no sirve contra `curl`, que sencillamente no lo manda.
 *
 * Aquí está la política, en un solo sitio y probada:
 *
 *  - `Origin` presente y de otro host → 403. Corta el abuso desde otra web.
 *  - `PRISM_ACCESS_CODE` definido → hay que mandar `x-prism-code` con ese valor.
 *  - Rutas que tocan el disco del servidor (`/api/repos`) → en producción
 *    exigen `PRISM_ACCESS_CODE` sí o sí. Sin él la ruta queda apagada, porque
 *    abierta permite leer y escribir los repositorios que hayas clonado.
 *
 * En desarrollo local no estorba nada: sin código configurado y sin producción,
 * todo pasa igual que antes.
 */

export type GuardOutcome =
  | { ok: true }
  | { ok: false; status: number; error: string; hint?: string };

export interface GuardInput {
  /** cabecera Origin de la petición, si la hay */
  origin: string | null;
  /** cabecera Host de la petición */
  host: string | null;
  /** cabecera x-prism-code de la petición */
  code: string | null;
  /** valor de PRISM_ACCESS_CODE en el entorno, si lo hay */
  accessCode: string | null;
  /** true si NODE_ENV === "production" */
  isProduction: boolean;
  /** true para rutas que leen o escriben en el disco del servidor */
  touchesDisk?: boolean;
}

/** Decide si una petición puede seguir. Pura: se prueba sin levantar nada. */
export function evaluateGuard(input: GuardInput): GuardOutcome {
  const { origin, host, code, accessCode, isProduction, touchesDisk } = input;

  // 1. Si viene de una página web, tiene que ser la nuestra.
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return { ok: false, status: 403, error: "Origen no válido" };
    }
    if (!host || originHost !== host) {
      return { ok: false, status: 403, error: "Origen no permitido" };
    }
  }

  const configurado = accessCode?.trim() || null;

  // 2. Las rutas que tocan el disco no pueden quedar abiertas en producción.
  if (touchesDisk && isProduction && !configurado) {
    return {
      ok: false,
      status: 503,
      error: "Esta función está desactivada en este despliegue",
      hint:
        "Repo Studio en modo descargado lee y escribe archivos en el servidor. " +
        "Para habilitarlo define la variable de entorno PRISM_ACCESS_CODE y ponla " +
        "en Ajustes → Chat. Sin ella la ruta queda cerrada a propósito.",
    };
  }

  // 3. Con código configurado, hay que traerlo.
  if (configurado && code?.trim() !== configurado) {
    return {
      ok: false,
      status: 401,
      error: "Código de acceso requerido",
      hint: "Configúralo en Ajustes → Chat con el mismo valor que PRISM_ACCESS_CODE.",
    };
  }

  return { ok: true };
}

/** Lee las cabeceras de una petición y aplica la política. */
export function guardRequest(
  req: { headers: { get(name: string): string | null } },
  opts: { touchesDisk?: boolean } = {}
): GuardOutcome {
  return evaluateGuard({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    code: req.headers.get("x-prism-code"),
    accessCode: process.env.PRISM_ACCESS_CODE ?? null,
    isProduction: process.env.NODE_ENV === "production",
    touchesDisk: opts.touchesDisk,
  });
}

/** Respuesta lista para devolver cuando el guardián rechaza. */
export function guardResponse(outcome: Extract<GuardOutcome, { ok: false }>): Response {
  return Response.json(
    { error: outcome.error, ...(outcome.hint ? { hint: outcome.hint } : {}) },
    { status: outcome.status }
  );
}
