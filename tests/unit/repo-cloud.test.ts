import { describe, it, expect, vi, afterEach } from "vitest";
import {
  commitBatch,
  parseRepoInput,
  type CloudFile,
} from "../../src/lib/prism/repo-cloud";
import { fetchTree, readCloudFile } from "../../src/lib/prism/repo-cloud";

const GH = "https://api.github.com";

type Call = { method: string; url: string; body?: Record<string, unknown> };

/** Stub de fetch global que responde según la cola de fixtures y registra llamadas. */
function stubFetch(routes: (url: string, method: string, body: Record<string, unknown> | undefined) => Response | undefined) {
  const calls: Call[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: Record<string, unknown> | undefined;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    calls.push({ method, url, body });
    const res = routes(url, method, body);
    if (res) return res;
    return new Response(JSON.stringify({ message: "no fixture" }), { status: 404 });
  };
  vi.stubGlobal("fetch", vi.fn(impl));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseRepoInput", () => {
  it("acepta URL https, ssh y usuario/repo", () => {
    expect(parseRepoInput("https://github.com/u1/r1")).toEqual({ owner: "u1", repo: "r1" });
    expect(parseRepoInput("https://github.com/u1/r1.git/tree/main")).toEqual({ owner: "u1", repo: "r1" });
    expect(parseRepoInput("git@github.com:u1/r1.git")).toEqual({ owner: "u1", repo: "r1" });
    expect(parseRepoInput("u1/r1")).toEqual({ owner: "u1", repo: "r1" });
  });
  it("rechaza basura", () => {
    expect(parseRepoInput("")).toBeNull();
    expect(parseRepoInput("gitlab.com/a/b")).toBeNull();
    expect(parseRepoInput("https://github.com/")).toBeNull();
  });
});

describe("fetchTree", () => {
  it("devuelve solo blobs y filtra carpetas técnicas", async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({
          sha: "T1",
          tree: [
            { path: "index.html", type: "blob", size: 10, sha: "a1" },
            { path: "node_modules/x/index.js", type: "blob", size: 5, sha: "a2" },
            { path: "src", type: "tree", sha: "a3" },
            { path: "src/app.js", type: "blob", size: 30, sha: "a4" },
          ],
        }),
        { status: 200 }
      )
    );
    const t = await fetchTree("tok", "u", "r", "main");
    expect(t.sha).toBe("T1");
    expect(t.files.map((f) => f.path)).toEqual(["index.html", "src/app.js"]);
    expect(t.truncated).toBe(false);
  });
});

describe("readCloudFile", () => {
  it("decodifica base64 → UTF-8 (acentos incluidos)", async () => {
    const b64 = Buffer.from("<h1>año ñandú</h1>", "utf8").toString("base64");
    stubFetch(
      () => new Response(JSON.stringify({ content: b64, encoding: "base64", sha: "f1", size: 20 }), { status: 200 })
    );
    const f = await readCloudFile("tok", "u", "r", "main", "index.html");
    expect(f.content).toBe("<h1>año ñandú</h1>");
    expect(f.sha).toBe("f1");
  });
  it("rechaza binarios antes de llamar a la API", async () => {
    const calls = stubFetch(() => undefined);
    await expect(readCloudFile("tok", "u", "r", "main", "logo.png")).rejects.toThrow(/binario/i);
    expect(calls).toHaveLength(0);
  });
});

describe("commitBatch", () => {
  function okRoutes(): (url: string, method: string, body?: Record<string, unknown>) => Response | undefined {
    return (url, method, body) => {
      if (url.endsWith("/git/ref/heads/main") && method === "GET")
        return Response.json({ object: { sha: "base1" } });
      if (url.endsWith("/git/commits/base1") && method === "GET")
        return Response.json({ tree: { sha: "tree1" } });
      if (url.endsWith("/git/blobs") && method === "POST")
        return Response.json({ sha: `blob-${(body?.content as string)?.slice(0, 4)}` });
      if (url.endsWith("/git/trees") && method === "POST") return Response.json({ sha: "tree2" });
      if (url === `${GH}/repos/u/r/git/commits` && method === "POST")
        return Response.json({ sha: "new1", html_url: "https://github.com/u/r/commit/new1" });
      if (url.endsWith("/git/refs/heads/main") && method === "PATCH")
        return Response.json({ object: { sha: "new1" } });
      return undefined;
    };
  }

  it("hace ref → commit → blobs → tree(base_tree) → commit → patch en orden", async () => {
    const calls = stubFetch(okRoutes());
    const r = await commitBatch(
      "tok",
      "u",
      "r",
      "main",
      [
        { path: "index.html", content: "nuevo" },
        { path: "src/app.js", content: "otro" },
      ],
      ["borrado.js"],
      "mi mensaje"
    );
    expect(r.sha).toBe("new1");
    expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "POST", "POST", "POST", "POST", "PATCH"]);
    // árbol con base_tree + borrado (sha null)
    const treeCall = calls.find((c) => c.url.endsWith("/git/trees") && c.method === "POST")!;
    expect(treeCall.body!.base_tree).toBe("tree1");
    expect(treeCall.body!.tree).toEqual([
      { path: "index.html", mode: "100644", type: "blob", sha: expect.any(String) },
      { path: "src/app.js", mode: "100644", type: "blob", sha: expect.any(String) },
      { path: "borrado.js", mode: "100644", type: "blob", sha: null },
    ]);
    // commit con padre correcto y mensaje
    const commitCall = calls.find(
      (c) => c.url === `${GH}/repos/u/r/git/commits` && c.method === "POST"
    )!;
    expect(commitCall.body!.message).toBe("mi mensaje");
    expect(commitCall.body!.parents).toEqual(["base1"]);
    expect(commitCall.body!.tree).toBe("tree2");
    // patch mueve la rama
    const patch = calls[calls.length - 1];
    expect(patch.body!.sha).toBe("new1");
    expect(patch.body!.force).toBe(false);
  });

  it("reintenta una vez si la rama cambió (422) y tiene éxito", async () => {
    let patched = false;
    const routes: (url: string, method: string, body?: Record<string, unknown>) => Response | undefined = (
      url,
      method
    ) => {
      if (url.endsWith("/git/refs/heads/main") && method === "PATCH") {
        if (!patched) {
          patched = true;
          return new Response(JSON.stringify({ message: "Update is not a fast forward" }), { status: 422 });
        }
        return Response.json({ object: { sha: "new1" } });
      }
      return okRoutes()(url, method);
    };
    const calls = stubFetch(routes);
    const r = await commitBatch("tok", "u", "r", "main", [{ path: "a.txt", content: "x" }], [], "msg");
    expect(r.sha).toBe("new1");
    expect(patched).toBe(true);
    // ciclo completo × 2 (ref, commit, blob, tree, commit, patch) → al menos 11 llamadas
    expect(calls.length).toBeGreaterThanOrEqual(11);
  });

  it("sin cambios lanza error claro", async () => {
    const calls = stubFetch(okRoutes());
    await expect(commitBatch("tok", "u", "r", "main", [], [], "msg")).rejects.toThrow(/No hay cambios/);
    expect(calls).toHaveLength(0);
  });

  it("token inválido (401) da mensaje útil", async () => {
    stubFetch(() => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }));
    await expect(
      commitBatch("tok", "u", "r", "main", [{ path: "a.txt", content: "x" }], [], "msg")
    ).rejects.toThrow(/no es válido o expiró/);
  });
});

describe("CloudFile tipo", () => {
  it("shape esperada", () => {
    const f: CloudFile = { path: "a", size: 1, sha: "s" };
    expect(f.path).toBe("a");
  });
});
