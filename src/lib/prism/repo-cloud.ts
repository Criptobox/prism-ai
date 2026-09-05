/** Prism AI — Repo Studio modo DIRECTO (sin descargar).
 * Trabaja contra la API de GitHub desde el navegador: árbol de archivos,
 * lectura puntual, edición y commit único con Git Database API.
 * Nada se clona ni se guarda en disco: el repo vive en GitHub y tú editas en vivo.
 */
import { decodeText, isJunkPath, isTextPath } from "./sandbox";
import { readZip } from "./zip";

const GH_API = "https://api.github.com";

export interface CloudRepoInfo {
  owner: string;
  repo: string;
  defaultBranch: string;
  isPrivate: boolean;
  canPush: boolean;
  htmlUrl: string;
}

export interface CloudFile {
  path: string;
  size: number;
  sha: string;
}

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const t = token.trim();
  return fetch(path.startsWith("http") ? path : GH_API + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
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
  if (res.status === 404) msg += " — ¿repo privado? Añade un token con scope «repo»";
  if (res.status === 403) msg += " — sin permiso o límite de peticiones alcanzado";
  throw new Error(`GitHub ${res.status}: ${msg}`);
}

/** Acepta URL de GitHub, ssh o «usuario/repo». */
export function parseRepoInput(raw: string): { owner: string; repo: string } | null {
  const text = raw.trim();
  if (!text) return null;
  let m = text.match(
    /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/i
  );
  if (m) return { owner: m[1], repo: m[2] };
  m = text.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i);
  if (m) return { owner: m[1], repo: m[2] };
  m = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (m && m[1].toLowerCase() !== "github.com") return { owner: m[1], repo: m[2] };
  return null;
}

/** Encuentra un repo de GitHub dentro de un mensaje (enlace, ssh o «usuario/repo»). */
export function extractRepoFromText(text: string): { owner: string; repo: string; url: string } | null {
  const raw = text.trim();
  if (!raw) return null;
  const found =
    raw.match(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:\/[^\s]*)?/i)?.[0] ??
    raw.match(/git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?/i)?.[0] ??
    null;
  const parsed = parseRepoInput(found ?? raw);
  if (!parsed) return null;
  return { ...parsed, url: `https://github.com/${parsed.owner}/${parsed.repo}` };
}

/** ¿El mensaje es (casi) solo el enlace, o pide algo más al modelo? */
export function isMostlyRepoLink(text: string): boolean {
  const repo = extractRepoFromText(text);
  if (!repo) return false;
  const leftover = text
    .replace(/https?:\/\/(?:www\.)?github\.com\/\S+/gi, " ")
    .replace(/git@github\.com:\S+/gi, " ")
    .replace(`${repo.owner}/${repo.repo}`, " ")
    .replace(
      /\b(abre|abrir|clona|clonar|analiza|analizar|revisa|revisar|edita|editar|repo|repositorio|este|esta|esto|el|la|un|una|y|o|and|or|por|favor|please|open|clone|analyze|edit|github)\b/gi,
      " "
    )
    .replace(/[\s:,.¡!¿?\-_/]+/g, "");
  return leftover.length === 0;
}

export async function fetchRepoInfo(
  token: string,
  owner: string,
  repo: string
): Promise<CloudRepoInfo> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}`);
  if (!res.ok) await ghError(res, `No se pudo abrir ${owner}/${repo}`);
  const j = (await res.json()) as {
    default_branch?: string;
    private?: boolean;
    html_url?: string;
    permissions?: { push?: boolean };
  };
  return {
    owner,
    repo,
    defaultBranch: j.default_branch || "main",
    isPrivate: !!j.private,
    canPush: !!j.permissions?.push,
    htmlUrl: j.html_url || `https://github.com/${owner}/${repo}`,
  };
}

export interface CloudTree {
  sha: string;
  files: CloudFile[];
  truncated: boolean;
}

/** Árbol recursivo de la rama (solo blobs; sin node_modules ni .git). */
export async function fetchTree(
  token: string,
  owner: string,
  repo: string,
  ref: string
): Promise<CloudTree> {
  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1&per_page=100`
  );
  if (!res.ok) await ghError(res, "No se pudo leer el árbol de archivos");
  const j = (await res.json()) as {
    sha: string;
    truncated?: boolean;
    tree?: { path: string; type: string; size?: number; sha: string }[];
  };
  const SKIP = /^(node_modules|\.git|\.next|dist|build|out|coverage|__pycache__|\.venv|\.cache|\.turbo|\.vercel)\//;
  const files = (j.tree ?? [])
    .filter((t) => t.type === "blob" && !SKIP.test(t.path))
    .map((t) => ({ path: t.path, size: t.size ?? 0, sha: t.sha }));
  if (j.truncated || files.length > 6000) {
    return { sha: j.sha, files: files.slice(0, 6000), truncated: true };
  }
  return { sha: j.sha, files, truncated: false };
}

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".pdf", ".zip", ".gz", ".tgz",
  ".tar", ".rar", ".7z", ".exe", ".dll", ".so", ".dylib", ".woff", ".woff2", ".ttf", ".otf",
  ".eot", ".mp3", ".mp4", ".mov", ".webm", ".avi", ".sqlite", ".db", ".wasm", ".bin",
  ".class", ".jar", ".lockb", ".node", ".pyc",
]);

export function isBinaryPath(path: string): boolean {
  const i = path.lastIndexOf(".");
  if (i < 0) return false;
  return BINARY_EXT.has(path.slice(i).toLowerCase());
}

export interface CloudFileContent {
  content: string;
  sha: string;
  size: number;
}

/** Lee un archivo de texto de la rama (Contents API, base64 → UTF-8). */
export async function readCloudFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<CloudFileContent> {
  if (isBinaryPath(path))
    throw new Error("Archivo binario: no se puede editar como texto.");
  const url = `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await ghFetch(token, url);
  if (!res.ok) await ghError(res, `No se pudo leer ${path}`);
  const j = (await res.json()) as {
    content?: string;
    encoding?: string;
    sha?: string;
    size?: number;
  };
  if (j.encoding !== "base64" || typeof j.content !== "string")
    throw new Error(
      `«${path}» es demasiado grande o no es texto editable (máx. ~900 KB).`
    );
  return {
    content: base64ToUtf8(j.content.replace(/\n/g, "")),
    sha: j.sha ?? "",
    size: j.size ?? 0,
  };
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodePath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export interface CloudChange {
  path: string;
  content: string;
}

export interface CloudCommitResult {
  sha: string;
  url: string;
}

/** Commit ÚNICO con todos los cambios (altas/ediciones/borrados) vía Git Database API. */
export async function commitBatch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  upserts: CloudChange[],
  deletions: string[],
  message: string
): Promise<CloudCommitResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await commitOnce(token, owner, repo, branch, upserts, deletions, message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const conflict = /409|422|fast-forward|no es descendiente|Update is not a fast forward/i.test(msg);
      if (!conflict || attempt === 1) {
        if (conflict)
          throw new Error(
            "El repo cambió mientras editabas. Pulsa «Actualizar» y vuelve a intentarlo."
          );
        throw e;
      }
    }
  }
  throw new Error("No se pudo hacer el commit");
}

async function commitOnce(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  upserts: CloudChange[],
  deletions: string[],
  message: string
): Promise<CloudCommitResult> {
  if (!upserts.length && !deletions.length) throw new Error("No hay cambios que subir");

  // 1) ref → sha del commit actual
  const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!refRes.ok) await ghError(refRes, `No se pudo leer la rama ${branch}`);
  const refJson = (await refRes.json()) as { object?: { sha?: string } };
  const baseSha = refJson.object?.sha ?? "";
  if (!baseSha) throw new Error("No se encontró el commit actual de la rama");

  // 2) commit → árbol base
  const cRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits/${baseSha}`);
  if (!cRes.ok) await ghError(cRes, "No se pudo leer el commit actual");
  const cJson = (await cRes.json()) as { tree?: { sha?: string } };
  const baseTree = cJson.tree?.sha ?? "";
  if (!baseTree) throw new Error("No se encontró el árbol base");

  // 3) blobs nuevos
  const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
  for (const u of upserts) {
    const bRes = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: u.content, encoding: "utf-8" }),
    });
    if (!bRes.ok) await ghError(bRes, `No se pudo crear el blob de ${u.path}`);
    const bJson = (await bRes.json()) as { sha?: string };
    entries.push({ path: u.path, mode: "100644", type: "blob", sha: bJson.sha ?? "" });
  }
  for (const d of deletions) {
    entries.push({ path: d, mode: "100644", type: "blob", sha: null });
  }

  // 4) árbol nuevo
  const tRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTree, tree: entries }),
  });
  if (!tRes.ok) await ghError(tRes, "No se pudo crear el árbol de archivos");
  const tJson = (await tRes.json()) as { sha?: string };
  const newTree = tJson.sha ?? "";
  if (!newTree) throw new Error("El árbol nuevo llegó sin sha");

  // 5) commit
  const ccRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: newTree, parents: [baseSha] }),
  });
  if (!ccRes.ok) await ghError(ccRes, "No se pudo crear el commit");
  const ccJson = (await ccRes.json()) as { sha?: string; html_url?: string };

  // 6) mover la rama
  const pRes = await ghFetch(
    token,
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: ccJson.sha, force: false }),
    }
  );
  if (!pRes.ok) await ghError(pRes, "No se pudo mover la rama");

  return {
    sha: ccJson.sha ?? "",
    url: ccJson.html_url || `https://github.com/${owner}/${repo}/commit/${ccJson.sha ?? ""}`,
  };
}

/** SHA del HEAD de la rama (para la sincronización automática). */
export async function fetchHeadSha(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  try {
    const res = await ghFetch(
      token,
      `/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}?per_page=1`
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { sha?: string };
    return j.sha ?? null;
  } catch {
    return null;
  }
}

/** Habilita GitHub Pages con despliegue por workflow (Pilar 3.2 del plan).
 *
 * Idempotente: si Pages ya está habilitado (409/422 con mensaje «already»),
 * se considera éxito — el objetivo es que el workflow pueda publicar. */
export async function habilitarPages(
  token: string,
  owner: string,
  repo: string
): Promise<{ ok: true; yaEstaba: boolean }> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ build_type: "workflow" }),
  });
  if (res.ok) return { ok: true, yaEstaba: false };
  if (res.status === 409 || res.status === 422) {
    try {
      const j = (await res.json()) as { message?: string };
      if (/already|ya existe/i.test(j?.message ?? "")) return { ok: true, yaEstaba: true };
    } catch {
      /* sin cuerpo */
    }
    // 409 también es «Pages ya configurado con otra fuente»: no lo toca,
    // el workflow ya publicado funcionará si la fuente es Actions.
    return { ok: true, yaEstaba: true };
  }
  await ghError(res, "No se pudo habilitar GitHub Pages");
  return { ok: true, yaEstaba: false }; // ghError siempre lanza; TS lo exige
}

/** Descarga el repo entero como ZIP (una sola petición) y devuelve sus archivos
 * de texto con la ruta ya relativa a la raíz del proyecto.
 *
 * GitHub sirve el zipball con una carpeta raíz «owner-repo-sha/» que aquí se
 * quita: lo que se abre en el Sandbox es el proyecto, no una carpeta con el
 * proyecto dentro. Los binarios se descartan — el Sandbox los tiene en el ZIP,
 * pero esta ruta solo alimenta la revisión y el editor de texto.
 */
export async function fetchRepoZip(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  opts: { maxFiles?: number; maxBytes?: number } = {}
): Promise<{ files: { path: string; content: string }[]; skipped: number }> {
  const maxFiles = opts.maxFiles ?? 1500;
  const maxBytes = opts.maxBytes ?? 40 * 1024 * 1024;

  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`,
    { headers: { Accept: "application/vnd.github+json" }, redirect: "follow" }
  );
  if (!res.ok) await ghError(res, "No se pudo descargar el repositorio");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    throw new Error(
      `El repositorio comprimido ocupa ${Math.round(buf.byteLength / 1048576)} MB: demasiado para abrirlo entero en el Sandbox.`
    );
  }

  const entries = await readZip(buf);
  const files: { path: string; content: string }[] = [];
  let skipped = 0;
  for (const e of entries) {
    // «owner-repo-abc1234/src/x.ts» → «src/x.ts»
    const rel = e.path.slice(e.path.indexOf("/") + 1);
    if (!rel || isJunkPath(rel)) continue;
    if (files.length >= maxFiles) {
      skipped++;
      continue;
    }
    if (!isTextPath(rel) || e.size > 1_500_000) {
      skipped++;
      continue;
    }
    try {
      files.push({ path: rel, content: decodeText(e.data) });
    } catch {
      skipped++;
    }
  }
  return { files, skipped };
}
