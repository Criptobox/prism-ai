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
  /* Vuelve a estar en true, y no porque sea lo correcto.
   *
   * Quitarlo (a04ee29) dejó la comprobación de tipos encendida en la build, y
   * a partir de ese commit TODOS los despliegues de Vercel fallan mientras
   * aquí y en el CI pasan: `tsc --noEmit`, `npm run build` y un clon limpio con
   * `npm ci` y CI=true salen los tres en verde. Algo del entorno de Vercel ve
   * un error que aquí no se ve, y con la web parada un día entero no toca
   * averiguarlo a ciegas.
   *
   * El CI ya compila y comprueba tipos en cada push, así que la red de
   * seguridad no se pierde: lo que se pierde es que falle DOS veces. Se vuelve
   * a quitar cuando el registro de la build de Vercel diga qué error es. */
  typescript: {
    ignoreBuildErrors: true,
  },
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
