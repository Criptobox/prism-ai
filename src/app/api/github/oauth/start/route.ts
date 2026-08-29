/** Prism AI — Arranca el login de GitHub (popup o pestaña). */
import { NextResponse } from "next/server";
import { githubManifestPayload } from "@/lib/prism/github-oauth";
import {
  GH_STATE_COOKIE,
  appOrigin,
  authorizeRedirect,
  cookieHeader,
  credsFrom,
  newPkce,
  packState,
} from "@/lib/prism/github-oauth-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const pkce = newPkce();
  const packed = packState(pkce.state, pkce.verifier);
  const creds = credsFrom(req);

  if (creds) {
    const url = authorizeRedirect(creds, origin, packed);
    const res = NextResponse.redirect(url);
    res.headers.append("Set-Cookie", cookieHeader(GH_STATE_COOKIE, packed, origin, 600));
    return res;
  }

  // Sin OAuth App en el servidor: el usuario registra una GitHub App en su
  // cuenta (un clic) y a continuación autoriza. Cero variables de entorno.
  const manifest = JSON.stringify(githubManifestPayload(origin));
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Conectar GitHub · Prism</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0b12;color:#eee}
    p{opacity:.7;font-size:.9rem}
  </style>
</head>
<body>
  <p>Te llevamos a GitHub para conectar tu cuenta…</p>
  <form id="f" action="https://github.com/settings/apps/new?state=${encodeURIComponent(pkce.state)}" method="post">
    <input type="hidden" name="manifest" value="${manifest.replace(/"/g, "&quot;")}">
  </form>
  <script>document.getElementById("f").submit()</script>
</body>
</html>`;
  const res = new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
  res.headers.append("Set-Cookie", cookieHeader(GH_STATE_COOKIE, packed, origin, 600));
  return res;
}
