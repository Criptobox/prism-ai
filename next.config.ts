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
