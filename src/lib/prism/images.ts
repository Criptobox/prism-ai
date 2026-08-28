/** Prism AI — Generación de imágenes gratis y sin clave con Pollinations.ai.
 * Endpoint público tipo GET: devuelve la imagen directamente, ideal para
 * <img> y para descargar con fetch. No requiere cuenta ni API key.
 */

export interface ImageOptions {
  width?: number;
  height?: number;
  /** semilla para reproducibilidad; distinta = variación nueva */
  seed?: number;
  model?: string;
}

export const IMAGE_MODELS = [
  { id: "flux", name: "Flux (calidad)" },
  { id: "turbo", name: "Turbo (rápido)" },
] as const;

export function buildImageUrl(prompt: string, opts: ImageOptions = {}): string {
  const width = clamp(opts.width ?? 1024, 256, 1280);
  const height = clamp(opts.height ?? 1024, 256, 1280);
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const model = opts.model ?? "flux";
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model,
    nologo: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?${params}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Precarga la URL como imagen para saber si se generó bien */
export function preloadImage(url: string, timeoutMs = 90_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      reject(new Error("La generación de la imagen tardó demasiado"));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("No se pudo generar la imagen"));
    };
    img.src = url;
  });
}
