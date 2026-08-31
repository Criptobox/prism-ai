#!/usr/bin/env node
/** Prism AI — Subir la versión sin que se queden dos números distintos.
 *
 * La versión vive en package.json (next.config la inyecta en la build), pero
 * app-version.ts guarda un respaldo escrito a mano para los tests y para
 * cualquier entorno que no reciba la variable. Tocar solo uno de los dos ya
 * salió mal una vez: Ajustes anunció «v3.1» durante cuatro versiones.
 *
 * Y hay un tercero: package-lock.json lleva la versión por duplicado. Este
 * script no lo tocaba, así que iba quedándose atrás —llegó a 3.15.2 con el
 * package.json en 3.16.0—, que es exactamente el desfase que ya rompió una
 * entrega. Se sincroniza aquí para que no dependa de acordarse.
 *
 *   npm run bump            → 3.5.0 → 3.5.1
 *   npm run bump -- minor   → 3.5.0 → 3.6.0
 *   npm run bump -- major   → 3.5.0 → 4.0.0
 *   npm run bump -- 4.2.0   → exactamente esa
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PKG = new URL("../package.json", import.meta.url);
const SRC = new URL("../src/lib/prism/app-version.ts", import.meta.url);

const arg = process.argv[2] ?? "patch";
const pkg = JSON.parse(readFileSync(PKG, "utf8"));
const [ma, mi, pa] = pkg.version.split(".").map(Number);

const siguiente =
  arg === "major"
    ? `${ma + 1}.0.0`
    : arg === "minor"
      ? `${ma}.${mi + 1}.0`
      : arg === "patch"
        ? `${ma}.${mi}.${pa + 1}`
        : arg;

if (!/^\d+\.\d+\.\d+$/.test(siguiente)) {
  console.error(`No entiendo «${arg}». Usa patch, minor, major o un x.y.z.`);
  process.exit(1);
}

pkg.version = siguiente;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");

const src = readFileSync(SRC, "utf8");
const re = /(NEXT_PUBLIC_PRISM_VERSION \|\| ")[^"]+(")/;
if (!re.test(src)) {
  console.error("No encuentro el respaldo de la versión en app-version.ts");
  process.exit(1);
}
writeFileSync(SRC, src.replace(re, `$1${siguiente}$2`));

// El lockfile guarda la versión en dos sitios; `npm install --package-lock-only`
// los pone al día sin tocar node_modules ni resolver nada de la red.
try {
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--silent"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore",
  });
} catch {
  console.warn("No se pudo sincronizar package-lock.json; hazlo con «npm install --package-lock-only».");
}

console.log(`v${siguiente}`);
