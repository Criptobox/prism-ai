import { NextRequest } from "next/server";

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

/**
 * Protección del proxy (importante al publicar en Vercel o un servidor público):
 *  1. Si la petición trae `Origin`, debe coincidir con el host del despliegue.
 *     Peticiones sin Origin (curl, server-side, GET same-origin) pasan; un navegador
 *     en otra página web NO puede suplantar esto, así que el abuso desde webs
 *     queda bloqueado.
 *  2. Si el propietario define PRISM_ACCESS_CODE (variable de entorno), todas las
 *     peticiones deben traer la cabecera `x-prism-code` con ese valor. Prism AI lo
 *     envía automáticamente si lo configuras en Ajustes → Chat.
 */
function guardRequest(req: NextRequest): Response | null {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const o = new URL(origin);
      const host = req.headers.get("host");
      if (!host || o.host !== host) {
        return Response.json(
          { error: "Proxy: origen no permitido" },
          { status: 403 }
        );
      }
    } catch {
      return Response.json({ error: "Proxy: origen inválido" }, { status: 403 });
    }
  }
  const accessCode = process.env.PRISM_ACCESS_CODE?.trim();
  if (accessCode && req.headers.get("x-prism-code")?.trim() !== accessCode) {
    return Response.json(
      { error: "Proxy: código de acceso requerido (configúralo en Ajustes → Chat)" },
      { status: 401 }
    );
  }
  return null;
}

function validateTarget(req: NextRequest): { parsed: URL } | { error: Response } {
  const target = req.headers.get("x-target-url");
  if (!target) {
    return { error: Response.json({ error: "Falta la cabecera x-target-url" }, { status: 400 }) };
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { error: Response.json({ error: "URL de destino inválida" }, { status: 400 }) };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: Response.json({ error: "Protocolo no permitido" }, { status: 400 }) };
  }
  return { parsed };
}

/**
 * Proxy transparente: reenvía la petición a `x-target-url` manteniendo el
 * streaming. Evita restricciones CORS del navegador con cada proveedor.
 * No almacena nada: las claves solo pasan por las cabeceras.
 */
export async function POST(req: NextRequest) {
  const blocked = guardRequest(req);
  if (blocked) return blocked;

  const t = validateTarget(req);
  if ("error" in t) return t.error;

  const headers: Record<string, string> = {};
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  delete headers["x-prism-code"]; // interna, no se reenvía al proveedor
  // Evita que "host" y "content-length" del origen rompan la petición saliente.

  try {
    const upstream = await fetch(t.parsed.toString(), {
      method: "POST",
      headers,
      body: await req.text(),
      redirect: "follow",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de red";
    return Response.json({ error: `Proxy: ${msg}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const blocked = guardRequest(req);
  if (blocked) return blocked;

  const t = validateTarget(req);
  if ("error" in t) return t.error;

  const headers: Record<string, string> = {};
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  delete headers["x-prism-code"];

  try {
    const upstream = await fetch(t.parsed.toString(), { method: "GET", headers });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de red";
    return Response.json({ error: `Proxy: ${msg}` }, { status: 502 });
  }
}
