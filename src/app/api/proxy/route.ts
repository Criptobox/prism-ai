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

  try {
    const upstream = await fetchValidado(t.url.toString(), init);
    if ("proxyError" in upstream) return upstream.proxyError;
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        ...(method === "POST" ? { "X-Accel-Buffering": "no" } : {}),
      },
    });
  } catch (err) {
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
