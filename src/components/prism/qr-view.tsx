"use client";
/** Prism AI — El QR del traspaso: pintarlo y leerlo.
 *
 * Pintarlo se puede siempre. Leerlo depende del navegador: se usa el lector de
 * códigos que trae el propio sistema (BarcodeDetector), sin librería. Donde no
 * existe —hoy, Safari y Firefox— no se enseña un botón que no va a funcionar:
 * se dice, y queda el camino de pegar el texto, que funciona en todas partes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cabeEnQr, matrizASvg, versionSegura } from "@/lib/prism/qr";

/** Pinta el texto como QR. Devuelve null si no cabe: el aviso lo da el panel. */
export function QrCodigo({ texto, titulo }: { texto: string; titulo: string }) {
  const svg = (() => {
    if (!cabeEnQr(texto)) return null;
    try {
      // 0 = que elija sola la versión más pequeña que sirva; «L» deja el
      // máximo de sitio para datos, que es lo que aquí escasea.
      const qr = qrcode(0, "L");
      qr.addData(texto);
      qr.make();

      // …salvo si le sale la versión 23, que se esquiva (ver qr.ts).
      const forzar = versionSegura(qr.getModuleCount());
      const bueno = forzar ? (() => {
        const q = qrcode(forzar, "L");
        q.addData(texto);
        q.make();
        return q;
      })() : qr;

      return matrizASvg({ lado: bueno.getModuleCount(), oscuro: (f, c) => bueno.isDark(f, c) });
    } catch {
      // Si el codificador se planta, el texto sigue estando ahí abajo.
      return null;
    }
  })();

  if (!svg) return null;
  return (
    <div
      role="img"
      aria-label={titulo}
      className="mx-auto w-full max-w-[240px] rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** ¿Puede este navegador leer un QR con la cámara? */
export function puedeEscanear(): boolean {
  return (
    typeof window !== "undefined" &&
    "BarcodeDetector" in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

interface Detector {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/**
 * Cámara abierta hasta que aparece un QR.
 *
 * La cámara se apaga pase lo que pase: al encontrar el código, al cerrar y al
 * desmontar. Dejar el piloto encendido después de usar algo así es de las
 * cosas que menos perdona la gente.
 */
export function EscanearQr({
  onLeido,
  onCerrar,
}: {
  onLeido: (texto: string) => void;
  onCerrar: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const vivo = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const apagar = useCallback(() => {
    vivo.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    vivo.current = true;
    let detector: Detector | null = null;

    const arrancar = async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector })
          .BarcodeDetector;
        detector = new Ctor({ formats: ["qr_code"] });
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!vivo.current) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play();
        }
        setListo(true);
        buscar();
      } catch (e) {
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "No diste permiso para la cámara. Puedes pegar el texto en su lugar."
            : "No se pudo abrir la cámara. Puedes pegar el texto en su lugar."
        );
      }
    };

    const buscar = () => {
      if (!vivo.current || !detector || !video.current) return;
      detector
        .detect(video.current)
        .then((hits) => {
          if (!vivo.current) return;
          const val = hits[0]?.rawValue;
          if (val) {
            apagar();
            onLeido(val);
            return;
          }
          requestAnimationFrame(buscar);
        })
        .catch(() => {
          // un fotograma ilegible no es un fallo: se sigue mirando
          if (vivo.current) requestAnimationFrame(buscar);
        });
    };

    void arrancar();
    return apagar;
  }, [apagar, onLeido]);

  return (
    <div className="rounded-lg border border-border/60 p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium">Apunta al QR del otro dispositivo</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => {
            apagar();
            onCerrar();
          }}
          aria-label="Cerrar la cámara"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {error ? (
        <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-md bg-black">
          <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
          {!listo && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="size-5 animate-spin text-white/70" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Botón de escanear, solo donde el navegador puede de verdad. */
export function BotonEscanear({ onClick }: { onClick: () => void }) {
  const [puede, setPuede] = useState(false);
  useEffect(() => setPuede(puedeEscanear()), []);
  if (!puede) return null;
  return (
    <Button size="sm" variant="outline" className="h-8 flex-1 gap-1.5 text-xs" onClick={onClick}>
      <Camera className="size-3.5" /> Escanear QR
    </Button>
  );
}
