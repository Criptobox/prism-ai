"use client";
/** Prism AI — Adjuntos del borrador: imágenes, documentos, hojas de cálculo y ZIP.
 *
 * Segundo corte de `chat-app.tsx` (PLAN-V8 punto 1). La lógica pura del reparto
 * ya vivía en `reparto-adjuntos.ts` desde el primer corte (v3.44.0); lo que se
 * extrae AHORA es la tubería que la rodea: el estado del borrador y el I/O que
 * sí necesita el navegador (leer el ZIP, parsear la hoja, extraer el PDF,
 * comprimir la imagen).
 *
 * `attachFiles` no se puede probar en Node por el I/O; lo que decide (qué es
 * cada archivo y cuántos caben) sí tiene sus tests desde v3.44.0. El corte de
 * hoy no cambia ninguna decisión: solo saca la tubería del componente para que
 * `chat-app.tsx` deje de crecer.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { uid } from "./store";
import type { Attachment, DocText } from "./types";
import {
  clasificar,
  repartir,
  avisoIgnorados,
  TIPOS_ACEPTADOS,
  MAX_DOCUMENTOS,
  MAX_IMAGENES,
} from "./reparto-adjuntos";
import { readZip } from "./zip";
import { isTextPath, decodeText } from "./sandbox";
import { resumenZip, zipATexto } from "./zip-a-texto";
import { readSheetFile } from "./sheets";
import { extractPdfText } from "./pdf";
import { fileToAttachment } from "./attachments";
import { deleteBlob } from "./attachment-blob";

/** Adjuntos del borrador actual: imágenes y documentos pendientes de enviar. */
export function useChatAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [docs, setDocs] = useState<DocText[]>([]);
  const [attaching, setAttaching] = useState(false);

  const attachFiles = useCallback(
    async (files: File[]) => {
      setAttaching(true);
      try {
        // Qué es cada archivo y cuántos caben: en `reparto-adjuntos.ts`, puro
        // y con tests. Aquí queda solo lo que necesita el navegador de verdad.
        const clases = clasificar(files);
        const cupos = repartir(clases, { docs: docs.length, imagenes: attachments.length });

        // lo que no encaja en ningún cajón se dice, en vez de tragárselo
        const aviso = avisoIgnorados(clases.ignorados);
        if (aviso) toast.error(aviso, { description: TIPOS_ACEPTADOS });

        const anadirDoc = (name: string, text: string) =>
          setDocs((cur) =>
            cur.some((d) => d.name === name)
              ? cur
              : [...cur, { id: uid(), name, text, chars: text.length }]
          );

        // ZIP: se abre AQUÍ, con el mismo lector que usa el Sandbox, y se
        // convierte en índice + contenido priorizado. Nada sale del dispositivo.
        for (const f of cupos.zips) {
          try {
            const entradas = await readZip(await f.arrayBuffer());
            if (!entradas.length) throw new Error("El ZIP está vacío");
            const resumen = zipATexto(
              f.name,
              entradas.map((e) => ({
                path: e.path,
                size: e.size,
                text: isTextPath(e.path) ? decodeText(e.data) : null,
              }))
            );
            anadirDoc(f.name, resumen.texto);
            toast.success(`«${f.name}» abierto en tu dispositivo`, {
              description: resumenZip(resumen),
            });
          } catch (e) {
            toast.error(`No se pudo abrir «${f.name}»`, {
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // hojas de cálculo: se parsean EN LOCAL y llegan al modelo como tabla markdown
        for (const f of cupos.hojas) {
          try {
            const { text } = await readSheetFile(f);
            if (!text.trim()) throw new Error("La hoja no tiene datos legibles");
            anadirDoc(f.name, text);
            toast.success(`«${f.name}» leído en tu dispositivo`, {
              description: "Va al modelo como tabla markdown. El archivo no sale de aquí.",
            });
          } catch (e) {
            toast.error(`No se pudo leer «${f.name}»`, {
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // documentos: extrae el texto localmente (pdf.js / texto plano)
        for (const f of cupos.documentos) {
          try {
            const text =
              f.type === "application/pdf"
                ? await extractPdfText(f)
                : (await f.text()).slice(0, 120_000);
            if (!text.trim()) throw new Error("No se pudo extraer texto");
            anadirDoc(f.name, text);
            toast.success(`«${f.name}» listo (${text.length.toLocaleString("es")} caracteres)`);
          } catch (e) {
            toast.error(`No se pudo leer «${f.name}»`, {
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }
        if (cupos.textosFuera > 0) {
          toast.info(`Máximo ${MAX_DOCUMENTOS} documentos u hojas por mensaje`);
        }

        // imágenes: comprime y adjunta
        if (cupos.imagenesFuera > 0) {
          toast.error(`Máximo ${MAX_IMAGENES} imágenes por mensaje`);
        }
        const converted: Attachment[] = [];
        for (const f of cupos.imagenes) {
          try {
            converted.push(await fileToAttachment(f));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo adjuntar la imagen");
          }
        }
        if (converted.length) setAttachments((cur) => [...cur, ...converted]);
      } finally {
        setAttaching(false);
      }
    },
    [attachments.length, docs.length]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((cur) => {
      // Si el adjunto todavía no se ha enviado, su binario ya está escrito en
      // IndexedDB (lo hizo `fileToAttachment` al crearlo). Aquí lo borramos
      // para no dejar un huérfano ocupando espacio. Fire-and-forget: si IDB
      // falla, no es crítico — el usuario puede purgar con «Borrar todos».
      const removed = cur.find((a) => a.id === id);
      if (removed?.blobId) void deleteBlob(removed.blobId);
      return cur.filter((a) => a.id !== id);
    });
  }, []);

  const removeDoc = useCallback((id: string) => {
    setDocs((cur) => cur.filter((d) => d.id !== id));
  }, []);

  /** Limpiar el borrador completo: lo llama `send()` cuando el mensaje ya viajó. */
  const clearDraft = useCallback(() => {
    setAttachments([]);
    setDocs([]);
  }, []);

  return {
    attachments,
    setAttachments,
    docs,
    setDocs,
    attaching,
    attachFiles,
    removeAttachment,
    removeDoc,
    clearDraft,
  };
}
