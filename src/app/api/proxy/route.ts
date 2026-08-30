import { NextRequest } from "next/server";
import { lookup } from "node:dns/promises";
import { guardRequest, guardResponse } from "@/lib/prism/api-guard";
import { checkTarget, mensajeDe, type AllowedTarget } from "@/lib/prism/net-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARDED_HEADERS = [
  "authorization",
  "x-api-key",
  "x-goog-api-key",
  "anthropic-version",
  "anthropic-dangerous-direct-browser-access",
  "content-type",
  "accept",
  "http-referer",
  "x-title",
  "x-prism-code",
];

/** Máximo de saltos que se siguen a mano, revalidando cada uno. */
const MAX_REDIRECTS = 3;

/**
 * Tiempo máximo esperando al proveedor.
 *
 * Sin esto, un proveedor que no contesta deja la petición colgada hasta que la
 * corta la plataforma, y el navegador ve un fetch fallido sin respuesta. El
 * usuario leía entonces «no se pudo contactar con el servidor de Prism» —
 * culpando a Prism— cuando el que no respondía era el proveedor. Se vio con
 * NVIDIA NIM: 85 segundos y ni un byte.
 *
 * 90 s da margen a un modelo lento razonando; a partir de ahí, se dice quién
 * no contestó.
 */
const TIMEOUT_MS = 90_000;

/** Resuelve un nombre a todas sus direcciones (IPv4 e IPv6). */
async function resolveHost(hostname: string): Promise<string[]> {
  const res = await lookup(hostname, { all: true, verbatim: true });
  return res.map((r) => r.address);
}

/** Comprueba el destino y devuelve la respuesta de error si no vale. */
async function validateTarget(target: string | null): Promise<AllowedTarget | Response> {
  if (!target) {
    return Response.json({ error: "Falta la cabecera x-target-url" }, { status: 400 });
  }
  const check = await checkTarget(target, resolveHost);
  if (check.blocked) {
    // El detalle va dentro: quien despliega necesita saber por qué se cortó,
    // y no revela nada que el atacante no supiera ya (él eligió el destino).
    return Response.json(
      { error: `Destino no permitido: ${mensajeDe(check.reason)}`, detalle: check.detail },
      { status: 403 }
    );
  }
  return check;
}

function forwardHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  delete headers["x-prism-code"]; // interna, no se reenvía al proveedor
  return headers;
}

/**
 * Sigue las redirecciones a mano, revalidando cada salto.
 *
 * Con `redirect: "follow"` bastaba con que un destino permitido respondiera
 * «301 → http://169.254.169.254» para que el proxy fuera hasta allí: la
 * comprobación inicial no vale de nada si luego se obedece a ciegas.
 */
async function fetchValidado(
  url: string,
  init: RequestInit
): Promise<Response | { proxyError: Response }> {
  let actual = url;
  for (let salto = 0; salto <= MAX_REDIRECTS; salto++) {
    const res = await fetch(actual, { ...init, redirect: "manual" });
    const esRedireccion = res.status >= 300 && res.status < 400;
    if (!esRedireccion) return res;

    const destino = res.headers.get("location");
    if (!destino) return res;
    const siguiente = new URL(destino, actual).toString();
    const check = await validateTarget(siguiente);
    if (check instanceof Response) return { proxyError: check };
    actual = check.url.toString();
    // tras una redirección, el cuerpo ya se consumió: los saltos van sin él
    init = { ...init, method: res.status === 303 ? "GET" : init.method, body: undefined };
  }
  return {
    proxyError: Response.json({ error: "Demasiadas redirecciones" }, { status: 502 }),
  };
}

/** Cabeceras de CUOTA que se devuelven al navegador tal y como llegaron del
 * proveedor: el medidor de «Cuota» las necesita en el cliente (Groq, Cerebras y
 * compañía mandan x-ratelimit-* en cada respuesta; sin reenvío, el proxy se las
 * comía y el medidor se quedaba ciego). Son metadatos públicos, sin secretos. */
const QUOTA_HEADER_RE = /^(x-ratelimit-|retry-after$)/i;

async function proxy(req: NextRequest, method: "GET" | "POST"): Promise<Response> {
  const guard = guardRequest(req);
  if (!guard.ok) return guardResponse(guard);

  const t = await validateTarget(req.headers.get("x-target-url"));
  if (t instanceof Response) return t;

  const init: RequestInit = {
    method,
    headers: forwardHeaders(req),
    ...(method === "POST" ? { body: await req.text() } : {}),
  };

  const corte = AbortSignal.timeout(TIMEOUT_MS);
  init.signal = corte;

  try {
    const upstream = await fetchValidado(t.url.toString(), init);
    if ("proxyError" in upstream) return upstream.proxyError;
    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
      ...(method === "POST" ? { "X-Accel-Buffering": "no" } : {}),
    };
    for (const [k, v] of upstream.headers) {
      if (QUOTA_HEADER_RE.test(k)) headers[k] = v;
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    // Se distingue «tardó demasiado» de «falló la red», porque llevan al
    // usuario a sitios opuestos: lo primero es del proveedor, lo segundo suyo.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return Response.json(
        {
          error:
            `El proveedor (${t.url.host}) no respondió en ${TIMEOUT_MS / 1000} segundos. ` +
            "No es tu conexión ni Prism: prueba con otro modelo, o vuelve a intentarlo " +
            "más tarde si el proveedor está saturado.",
        },
        { status: 504 }
      );
    }
    const msg = err instanceof Error ? err.message : "Error de red";
    return Response.json({ error: `Proxy: ${msg}` }, { status: 502 });
  }
}

/**
 * Proxy transparente: reenvía la petición a `x-target-url` manteniendo el
 * streaming. Evita restricciones CORS del navegador con cada proveedor.
 * No almacena nada: las claves solo pasan por las cabeceras.
 *
 * El destino pasa por el escudo de red (net-guard): sin él, cualquiera con la
 * URL del despliegue podía hacer que el servidor leyera los metadatos de la
 * nube o cualquier servicio de su red interna.
 */
export async function POST(req: NextRequest) {
  return proxy(req, "POST");
}

export async function GET(req: NextRequest) {
  return proxy(req, "GET");
}
