/** Prism AI — API de repositorios locales (Repo Studio).
 * Abre un repo de GitHub en el workspace local; si aún no está descargado, lo clona.
 * Acciones (POST JSON):
 *  - open  { url, token? }        → comprueba si ya está descargado; si no, clona (git o tarball)
 *  - list  { repoKey }            → lista de archivos editables
 *  - read  { repoKey, path }      → contenido de un archivo (texto)
 *  - write { repoKey, path, content } → guarda cambios en el disco local
 *
 * Los repos viven en <proyecto>/workspace/repos/<owner>---<repo> (carpeta ignorada por git).
 */
import { guardRequest, guardResponse } from "@/lib/prism/api-guard";
import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve as pathResolve, extname, sep } from "node:path";
import { tmpdir } from "node:os";

export const runtime = "nodejs";

const REPOS_DIR = join(process.cwd(), "workspace", "repos");
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage",
  ".turbo", ".vercel", ".cache", ".idea", ".vscode", "__pycache__", ".venv",
]);
const MAX_LIST = 800;
const MAX_READ_BYTES = 400 * 1024;
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tgz",
  ".tar", ".rar", ".7z", ".exe", ".dll", ".so", ".dylib", ".woff", ".woff2",
  ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".mov", ".webm", ".avi", ".sqlite",
  ".db", ".wasm", ".bin", ".class", ".jar", ".lockb", ".node", ".pyc",
]);

function repoKeyOf(owner: string, repo: string): string {
  return `${owner.toLowerCase()}---${repo.toLowerCase()}`;
}

function repoDir(repoKey: string): string {
  return join(REPOS_DIR, repoKey);
}

/** Parsea URLs de GitHub (https, ssh, con .git, con rutas extra) → owner/repo */
function parseGithubUrl(raw: string): { owner: string; repo: string } | null {
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

function dirHasContent(dir: string): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

function hasGit(): boolean {
  const r = spawnSync("git", ["--version"], { encoding: "utf8", timeout: 8000 });
  return !r.error && r.status === 0;
}

function ghHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "prism-ai",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Descarga el tarball oficial de la API de GitHub y lo extrae (fallback sin git) */
async function cloneViaTarball(owner: string, repo: string, target: string, token?: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/tarball`, {
    headers: ghHeaders(token),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    if (res.status === 404)
      throw new Error(`No se encontró el repositorio ${owner}/${repo} (404). Si es privado, añade tu token de GitHub.`);
    if (res.status === 401) throw new Error("El token de GitHub no es válido (401).");
    if (res.status === 403)
      throw new Error("GitHub limitó la petición (403). Espera unos minutos o añade tu token.");
    throw new Error(`GitHub respondió ${res.status} al descargar el archivo del repo.`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error("La descarga del repo llegó vacía.");
  const tmp = join(tmpdir(), `prism-repo-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const tgz = join(tmp, "repo.tar.gz");
  writeFileSync(tgz, buf);
  const extract = spawnSync("tar", ["-xzf", tgz, "-C", tmp], { encoding: "utf8", timeout: 120000 });
  if (extract.error || extract.status !== 0) {
    throw new Error(
      "No se pudo extraer el archivo del repo (se necesita «tar», incluido en Windows 10+, macOS y Linux)."
    );
  }
  const entries = readdirSync(tmp).filter((e) => e !== "repo.tar.gz");
  const src = entries[0];
  if (!src) throw new Error("El archivo del repo estaba vacío.");
  cpSync(join(tmp, src), target, { recursive: true });
  rmSync(tmp, { recursive: true, force: true });
}

function walkFiles(dir: string, base: string, out: { path: string; size: number }[]): void {
  if (out.length >= MAX_LIST) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (out.length >= MAX_LIST) return;
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, base, out);
    } else if (st.isFile()) {
      const rel = full.slice(base.length + 1).split(sep).join("/");
      out.push({ path: rel, size: st.size });
    }
  }
}

function safeJoin(repoKey: string, relPath: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(repoKey)) throw new Error("repoKey no válido");
  if (relPath.includes("..") || relPath.startsWith("/") || relPath.includes("\0")) {
    throw new Error("Ruta de archivo no válida");
  }
  const root = pathResolve(repoDir(repoKey));
  const full = pathResolve(root, relPath);
  if (!full.startsWith(root + sep) && full !== root) throw new Error("Ruta fuera del repositorio");
  return full;
}

export async function POST(req: Request) {
  // Esta ruta clona, lee y ESCRIBE archivos en el disco del servidor. Abierta
  // en un despliegue público deja cualquier repo ya clonado —privados
  // incluidos— a merced de quien adivine el repoKey, que es «owner---repo».
  const guard = guardRequest(req, { touchesDisk: true });
  if (!guard.ok) return guardResponse(guard);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON no válido" }, { status: 400 });
  }
  const action = String(body.action ?? "");

  try {
    if (action === "open") {
      const parsed = parseGithubUrl(String(body.url ?? ""));
      if (!parsed) {
        return NextResponse.json(
          { error: "URL de GitHub no reconocida. Usa https://github.com/usuario/repo o usuario/repo." },
          { status: 400 }
        );
      }
      const { owner, repo } = parsed;
      const repoKey = repoKeyOf(owner, repo);
      const target = repoDir(repoKey);
      mkdirSync(REPOS_DIR, { recursive: true });

      // ¿Ya lo tienes descargado? → abrir sin clonar
      if (dirHasContent(target)) {
        return NextResponse.json({
          status: "exists",
          repoKey,
          owner,
          repo,
          message: "Ya lo tienes descargado: abierto para editar.",
        });
      }

      const token =
        typeof body.token === "string" && body.token.trim() ? body.token.trim() : undefined;
      const cloneUrl = token
        ? `https://${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`
        : `https://github.com/${owner}/${repo}.git`;

      let cloned = false;
      let gitError = "";
      if (hasGit()) {
        const r = spawnSync("git", ["clone", "--depth", "1", "--single-branch", cloneUrl, target], {
          encoding: "utf8",
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024,
        });
        if (r.status === 0) {
          cloned = true;
          // no dejar el token guardado en .git/config
          if (token) {
            spawnSync(
              "git",
              ["remote", "set-url", "origin", `https://github.com/${owner}/${repo}.git`],
              { cwd: target, encoding: "utf8", timeout: 10000 }
            );
          }
        } else {
          gitError = (r.stderr ?? "").trim();
          rmSync(target, { recursive: true, force: true });
        }
      }
      if (!cloned) {
        // fallback oficial: tarball de la API (también cubre equipos sin git)
        try {
          await cloneViaTarball(owner, repo, target, token);
        } catch (tarErr) {
          const tarMsg = tarErr instanceof Error ? tarErr.message : String(tarErr);
          if (/404|privado|no es válido/i.test(tarMsg) || /Authentication|not found/i.test(gitError)) {
            throw new Error(
              `No se pudo obtener ${owner}/${repo}. Si el repo es privado, añade tu token de GitHub (scope repo).`
            );
          }
          throw new Error(tarMsg);
        }
      }
      return NextResponse.json({
        status: "cloned",
        repoKey,
        owner,
        repo,
        message: "Repositorio clonado y listo para editar.",
      });
    }

    if (action === "list") {
      const repoKey = String(body.repoKey ?? "");
      const dir = safeJoin(repoKey, ".");
      if (!dirHasContent(dir)) {
        return NextResponse.json(
          { error: "El repositorio no está descargado. Ábrelo de nuevo." },
          { status: 404 }
        );
      }
      const files: { path: string; size: number }[] = [];
      walkFiles(dir, dir, files);
      files.sort((a, b) => a.path.localeCompare(b.path));
      return NextResponse.json({ files, truncated: files.length >= MAX_LIST });
    }

    // Todo el proyecto de una vez, para abrirlo en el Sandbox y revisarlo entero.
    if (action === "readAll") {
      const repoKey = String(body.repoKey ?? "");
      const dir = safeJoin(repoKey, ".");
      if (!dirHasContent(dir)) {
        return NextResponse.json(
          { error: "El repositorio no está descargado. Ábrelo de nuevo." },
          { status: 404 }
        );
      }
      const list: { path: string; size: number }[] = [];
      walkFiles(dir, dir, list);
      const files: { path: string; content: string }[] = [];
      let skipped = 0;
      for (const f of list) {
        if (BINARY_EXT.has(extname(f.path).toLowerCase()) || f.size > MAX_READ_BYTES) {
          skipped++;
          continue;
        }
        try {
          files.push({ path: f.path, content: readFileSync(safeJoin(repoKey, f.path), "utf8") });
        } catch {
          skipped++;
        }
      }
      return NextResponse.json({ files, skipped, truncated: list.length >= MAX_LIST });
    }

    if (action === "read") {
      const repoKey = String(body.repoKey ?? "");
      const rel = String(body.path ?? "");
      const full = safeJoin(repoKey, rel);
      if (!existsSync(full)) {
        return NextResponse.json({ error: "El archivo no existe" }, { status: 404 });
      }
      const st = statSync(full);
      if (st.isDirectory()) {
        return NextResponse.json({ error: "Es una carpeta, no un archivo" }, { status: 400 });
      }
      if (BINARY_EXT.has(extname(full).toLowerCase())) {
        return NextResponse.json(
          { error: "Archivo binario: no se puede editar como texto" },
          { status: 415 }
        );
      }
      if (st.size > MAX_READ_BYTES) {
        return NextResponse.json(
          {
            error: `Archivo demasiado grande para editar (${Math.round(st.size / 1024)} KB; máx. ${
              MAX_READ_BYTES / 1024
            } KB)`,
          },
          { status: 413 }
        );
      }
      return NextResponse.json({ content: readFileSync(full, "utf8"), size: st.size });
    }

    if (action === "write") {
      const repoKey = String(body.repoKey ?? "");
      const rel = String(body.path ?? "");
      const content = String(body.content ?? "");
      const full = safeJoin(repoKey, rel);
      mkdirSync(full.slice(0, full.lastIndexOf(sep)), { recursive: true });
      writeFileSync(full, content, "utf8");
      return NextResponse.json({ ok: true, size: Buffer.byteLength(content, "utf8") });
    }

    return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado en el servidor de repos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
