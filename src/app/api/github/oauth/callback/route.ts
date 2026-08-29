/** Prism AI — GitHub redirige aquí con ?code= tras autorizar. */
import { NextResponse } from "next/server";
import {
  GH_STATE_COOKIE,
  appOrigin,
  credsFrom,
  exchangeGithubCode,
  githubUser,
  oauthResultHtml,
  unpackState,
  readCookie,
} from "@/lib/prism/github-oauth-server";

export const runtime = "nodejs";

function html(origin: string, payload: Parameters<typeof oauthResultHtml>[1], status = 200) {
  return new NextResponse(oauthResultHtml(origin, payload), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const url = new URL(req.url);
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return html(origin, { error: err });

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code) return html(origin, { error: "GitHub no devolvió un código de autorización" }, 400);

  const packed = unpackState(readCookie(req, GH_STATE_COOKIE));
  // El flujo de «instalar app» a veces no reenvía nuestro state: si hay
  // credenciales de la app (cookie o env) seguimos; si hay state, tiene que coincidir.
  if (packed && state && packed.state !== state) {
    return html(origin, { error: "La sesión de GitHub no coincide. Prueba a conectar otra vez." }, 400);
  }

  const creds = credsFrom(req);
  if (!creds) {
    return html(origin, { error: "Faltan las credenciales de GitHub. Vuelve a pulsar Conectar." }, 400);
  }

  try {
    const tokenRes = await exchangeGithubCode({
      creds,
      code,
      redirectUri: `${origin}/api/github/oauth/callback`,
      verifier: packed?.verifier,
    });
    if (!tokenRes.access_token) {
      return html(
        origin,
        { error: tokenRes.error_description || tokenRes.error || "GitHub no entregó el token" },
        400
      );
    }
    const user = await githubUser(tokenRes.access_token);
    return html(origin, { token: tokenRes.access_token, ...user });
  } catch (e) {
    return html(origin, { error: e instanceof Error ? e.message : String(e) }, 502);
  }
}
