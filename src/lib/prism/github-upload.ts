/** Prism AI — Subida directa a GitHub con la Git Data API.
 * Permite subir carpetas completas (más de 100 archivos) en lotes:
 *  - blobs base64 solo para binarios; el texto va embebido en el tree (menos peticiones)
 *  - 1 commit por lote (≈60 archivos o ≈12 MB) sobre la rama main
 *  - crea el repo si no existe (auto_init con README)
 * El token se guarda SOLO en localStorage de tu dispositivo. */
import { isTextPath } from "./sandbox";
import type { ReviewFile } from "./sandbox-review";

export type GhItem = { path: string; file: File };
export type GhProgress = {
  done: number;
  total: number;
  batch: number;
  batches: number;
  message: string;
};

const GH_API = "https://api.github.com";
const TOKEN_KEY = "prism-github-token";
const SINGLE_LIMIT = 95 * 1024 * 1024; // GitHub rechaza blobs >100MB; margen propio
const MAX_FILES_PER_BATCH = 60;
const MAX_BYTES_PER_BATCH = 12 * 1024 * 1024;

// ——— token local ———
export function ghGetToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
export function ghSetToken(t: string): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

// ——— reglas de ignorado (como un .gitignore básico) ———
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "out",
  "coverage",
  ".cache",
  ".idea",
  ".vscode",
]);
const IGNORE_FILE_RE = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|.*\.log|.*\.zip|.*\.tar|.*\.gz)$/i;
/** .env y sus variantes quedan excluidos por seguridad. Las plantillas sin
 * valores (.env.example, .env.sample, .env.template) SÍ se suben: son
 * justamente lo que hay que publicar para que otros sepan qué variables hacen
 * falta. */
const IGNORE_ENV_RE = /(^|\/)\.env(?!\.example$|\.sample$|\.template$)(\..+)?$/i;

export function shouldIgnore(relPath: string): boolean {
  const parts = relPath.split("/");
  if (parts.some((p) => IGNORE_DIRS.has(p))) return true;
  if (IGNORE_FILE_RE.test(relPath)) return true;
  if (IGNORE_ENV_RE.test(relPath)) return true;
  return false;
}

/** Ruta relativa desde un File de un input con webkitdirectory (quita el nombre de la carpeta raíz) */
export function relPathFrom(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const parts = rel.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : rel;
}

/** Prepara la lista: rutas limpias, ignorados aparte, archivos demasiado grandes aparte */
export function prepareFiles(files: File[]): {
  keep: GhItem[];
  ignored: number;
  tooBig: File[];
} {
  const keep: GhItem[] = [];
  let ignored = 0;
  const tooBig: File[] = [];
  for (const f of files) {
    const rel = relPathFrom(f);
    if (!rel || shouldIgnore(rel)) {
      ignored++;
      continue;
    }
    if (f.size > SINGLE_LIMIT) {
      tooBig.push(f);
      continue;
    }
    keep.push({ path: rel, file: f });
  }
  return { keep, ignored, tooBig };
}

/** Máximo que se lee para revisar: por encima de esto el archivo va como binario. */
const REVIEW_TEXT_LIMIT = 1_500_000;

/** Convierte lo que se va a subir en la entrada de la revisión previa.
 * Los archivos de texto se leen enteros (hasta el límite) para poder buscar
 * credenciales dentro; del resto solo se mira la ruta y el tamaño. */
export async function toReviewFiles(items: GhItem[]): Promise<ReviewFile[]> {
  return Promise.all(
    items.map(async (it) => {
      const readable = isTextPath(it.path) && it.file.size <= REVIEW_TEXT_LIMIT;
      let text: string | null = null;
      if (readable) {
        try {
          text = await it.file.text();
        } catch {
          text = null;
        }
      }
      return { path: it.path, text, size: it.file.size };
    })
  );
}

/** Divide en lotes por número de archivos y peso total */
export function chunkFiles(
  items: GhItem[],
  maxFiles = MAX_FILES_PER_BATCH,
  maxBytes = MAX_BYTES_PER_BATCH
): GhItem[][] {
  const batches: GhItem[][] = [];
  let cur: GhItem[] = [];
  let curBytes = 0;
  for (const it of items) {
    const size = it.file.size;
    if (cur.length > 0 && (cur.length >= maxFiles || curBytes + size > maxBytes)) {
      batches.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(it);
    curBytes += size;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

// ——— helpers HTTP ———
async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path.startsWith("http") ? path : GH_API + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  return res;
}

async function ghJsonError(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try {
    const j = (await res.json()) as { message?: string };
    if (j?.message) msg = j.message;
  } catch {
    /* sin cuerpo JSON */
  }
  if (res.status === 401) msg += " — el token no es válido o expiró";
  if (res.status === 403 && /rate limit/i.test(msg)) msg += " — espera unos minutos e inténtalo de nuevo";
  throw new Error(`GitHub ${res.status}: ${msg}`);
}

function isProbablyText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  let suspicious = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 7 || (b > 13 && b < 32)) suspicious++;
  }
  if (suspicious > n * 0.02) return false;
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, n));
    return !s.includes("\uFFFD");
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

/** Token clásico pre-rellenado con scope repo (para crear y subir) */
export const GH_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=Prism%20AI";

// ——— flujo de subida ———

export async function ghWhoAmI(token: string): Promise<string> {
  const res = await ghFetch(token, "/user");
  if (!res.ok) await ghJsonError(res, "No se pudo leer tu usuario");
  const j = (await res.json()) as { login?: string };
  return j.login ?? "";
}

/** Crea el repo (con README) o devuelve el existente si ya estaba */
export async function ghEnsureRepo(
  token: string,
  name: string,
  isPrivate: boolean
): Promise<{ owner: string; repo: string; url: string; created: boolean }> {
  const login = await ghWhoAmI(token);
  const res = await ghFetch(token, "/user/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      private: isPrivate,
      auto_init: true,
      description: "Prism AI — mi chat con modelos gratis (subido desde la app)",
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    }),
  });
  if (res.ok) {
    const j = (await res.json()) as { full_name?: string; html_url?: string; owner?: { login?: string } };
    return {
      owner: j.owner?.login ?? login,
      repo: name,
      url: j.html_url ?? `https://github.com/${login}/${name}`,
      created: true,
    };
  }
  if (res.status === 422) {
    // ya existe
    return { owner: login, repo: name, url: `https://github.com/${login}/${name}`, created: false };
  }
  return await ghJsonError(res, "No se pudo crear el repositorio");
}

type Head = { sha: string; treeSha: string } | null;

async function ghGetHead(token: string, owner: string, repo: string): Promise<Head> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/main`);
  if (!res.ok) return null;
  const j = (await res.json()) as { object?: { sha?: string } };
  const sha = j.object?.sha;
  if (!sha) return null;
  const cRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits/${sha}`);
  if (!cRes.ok) return { sha, treeSha: "" };
  const c = (await cRes.json()) as { tree?: { sha?: string } };
  return { sha, treeSha: c.tree?.sha ?? "" };
}

type TreeEntry =
  | { path: string; mode: "100644"; type: "blob"; content: string }
  | { path: string; mode: "100644"; type: "blob"; sha: string };

async function ghCommitBatch(
  token: string,
  owner: string,
  repo: string,
  batch: GhItem[],
  head: Head,
  message: string
): Promise<{ sha: string; treeSha: string }> {
  // 1) blobs base64 solo para binarios con extensión conocida (en paralelo moderado)
  const entries: TreeEntry[] = [];
  const binaryItems = batch.filter((it) => it.file.size < 512 * 1024 && it.path.match(/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|mp3|mp4|webm|zip)$/i));
  const blobShas = new Map<string, string>();

  const queue = [...binaryItems];
  const workers = Array.from({ length: Math.min(6, queue.length || 1) }, async () => {
    for (;;) {
      const it = queue.shift();
      if (!it) break;
      const bytes = new Uint8Array(await it.file.arrayBuffer());
      const res = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: toBase64(bytes), encoding: "base64" }),
      });
      if (!res.ok) await ghJsonError(res, `No se pudo subir el blob ${it.path}`);
      const j = (await res.json()) as { sha?: string };
      if (j.sha) blobShas.set(it.path, j.sha);
    }
  });
  await Promise.all(workers);

  // 2) árbol: texto embebido, binarios por sha
  const seenBinary = new Set(binaryItems.map((it) => it.path));
  for (const it of batch) {
    if (seenBinary.has(it.path)) {
      entries.push({ path: it.path, mode: "100644", type: "blob", sha: blobShas.get(it.path) ?? "" });
    } else {
      const bytes = new Uint8Array(await it.file.arrayBuffer());
      // binarios sin extensión conocida → también via blob para no corromperlos
      if (!isProbablyText(bytes)) {
        const res = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: toBase64(bytes), encoding: "base64" }),
        });
        if (!res.ok) await ghJsonError(res, `No se pudo subir el blob ${it.path}`);
        const j = (await res.json()) as { sha?: string };
        entries.push({ path: it.path, mode: "100644", type: "blob", sha: j.sha ?? "" });
      } else {
        entries.push({ path: it.path, mode: "100644", type: "blob", content: new TextDecoder().decode(bytes) });
      }
    }
  }

  // 3) tree → 4) commit → 5) mover la rama
  const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(head?.treeSha ? { base_tree: head.treeSha, tree: entries } : { tree: entries }),
  });
  if (!treeRes.ok) await ghJsonError(treeRes, "No se pudo crear el árbol de archivos");
  const tree = (await treeRes.json()) as { sha?: string };

  const commitRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: tree.sha, parents: head ? [head.sha] : [] }),
  });
  if (!commitRes.ok) await ghJsonError(commitRes, "No se pudo crear el commit");
  const commit = (await commitRes.json()) as { sha?: string; tree?: { sha?: string } };

  if (head) {
    const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/main`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    if (!refRes.ok) await ghJsonError(refRes, "No se pudo actualizar la rama main");
  } else {
    const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "refs/heads/main", sha: commit.sha }),
    });
    if (!refRes.ok && refRes.status !== 422) {
      await ghJsonError(refRes, "No se pudo crear la rama main");
    }
  }
  return { sha: commit.sha ?? "", treeSha: commit.tree?.sha ?? tree.sha ?? "" };
}

/** Sube todos los archivos en lotes. Devuelve la URL del repo. */
export async function uploadToGithub(
  token: string,
  opts: {
    repoName: string;
    isPrivate: boolean;
    items: GhItem[];
    onProgress?: (p: GhProgress) => void;
  }
): Promise<{ url: string; commits: number }> {
  const { repoName, isPrivate, items, onProgress } = opts;
  if (!items.length) throw new Error("No hay archivos para subir");

  const repo = await ghEnsureRepo(token, repoName, isPrivate);
  let head = await ghGetHead(token, repo.owner, repo.repo);
  const batches = chunkFiles(items);
  let done = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    onProgress?.({
      done,
      total: items.length,
      batch: i + 1,
      batches: batches.length,
      message: `Subiendo lote ${i + 1} de ${batches.length} · ${batch.length} archivos…`,
    });
    const message =
      i === 0
        ? `Prism AI: subida inicial (${items.length} archivos)`
        : `Prism AI: lote ${i + 1}/${batches.length}`;
    const newHead = await ghCommitBatch(token, repo.owner, repo.repo, batch, head, message);
    head = { sha: newHead.sha, treeSha: newHead.treeSha };
    done += batch.length;
  }
  onProgress?.({ done, total: items.length, batch: batches.length, batches: batches.length, message: "¡Completado!" });
  return { url: repo.url, commits: batches.length };
}
