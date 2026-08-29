/** Prism AI — Versión local y, si GitHub responde, si hay una más nueva. */
import { NextResponse } from "next/server";
import { APP_COMMIT, APP_REPO, APP_VERSION, versionCheck } from "@/lib/prism/app-version";

export const runtime = "nodejs";

export async function GET() {
  let latest: string | null = null;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${APP_REPO}/main/package.json`, {
      headers: { "User-Agent": "prism-ai", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { version?: string };
      if (j.version) latest = String(j.version);
    }
  } catch {
    /* sin red o repo privado: se muestra solo la versión local */
  }
  return NextResponse.json({
    version: APP_VERSION,
    // El commit de la copia que este servidor sirve AHORA. La página lo compara
    // con el suyo para saber si se ha desplegado algo desde que se cargó.
    commit: APP_COMMIT,
    latest,
    status: versionCheck(APP_VERSION, latest),
  });
}
