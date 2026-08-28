import { describe, expect, it } from "vitest";
import {
  addNote,
  buildGraph,
  deriveProjectMap,
  extractRefs,
  fileRelations,
  mergeProjectMap,
  parseMapJson,
  removeNote,
  renderMapForPrompt,
  withHistory,
} from "../../src/lib/prism/project-map";
import type { ProjectMap } from "../../src/lib/prism/types";

const INDEX_HTML = `<!doctype html><html><head><title>Panel CRM</title>
<link rel="stylesheet" href="./styles.css"><script src="js/app.js?v=2"></script></head>
<body><h1>Panel CRM</h1><nav><a href="about.html">Acerca de</a><a href="https://x.com">ext</a></nav>
<h2>Clientes</h2><button id="save">Guardar</button></body></html>`;

const ABOUT_HTML = `<!doctype html><html><head><title>Acerca de</title>
<link rel="stylesheet" href="styles.css"></head><body><h1>Acerca de</h1>
<a href="index.html">Volver</a></body></html>`;

const CSS = "body { background: #0af; } .grid { display: grid; }";
const JS = "const btn = document.querySelector('#save'); btn.addEventListener('click', () => localStorage.setItem('x','1'));";

function twoPages(content: string) {
  return `\`\`\`html\n${content}\n\`\`\`\n\n\`\`\`html\n${ABOUT_HTML}\n\`\`\`\n\n\`\`\`css\n${CSS}\n\`\`\`\n\n\`\`\`javascript\n${JS}\n\`\`\``;
}

describe("project-map — extractRefs (relaciones estilo Obsidian)", () => {
  it("extrae referencias locales y descarta externas/data/hashes", () => {
    const refs = extractRefs(INDEX_HTML);
    expect(refs).toContain("styles.css");
    expect(refs).toContain("app.js"); // ?v=2 se limpia
    expect(refs).toContain("about.html");
    expect(refs.some((r) => r.startsWith("https"))).toBe(false);
  });

  it("normaliza ./ y respeta mayúsculas del nombre", () => {
    const refs = extractRefs('<a href="./guías/Precios.html">x</a>');
    expect(refs).toEqual(["Precios.html"]);
  });
});

describe("project-map — deriveProjectMap", () => {
  it("crea entradas para assets referenciados (css/js) y resuelve links", () => {
    const map = deriveProjectMap(twoPages(INDEX_HTML));
    expect(map).not.toBeNull();
    const names = map!.files.map((f) => f.name);
    expect(names).toContain("Panel CRM");
    expect(names).toContain("Acerca de");
    expect(names).toContain("styles.css");
    expect(names).toContain("app.js");

    const index = map!.files.find((f) => f.name === "Panel CRM")!;
    expect(index.kind).toBe("html");
    expect(index.links).toEqual(expect.arrayContaining(["styles.css", "app.js", "Acerca de"]));
    // features propias de ESTA página
    expect(index.features).toContain("Clientes");
    expect(index.features).toContain("Botón «Guardar»");
    const css = map!.files.find((f) => f.name === "styles.css")!;
    expect(css.kind).toBe("css");
    const js = map!.files.find((f) => f.name === "app.js")!;
    expect(js.kind).toBe("js");
  });

  it("resuelve la convención index.html → portada y enlaza ambas direcciones", () => {
    const map = deriveProjectMap(twoPages(INDEX_HTML))!;
    const about = map.files.find((f) => f.name === "Acerca de")!;
    // el ancla <a href="index.html">Volver</a> apunta a la portada por convención
    expect(about.links).toContain("Panel CRM");
    // y el grafo conecta las dos páginas
    const g = buildGraph(map);
    expect(g.edges).toContainEqual({ source: "Panel CRM", target: "Acerca de", kind: "link" });
  });

  it("adjunta tech por archivo (localStorage en el js)", () => {
    const map = deriveProjectMap(twoPages(INDEX_HTML));
    const js = map!.files.find((f) => f.name === "app.js")!;
    expect(js.tech).toContain("localStorage");
  });

  it("conserva notas e historial previos y devuelve previous sin páginas", () => {
    const prev: ProjectMap = {
      name: "Previo",
      description: "",
      files: [],
      features: [],
      notes: ["el tema es azul"],
      updatedAt: 1,
    };
    expect(deriveProjectMap("hola sin código", prev)).toBe(prev);
    const map = deriveProjectMap(twoPages(INDEX_HTML), prev);
    expect(map!.notes).toEqual(["el tema es azul"]);
  });
});

describe("project-map — parseMapJson y merge", () => {
  it("parsea links/features/tech por archivo y notes", () => {
    const map = parseMapJson(
      JSON.stringify({
        name: "Demo",
        description: "d",
        files: [
          { name: "index.html", kind: "html", summary: "s", links: ["app.js"], features: ["Hero"], tech: ["Canvas"] },
        ],
        features: ["Hero"],
        notes: ["máximo 10 notas"],
      })
    );
    expect(map!.files[0].links).toEqual(["app.js"]);
    expect(map!.files[0].features).toEqual(["Hero"]);
    expect(map!.notes).toEqual(["máximo 10 notas"]);
  });

  it("merge conserva las links derivadas si el modelo no las da", () => {
    const derived = deriveProjectMap(twoPages(INDEX_HTML))!;
    const modelMap = parseMapJson(
      JSON.stringify({ name: "Panel CRM", description: "v2", files: [{ name: "Panel CRM", kind: "html", summary: "s" }], features: [] })
    )!;
    const merged = mergeProjectMap(derived, modelMap);
    const index = merged.files.find((f) => f.name === "Panel CRM")!;
    expect(index.links?.length ?? 0).toBeGreaterThan(0);
  });

  it("merge une notas sin duplicados", () => {
    const a = parseMapJson(JSON.stringify({ name: "x", description: "", files: [], features: [], notes: ["nota 1", "nota 1", "nota 2"] }))!;
    const b = parseMapJson(JSON.stringify({ name: "x", description: "", files: [], features: [], notes: ["nota 3"] }))!;
    expect(mergeProjectMap(a, b).notes).toEqual(["nota 1", "nota 2", "nota 3"]);
  });
});

describe("project-map — notas de memoria", () => {
  const base: ProjectMap = { name: "P", description: "", files: [], features: [], notes: ["a"], updatedAt: 1 };

  it("addNote deduplica y respeta el tope de 10", () => {
    let m = addNote(base, "b");
    expect(m.notes).toEqual(["a", "b"]);
    m = addNote(m, " b ");
    expect(m.notes).toEqual(["a", "b"]);
    for (let i = 0; i < 12; i++) m = addNote(m, `n${i}`);
    expect(m.notes!.length).toBe(10);
  });

  it("removeNote quita por índice", () => {
    const m = removeNote(base, 0);
    expect(m.notes).toEqual([]);
  });
});

describe("project-map — buildGraph", () => {
  const map = deriveProjectMap(twoPages(INDEX_HTML))!;
  map.notes = ["el tema principal es azul"];

  it("crea aristas archivo→archivo, archivo→funcionalidad y archivo→tech", () => {
    const g = buildGraph(map);

    expect(g.edges).toContainEqual({ source: "Panel CRM", target: "styles.css", kind: "link" });
    expect(g.edges).toContainEqual({ source: "Panel CRM", target: "app.js", kind: "link" });
    const featEdge = g.edges.find((e) => e.kind === "feat");
    expect(featEdge).toBeTruthy();
    const techEdge = g.edges.find((e) => e.kind === "tech");
    expect(techEdge).toBeTruthy();

    const types = new Set(g.nodes.map((n) => n.type));
    expect(types.has("file")).toBe(true);
    expect(types.has("feature")).toBe(true);
    expect(types.has("tech")).toBe(true);
    expect(types.has("note")).toBe(true);
  });

  it("las notas son nodos huérfanos (degree 0) y las aristas no se duplican", () => {
    const g = buildGraph(map);
    const note = g.nodes.find((n) => n.type === "note")!;
    expect(note.degree).toBe(0);
    const seen = new Set(g.edges.map((e) => `${e.source}|${e.target}|${e.kind}`));
    expect(seen.size).toBe(g.edges.length);
  });

  it("grafo vacío con mapa nulo", () => {
    expect(buildGraph(null)).toEqual({ nodes: [], edges: [] });
  });
});

describe("project-map — fileRelations (backlinks)", () => {
  it("calcula salientes y entrantes", () => {
    const map = deriveProjectMap(twoPages(INDEX_HTML))!;
    const rel = fileRelations(map, "Panel CRM");
    expect(rel.outgoing).toContain("Acerca de");
    expect(rel.outgoing).toContain("styles.css");
    const back = fileRelations(map, "Acerca de");
    expect(back.incoming).toContain("Panel CRM");
    expect(back.outgoing).toContain("Panel CRM"); // via index.html → portada
    expect(back.outgoing).toContain("styles.css");
  });
});

describe("project-map — withHistory (historial estilo Obsidian)", () => {
  it("no registra instantánea si nada cambió", () => {
    const m = deriveProjectMap(twoPages(INDEX_HTML))!;
    const same = { ...m, updatedAt: m.updatedAt + 1 };
    const out = withHistory(m, same);
    expect(out.history).toBe(m.history);
  });

  it("registra instantánea con etiqueta de diferencias y respeta el tope de 6", () => {
    let m = deriveProjectMap(twoPages(INDEX_HTML))!;
    expect(m.history).toBeUndefined();
    const before = m;
    m = { ...m, files: [...m.files, { name: "extra.html", kind: "html", summary: "nueva" }], features: [...m.features, "Nueva función"] };
    m = withHistory(before, m);
    expect(m.history).toHaveLength(1);
    expect(m.history![0].label).toContain("+1 archivo");
    expect(m.history![0].label).toContain("+1 funcionalidad");
    expect(m.history![0].files).toEqual(before.files);

    // llenar el historial hasta el tope
    let cur = m;
    for (let i = 0; i < 10; i++) {
      const next = { ...cur, files: [...cur.files, { name: `x${i}.html`, kind: "html", summary: "" }] };
      cur = withHistory(cur, next);
    }
    expect(cur.history!.length).toBe(6);
    // la más reciente primero
    expect(cur.history![0].label).toContain("+1 archivo");
  });
});

describe("project-map — renderMapForPrompt enriquecido", () => {
  it("incluye relaciones y notas de memoria", () => {
    const map = deriveProjectMap(twoPages(INDEX_HTML))!;
    map.notes = ["el tema principal es azul"];
    const text = renderMapForPrompt(map)!;
    expect(text).toContain("conecta con:");
    expect(text).toContain("Notas de memoria");
    expect(text).toContain("el tema principal es azul");
    expect(text.length).toBeLessThanOrEqual(1800);
  });

  it("devuelve null sin mapa y recorta el bloque al presupuesto", () => {
    expect(renderMapForPrompt(null)).toBeNull();
    const map = deriveProjectMap(twoPages(INDEX_HTML))!;
    map.files = map.files.map((f) => ({ ...f, summary: "x".repeat(400) }));
    const text = renderMapForPrompt(map)!;
    expect(text.length).toBeLessThanOrEqual(1800);
    expect(text.endsWith("…")).toBe(true);
  });
});
