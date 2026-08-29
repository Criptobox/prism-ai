/** Prism AI — Versión local y, si GitHub responde, si hay una más nueva.
 * Se consulta la API de GitHub (/repos/…/contents/package.json), que responde
 * con CORS abierto y funciona en casi cualquier red; raw.githubusercontent.com
 * tiene más bloqueos corporativos y aquí mismo daba tiempo agotado. */
import { NextResponse } from "next/server";
import { APP_REPO, APP_VERSION, packageVersion, versionCheck } from "@/lib/prism/app-version";

export const runtime = "nodejs";

async function latestFromGithub(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${APP_REPO}/contents/package.json`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "prism-ai",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      }
    );
    if (res.ok) {
      const j = (await res.json()) as { content?: string };
      if (j.content) {
        const text = Buffer.from(j.content.replace(/\n/g, ""), "base64").toString("utf8");
        return packageVersion(text);
      }
    }
  } catch {
    /* sin red o repo privado */
  }
  // Fallback: release más reciente (etiqueta «v3.4.0» → «3.4.0»)
  try {
    const res = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "prism-ai" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { tag_name?: string };
      return packageVersion(String(j.tag_name ?? "").replace(/^v/i, ""));
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function GET() {
  const latest = await latestFromGithub();
  return NextResponse.json({
    version: APP_VERSION,
    latest,
    status: versionCheck(APP_VERSION, latest),
  });
}
