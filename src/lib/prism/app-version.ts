/** Prism AI — Qué copia de la app se está ejecutando.
 *
 * La versión sale de package.json a través de next.config; el literal de aquí
 * es solo el respaldo para las pruebas y para cualquier entorno que no pase la
 * variable. Un test comprueba que los dos coinciden, porque tenerlo escrito a
 * mano en dos sitios ya hizo que divergieran: Ajustes anunció «v3.1» durante
 * cuatro versiones.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_PRISM_VERSION || "3.46.0";
export const APP_REPO = "Criptobox/prism-ai";

/** Commit de esta build (7 caracteres), vacío si no se supo. */
export const APP_COMMIT = process.env.NEXT_PUBLIC_PRISM_COMMIT || "";
/** Momento en que se compiló, en ISO. */
export const APP_BUILT = process.env.NEXT_PUBLIC_PRISM_BUILT || "";

/**
 * Etiqueta corta e inequívoca de la copia en ejecución: «v3.5.0 · a1b2c3d».
 *
 * El commit es lo que de verdad distingue dos despliegues: la versión sola no
 * cambia entre arreglos, y sin él no se puede saber si el navegador está
 * sirviendo la copia nueva o una guardada en caché.
 */
export function buildLabel(
  version = APP_VERSION,
  commit = APP_COMMIT,
  built = APP_BUILT
): string {
  const partes = [`v${version}`];
  if (commit) partes.push(commit);
  if (built) {
    const d = new Date(built);
    if (!Number.isNaN(d.getTime())) partes.push(d.toISOString().slice(0, 10));
  }
  return partes.join(" · ");
}

export type VersionStatus = "ok" | "outdated" | "unknown";

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n.replace(/\D/g, ""), 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n.replace(/\D/g, ""), 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function versionCheck(local: string, latest: string | null): VersionStatus {
  if (!latest) return "unknown";
  return compareSemver(local, latest) >= 0 ? "ok" : "outdated";
}
