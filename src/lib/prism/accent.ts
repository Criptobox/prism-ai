/** Prism AI — Temas de acento personalizados.
 * Cada tema cambia las variables --prism-violet / --prism-cyan / --prism-pink
 * y los tokens primarios (--primary, --ring, sidebar) definidos en globals.css
 * mediante el atributo data-accent en <html>. El tema «personalizado» calcula
 * los tres tonos coordinados a partir de un color elegido por el usuario.
 */

export interface AccentPreset {
  id: string;
  name: string;
  hex: string;
}

export const ACCENTS: AccentPreset[] = [
  { id: "violeta", name: "Violeta", hex: "#8b5cf6" },
  { id: "esmeralda", name: "Esmeralda", hex: "#10b981" },
  { id: "ambar", name: "Ámbar", hex: "#f59e0b" },
  { id: "rosa", name: "Rosa", hex: "#ec4899" },
  { id: "cian", name: "Cian", hex: "#06b6d4" },
  { id: "naranja", name: "Naranja", hex: "#f97316" },
];

export const ACCENT_CUSTOM = "personalizado";
export const ACCENT_DEFAULT = "violeta";

export function isPresetAccent(id: string): boolean {
  return ACCENTS.some((a) => a.id === id);
}

// ——— utilidades de color (sin dependencias) ———

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Valida y normaliza un color hex del selector (#rgb o #rrggbb) */
export function normalizeHex(hex: string): string | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let v = m[1];
  if (v.length === 3) v = [...v].map((c) => c + c).join("");
  return `#${v.toLowerCase()}`;
}

/** Genera los tres tonos coordinados (principal + 2 complementarios) desde un hex */
export function customTriad(hex: string): { main: string; second: string; third: string } | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return {
    main: hex,
    second: hslToHex(hsl.h + 38, Math.max(60, hsl.s), Math.min(78, hsl.l + 8)),
    third: hslToHex(hsl.h - 42, Math.min(100, hsl.s + 6), Math.max(58, hsl.l + 2)),
  };
}

const INLINE_VARS = [
  "--prism-violet",
  "--prism-cyan",
  "--prism-pink",
  "--primary",
  "--ring",
  "--sidebar-primary",
  "--sidebar-ring",
] as const;

/** Aplica el tema al documento: preset por data-accent o personalizado por variables inline */
export function applyAccent(accent: string, customHex?: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // limpia variables inline de una aplicación anterior
  for (const v of INLINE_VARS) root.style.removeProperty(v);

  if (accent === ACCENT_CUSTOM) {
    const hex = normalizeHex(customHex ?? "") ?? ACCENTS[0].hex;
    const triad = customTriad(hex);
    root.dataset.accent = ACCENT_CUSTOM;
    if (triad) {
      root.style.setProperty("--prism-violet", triad.main);
      root.style.setProperty("--prism-cyan", triad.second);
      root.style.setProperty("--prism-pink", triad.third);
      root.style.setProperty("--primary", triad.main);
      root.style.setProperty("--ring", triad.main);
      root.style.setProperty("--sidebar-primary", triad.main);
      root.style.setProperty("--sidebar-ring", triad.main);
    }
  } else {
    root.dataset.accent = isPresetAccent(accent) ? accent : ACCENT_DEFAULT;
  }
}
