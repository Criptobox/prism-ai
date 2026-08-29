import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Prism AI — ninguna dependencia que no use nadie.
 *
 * El proyecto arrancó de una plantilla que traía de todo: autenticación,
 * traducciones, tablas, animaciones, un editor de MDX, un SDK de un proveedor
 * concreto. Nada de eso llegó a importarse nunca, pero se instalaba en cada
 * `npm ci` —también en el CI— y engordaba la superficie del proyecto sin dar
 * nada a cambio. Se quitaron 230 paquetes de un tirón.
 *
 * Este test es la puerta para que no vuelvan a colarse: lo que está en
 * `dependencies` o lo importa alguien, o está aquí abajo con su motivo escrito.
 */

/** Lo que no aparece en ningún `import` y aun así hace falta. */
const JUSTIFICADAS: Record<string, string> = {
  "react-dom": "lo usa Next para pintar; nunca se importa a mano",
  sharp: "Next lo llama solo para optimizar imágenes en producción",
};

function archivosDe(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivosDe(p));
    else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

/** «@scope/paquete/sub/ruta» y «paquete/sub» → nombre del paquete. */
function nombrePaquete(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:")) return null;
  const partes = spec.split("/");
  return spec.startsWith("@") ? partes.slice(0, 2).join("/") : partes[0];
}

function importadas(): Set<string> {
  const vistos = new Set<string>();
  // Las cuatro formas de traer un paquete: `from "x"`, el import de solo efecto
  // `import "x"`, el dinámico `import("x")` y `require("x")`. El CSS de
  // highlight.js entra por el segundo y pdf.js por el tercero: quedarse solo
  // con el primero ya nos costó una compilación rota.
  const re = /(?:from\s*|require\(\s*|import\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;
  for (const f of [...archivosDe("src"), ...archivosDe("tests")]) {
    const texto = readFileSync(f, "utf8");
    for (const m of texto.matchAll(re)) {
      const n = nombrePaquete(m[1]);
      if (n) vistos.add(n);
    }
  }
  for (const cfg of ["next.config.ts", "playwright.config.ts", "postcss.config.mjs"]) {
    try {
      for (const m of readFileSync(cfg, "utf8").matchAll(re)) {
        const n = nombrePaquete(m[1]);
        if (n) vistos.add(n);
      }
    } catch {}
  }
  return vistos;
}

describe("dependencias", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>;
  };

  it("todas las de package.json las importa alguien", () => {
    const usadas = importadas();
    const sobran = Object.keys(pkg.dependencies).filter(
      (d) => !usadas.has(d) && !(d in JUSTIFICADAS)
    );
    expect(sobran, "en dependencies pero sin usar").toEqual([]);
  });

  it("las excepciones están explicadas y siguen instaladas", () => {
    for (const [nombre, motivo] of Object.entries(JUSTIFICADAS)) {
      expect(motivo.length, `${nombre} sin motivo escrito`).toBeGreaterThan(20);
      expect(pkg.dependencies, `${nombre} ya no está instalada`).toHaveProperty(nombre);
    }
  });
});
