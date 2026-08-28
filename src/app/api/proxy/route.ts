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
];

/**
 * Proxy transparente: reenvía la petición a `x-target-url` manteniendo el
 * streaming. Evita restricciones CORS del navegador con cada proveedor.
 * No almacena nada: las claves solo pasan por las cabeceras.
 */
export async function POST(req: NextRequest) {
  const target = req.headers.get("x-target-url");
  if (!target) {
    return Response.json({ error: "Falta la cabecera x-target-url" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: "URL de destino inválida" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return Response.json({ error: "Protocolo no permitido" }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  // Evita que "host" y "content-length" del origen rompan la petición saliente.

  try {
    const upstream = await fetch(parsed.toString(), {
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
  const target = req.headers.get("x-target-url");
  if (!target) {
    return Response.json({ error: "Falta la cabecera x-target-url" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: "URL de destino inválida" }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }

  try {
    const upstream = await fetch(parsed.toString(), { method: "GET", headers });
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
