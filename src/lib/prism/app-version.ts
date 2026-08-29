/** Prism AI — Versión de la app (debe coincidir con package.json). */
export const APP_VERSION = "3.4.0";
export const APP_REPO = "Criptobox/prism-ai";

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

/** Saca el campo `version` de un package.json (texto crudo o ya parseado). */
export function packageVersion(raw: string | unknown): string | null {
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw) as { version?: unknown };
      return typeof j.version === "string" && j.version.trim() ? j.version.trim() : null;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") {
    const v = (raw as { version?: unknown }).version;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }
  return null;
}
