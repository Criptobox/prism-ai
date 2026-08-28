/** Prism AI — Publicación de cambios de Repo Studio a GitHub.
 * Dos vías:
 *  1. pushFilesToRepo   → commit directo en el repo original (si es tuyo) con la Contents API
 *  2. publishAsNewRepo  → publica los archivos editados como un repo nuevo de tu cuenta
 * El token se lee del mismo almacén local que «Subir a GitHub».
 */

import type { GhItem } from "./github-upload";
import { uploadToGithub, type GhProgress } from "./github-upload";

const GH_API = "https://api.github.com";

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(path.startsWith("http") ? path : GH_API + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30000),
  });
}

async function ghError(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try {
    const j = (await res.json()) as { message?: string };
    if (j?.message) msg = j.message;
  } catch {
    /* sin cuerpo JSON */
  }
  if (res.status === 401) msg += " — el token no es válido o expiró";
  if (res.status === 403)
    msg += " — probablemente el repo no es tuyo o el token no tiene scope «repo»";
  throw new Error(`GitHub ${res.status}: ${msg}`);
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

export interface RepoFileChange {
  path: string;
  content: string;
}

/** Hace 1 commit por archivo modificado en el repo original (rama por defecto). */
export async function pushFilesToRepo(
  token: string,
  owner: string,
  repo: string,
  files: RepoFileChange[],
  onProgress?: (done: number, total: number, path: string) => void
): Promise<{ commits: number }> {
  let done = 0;
  for (const f of files) {
    onProgress?.(done, files.length, f.path);
    // 1) sha actual del archivo (404 = archivo nuevo)
    const getRes = await ghFetch(token, `/repos/${owner}/${repo}/contents/${encodePath(f.path)}`);
    let sha: string | undefined;
    if (getRes.ok) {
      const j = (await getRes.json()) as { sha?: string };
      sha = j.sha;
    } else if (getRes.status !== 404) {
      await ghError(getRes, `No se pudo leer ${f.path}`);
    }
    // 2) commit del archivo
    const putRes = await ghFetch(token, `/repos/${owner}/${repo}/contents/${encodePath(f.path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Prism AI: actualizar ${f.path}`,
        content: toBase64(f.content),
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) await ghError(putRes, `No se pudo subir ${f.path}`);
    done++;
    onProgress?.(done, files.length, f.path);
  }
  return { commits: files.length };
}

function encodePath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** Publica los archivos editados como un repo nuevo (para cuando el original no es tuyo). */
export async function publishAsNewRepo(
  token: string,
  repoName: string,
  isPrivate: boolean,
  files: RepoFileChange[],
  onProgress?: (p: GhProgress) => void
): Promise<{ url: string; commits: number }> {
  const items: GhItem[] = files.map((f) => ({
    path: f.path,
    file: new File([f.content], f.path.split("/").pop() ?? "archivo.txt"),
  }));
  return uploadToGithub(token, { repoName, isPrivate, items, onProgress });
}
