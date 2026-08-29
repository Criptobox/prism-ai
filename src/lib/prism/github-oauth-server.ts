/** Prism AI — OAuth de GitHub en el servidor (cookies, intercambio, HTML).
 * No importar desde componentes de cliente. */
import { createHash, randomBytes } from "node:crypto";
import {
  GH_APP_COOKIE,
  GH_OAUTH_MSG,
  GH_STATE_COOKIE,
  githubAuthorizeUrl,
  parseAppCredsJson,
  parseOAuthTokenResponse,
  type AppCreds,
  type OAuthTokenResult,
} from "./github-oauth";

export function appOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const xf = req.headers.get("x-forwarded-proto");
  const proto = xf || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return part.slice(i + 1).trim();
    }
  }
  return null;
}

export function cookieHeader(name: string, value: string, origin: string, maxAge: number): string {
  const secure = origin.startsWith("https") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearCookieHeader(name: string, origin: string): string {
  return cookieHeader(name, "", origin, 0);
}

export function envCreds(): AppCreds | null {
  const clientId = (process.env.GITHUB_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GITHUB_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function credsFrom(req: Request): AppCreds | null {
  return envCreds() || parseAppCredsJson(readCookie(req, GH_APP_COOKIE) ?? "");
}

export function newPkce(): { state: string; verifier: string; challenge: string } {
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function packState(state: string, verifier: string): string {
  return `${state}.${verifier}`;
}

export function unpackState(raw: string | null): { state: string; verifier: string } | null {
  if (!raw) return null;
  const i = raw.indexOf(".");
  if (i < 8) return null;
  return { state: raw.slice(0, i), verifier: raw.slice(i + 1) };
}

export function authorizeRedirect(creds: AppCreds, origin: string, packed: string): string {
  const u = unpackState(packed);
  if (!u) throw new Error("state interno no válido");
  return githubAuthorizeUrl({
    clientId: creds.clientId,
    redirectUri: `${origin}/api/github/oauth/callback`,
    state: u.state,
    challenge: createHash("sha256").update(u.verifier).digest("base64url"),
  });
}

export async function exchangeGithubCode(opts: {
  creds: AppCreds;
  code: string;
  redirectUri: string;
  verifier?: string;
}): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    client_id: opts.creds.clientId,
    client_secret: opts.creds.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
  if (opts.verifier) body.set("code_verifier", opts.verifier);
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "prism-ai",
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  return parseOAuthTokenResponse(text, res.headers.get("content-type") ?? "");
}

export async function githubUser(token: string): Promise<{ login: string; name: string; avatar: string }> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "prism-ai",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("No se pudo leer tu usuario de GitHub");
  const j = (await res.json()) as { login?: string; name?: string; avatar_url?: string };
  const login = j.login ?? "";
  return {
    login,
    name: j.name || login,
    avatar: j.avatar_url || (login ? `https://github.com/${login}.png?size=64` : ""),
  };
}

export async function startDeviceFlow(creds: AppCreds): Promise<{
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}> {
  const body = new URLSearchParams({ client_id: creds.clientId, scope: "repo" });
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "prism-ai",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  const parsed = parseOAuthTokenResponse(text, res.headers.get("content-type") ?? "") as OAuthTokenResult & {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
  };
  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const p = new URLSearchParams(text);
    extra = {
      device_code: p.get("device_code"),
      user_code: p.get("user_code"),
      verification_uri: p.get("verification_uri"),
      expires_in: Number(p.get("expires_in") ?? 900),
      interval: Number(p.get("interval") ?? 5),
    };
  }
  const device_code = String(extra.device_code ?? "");
  const user_code = String(extra.user_code ?? "");
  if (!device_code || !user_code) {
    throw new Error(parsed.error_description || parsed.error || "GitHub no inició el flujo de dispositivo");
  }
  return {
    device_code,
    user_code,
    verification_uri: String(extra.verification_uri ?? "https://github.com/login/device"),
    expires_in: Number(extra.expires_in ?? 900),
    interval: Number(extra.interval ?? 5),
  };
}

export async function pollDeviceFlow(creds: AppCreds, deviceCode: string): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  if (creds.clientSecret) body.set("client_secret", creds.clientSecret);
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "prism-ai",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  return parseOAuthTokenResponse(text, res.headers.get("content-type") ?? "");
}

export function oauthResultHtml(
  origin: string,
  payload: {
    token?: string;
    login?: string;
    name?: string;
    avatar?: string;
    error?: string;
  }
): string {
  const json = JSON.stringify({ type: GH_OAUTH_MSG, ...payload });
  const ok = !payload.error && !!payload.token;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${ok ? "GitHub conectado" : "GitHub"} · Prism</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      font-family: ui-sans-serif, system-ui, sans-serif; background:#0b0b12; color:#eee; }
    .c { text-align:center; max-width:22rem; padding:1.5rem; }
    p { opacity:.72; font-size:.9rem; line-height:1.45; }
  </style>
</head>
<body>
  <div class="c">
    <p>${ok ? "Cuenta conectada. Puedes cerrar esta ventana." : payload.error ? escapeHtml(payload.error) : "Volviendo a Prism…"}</p>
  </div>
  <script>
  (function () {
    var payload = ${json};
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, ${JSON.stringify(origin)});
        window.close();
        return;
      }
    } catch (e) {}
    try {
      if (payload.token) {
        localStorage.setItem("prism-github-token", payload.token);
        localStorage.setItem("prism-github-account", JSON.stringify({
          login: payload.login || "",
          name: payload.name || "",
          avatar: payload.avatar || "",
          source: "oauth"
        }));
        try { window.dispatchEvent(new Event("prism-github-account")); } catch (e2) {}
      }
    } catch (e) {}
    location.replace(${JSON.stringify(origin + "/")});
  })();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export { GH_APP_COOKIE, GH_STATE_COOKIE };
