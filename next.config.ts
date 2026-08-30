import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import pkg from "./package.json" with { type: "json" };

/** Commit del que salió esta build. En Vercel lo da la plataforma; en local se
 *  pregunta a git. Si no hay ninguno, se queda vacío y no se enseña nada. */
function commit(): string {
  const deVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (deVercel) return deVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  /* «standalone» sirve para levantar el servidor por tu cuenta (npm start), y
   * es lo que se usa aquí para probar la build de verdad antes de subirla.
   *
   * En Vercel NO: allí el propio constructor hace su rastreo de archivos, y
   * los dos a la vez chocan. El síntoma exacto, del registro de Vercel:
   *
   *   Running onBuildComplete from Vercel
   *   Error: ENOENT: no such file or directory,
   *     path: '/vercel/path0/.next/next-server.js.nft.json'
   *
   * Compila entero, genera las 11 páginas, y revienta al final buscando un
   * archivo de rastreo que el modo standalone no deja donde Vercel lo espera.
   * Empezó al subir Next a 16.3.3; con 16.1.1 pasaba desapercibido.
   *
   * Vercel define VERCEL=1 en sus builds, así que ahí se apaga y en cualquier
   * otro sitio se queda como estaba. */
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  /* La comprobación de tipos vuelve a estar encendida.
   *
   * Apagarla no era el problema: el registro de Vercel lo dejó por escrito —
   * decía «Skipping validation of types» y aun así fallaba. Lo que faltaba era
   * @types/node, que hasta a04ee29 llegaba de rebote porque bun-types lo pedía.
   * Al quitar bun-types (que no usaba nadie) se fue con él, quedó en el
   * lockfile sin que nadie lo reclamara —por eso `npm ci` aquí lo instalaba
   * igual y no había forma de reproducir el fallo— y el instalador de Vercel,
   * que sí limpia lo que sobra, lo descartó.
   *
   * Ahora está declarado en devDependencies, que es donde tenía que estar. */
  reactStrictMode: false,
  devIndicators: false,
  /* Datos de la build, para saber QUÉ copia se está usando. Sin esto no había
   * forma de distinguir un despliegue nuevo de uno servido desde la caché. */
  env: {
    NEXT_PUBLIC_PRISM_VERSION: pkg.version,
    NEXT_PUBLIC_PRISM_COMMIT: commit(),
    NEXT_PUBLIC_PRISM_BUILT: new Date().toISOString(),
  },
};

export default nextConfig;
