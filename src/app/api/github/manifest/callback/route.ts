/** Prism AI — GitHub devuelve el code del manifiesto; lo convertimos en client_id/secret. */
import { NextResponse } from "next/server";
import { GH_APP_COOKIE } from "@/lib/prism/github-oauth";
import {
  GH_STATE_COOKIE,
  appOrigin,
  authorizeRedirect,
  cookieHeader,
  newPkce,
  packState,
  readCookie,
  unpackState,
} from "@/lib/prism/github-oauth-server";
import { githubInstallUrl } from "@/lib/prism/github-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  if (!code) {
    return NextResponse.redirect(`${origin}/api/github/oauth/start`);
  }

  const conv = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "User-Agent": "prism-ai" },
    signal: AbortSignal.timeout(20000),
  });
  if (!conv.ok) {
    const t = await conv.text().catch(() => "");
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><p>No se pudo registrar la app de GitHub (${conv.status}). ${t.slice(0, 180)}</p>`,
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  const j = (await conv.json()) as {
    client_id?: string;
    client_secret?: string;
    slug?: string;
    name?: string;
  };
  if (!j.client_id || !j.client_secret) {
    return new NextResponse("GitHub no devolvió client_id", { status: 502 });
  }

  const creds = { clientId: j.client_id, clientSecret: j.client_secret, slug: j.slug };
  const packedExisting = unpackState(readCookie(req, GH_STATE_COOKIE));
  const pkce = packedExisting ? { state: packedExisting.state, verifier: packedExisting.verifier } : newPkce();
  const packed = packedExisting ? packState(packedExisting.state, packedExisting.verifier) : packState(pkce.state, pkce.verifier);

  // Primero instala la app (permiso de escritura en repos); luego GitHub
  // pide OAuth (request_oauth_on_install) y cae en /oauth/callback.
  const next = j.slug ? githubInstallUrl(j.slug) : authorizeRedirect(creds, origin, packed);
  const res = NextResponse.redirect(next);
  res.headers.append("Set-Cookie", cookieHeader(GH_APP_COOKIE, JSON.stringify(creds), origin, 60 * 60 * 24 * 30));
  res.headers.append("Set-Cookie", cookieHeader(GH_STATE_COOKIE, packed, origin, 600));
  return res;
}
