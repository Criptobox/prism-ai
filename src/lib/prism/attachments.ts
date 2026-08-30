"use client";
/** Prism AI — Procesado de imágenes adjuntas (redimensionado local, sin nube).
 *
 * Desde la v3.14 el binario ya NO se guarda en el store de zustand: vive en
 * IndexedDB (`attachment-blob.ts`) y aquí solo queda la ficha con su `blobId`.
 * El `dataUrl` se devuelve también en el objeto, pero solo para que la UI
 * lo pinte en memoria mientras se está componiendo el mensaje; al persistir
 * en el store se elimina (ver `partialize` en `store.ts`) y se conserva el
 * `blobId` que lo recupera desde IndexedDB cuando haga falta.
 */
import type { Attachment } from "./types";
import { putBlob } from "./attachment-blob";

/** Máximo lado de la imagen tras redimensionar */
const MAX_SIDE = 1152;
/** Por debajo de este peso se conserva la imagen original */
const SMALL_KEEP = 200 * 1024;

function canvasToDataUrl(canvas: HTMLCanvasElement, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("No se pudo procesar la imagen"));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(blob);
      },
      mime,
      0.85
    );
  });
}

/** Escribe el binario a IndexedDB y devuelve el `Attachment` con `blobId`.
 *
 * Si IndexedDB falla (modo privado, cuota llena, navegador viejo), se
 * devuelve el adjunto con `dataUrl` y SIN `blobId`: el store lo conservará
 * tal cual — es el comportamiento anterior a la v3.14, peor pero sin
 * pérdida de datos. */
async function persistBlob(id: string, dataUrl: string): Promise<{ blobId?: string }> {
  const ok = await putBlob(id, dataUrl);
  return ok ? { blobId: id } : {};
}

/** Convierte un File de imagen en un Attachment comprimido */
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`«${file.name}» no es una imagen`);
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error(`«${file.name}» pesa más de 20 MB`);
  }

  const readAsDataUrl = () =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("No se pudo leer la imagen"));
      r.readAsDataURL(file);
    });

  // GIF o imágenes pequeñas: se conservan tal cual
  if (file.type === "image/gif" || file.size < SMALL_KEEP) {
    const dataUrl = await readAsDataUrl();
    const id = Math.random().toString(36).slice(2, 10);
    const blobRef = await persistBlob(id, dataUrl);
    return {
      id,
      name: file.name || "imagen",
      mediaType: file.type,
      dataUrl,
      size: file.size,
      ...blobRef,
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    // PNG con transparencia se mantiene PNG; resto a JPEG
    const keepPng = file.type === "image/png";
    const outMime = keepPng ? "image/png" : "image/jpeg";
    let dataUrl = await canvasToDataUrl(canvas, outMime);
    // si el PNG queda enorme, cae a JPEG
    if (keepPng && dataUrl.length > 3_500_000) {
      dataUrl = await canvasToDataUrl(canvas, "image/jpeg");
    }
    const id = Math.random().toString(36).slice(2, 10);
    const blobRef = await persistBlob(id, dataUrl);
    const mediaType = dataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    return {
      id,
      name: file.name || "imagen",
      mediaType,
      dataUrl,
      size: Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75),
      ...blobRef,
    };
  } catch {
    // fallback: original sin redimensionar
    const dataUrl = await readAsDataUrl();
    const id = Math.random().toString(36).slice(2, 10);
    const blobRef = await persistBlob(id, dataUrl);
    return {
      id,
      name: file.name || "imagen",
      mediaType: file.type,
      dataUrl,
      size: file.size,
      ...blobRef,
    };
  }
}
