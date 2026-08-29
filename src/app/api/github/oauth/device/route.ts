/** Prism AI — Device flow de GitHub (si el navegador bloquea la ventana). */
import { NextResponse } from "next/server";
import { guardRequest, guardResponse } from "@/lib/prism/api-guard";
import { credsFrom, githubUser, pollDeviceFlow, startDeviceFlow } from "@/lib/prism/github-oauth-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = guardRequest(req);
  if (!guard.ok) return guardResponse(guard);

  const creds = credsFrom(req);
  if (!creds) {
    return NextResponse.json(
      {
        error: "Abre la ventana de GitHub para conectar tu cuenta.",
        usePopup: true,
      },
      { status: 409 }
    );
  }

  let body: { action?: string; device_code?: string } = {};
  try {
    body = (await req.json()) as { action?: string; device_code?: string };
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON no válido" }, { status: 400 });
  }

  try {
    if (body.action === "start") {
      const d = await startDeviceFlow(creds);
      return NextResponse.json({
        device_code: d.device_code,
        user_code: d.user_code,
        verification_uri: d.verification_uri,
        expires_in: d.expires_in,
        interval: d.interval,
      });
    }
    if (body.action === "poll") {
      const code = String(body.device_code ?? "");
      if (!code) return NextResponse.json({ error: "Falta device_code" }, { status: 400 });
      const r = await pollDeviceFlow(creds, code);
      if (r.error === "authorization_pending" || r.error === "slow_down") {
        return NextResponse.json({ pending: true, slow: r.error === "slow_down" });
      }
      if (r.error === "expired_token" || r.error === "access_denied") {
        return NextResponse.json({ error: "La autorización caducó o se canceló. Prueba otra vez." }, { status: 401 });
      }
      if (!r.access_token) {
        return NextResponse.json({ error: r.error_description || r.error || "Sin token" }, { status: 400 });
      }
      const user = await githubUser(r.access_token);
      return NextResponse.json({ token: r.access_token, ...user });
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
