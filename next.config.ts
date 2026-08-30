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
  output: "standalone",
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
