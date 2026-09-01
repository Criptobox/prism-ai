"use client";
/** Prism AI — Diálogo de presentación (U6, PLAN-V7).
 *
 * Convierte el HTML de la vista previa en diapositivas (una por
 * `<section>` o por `<h2>`) y las muestra a pantalla completa dentro
 * de un diálogo. Flechas izquierda/derecha, teclado y controles en
 * pantalla. Un QR opcional con el número de diapositiva actual para
 * que un móvil sirva de mando (sin servidor: el QR solo lleva un
 * `?slide=N` que el propio diálogo lee al abrirse).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Play,
  QrCode,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { slidesFromHtml, type Slide } from "@/lib/prism/slides";

export function PresentationDialog({
  open,
  onOpenChange,
  /** HTML de la vista previa (el bundle ya inyectado, sin medidores). */
  html,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  html: string;
}) {
  const slides = useMemo<Slide[]>(() => (open ? slidesFromHtml(html) : []), [open, html]);
  const [current, setCurrent] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // reset al abrir
  useEffect(() => {
    if (open) {
      setCurrent(0);
      setShowQr(false);
    }
  }, [open]);

  const go = useCallback(
    (delta: number) => {
      setCurrent((c) => {
        const next = c + delta;
        if (next < 0) return 0;
        if (next >= slides.length) return slides.length - 1;
        return next;
      });
    },
    [slides.length]
  );

  // teclado: ← → Espacio Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "f" || e.key === "F") {
        setFullscreen((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  // Lee ?slide=N al abrirse (mando por QR): si la URL del diálogo lleva
  // ese parámetro, salta a esa diapositiva. El QR de debajo lo genera.
  useEffect(() => {
    if (!open) return;
    const u = new URL(window.location.href);
    const n = parseInt(u.searchParams.get("slide") ?? "", 10);
    if (!Number.isNaN(n) && n >= 1 && n <= slides.length) {
      setCurrent(n - 1);
    }
  }, [open, slides.length]);

  const slide = slides[current];

  // QR con el número de diapositiva actual: una URL absoluta con ?slide=N.
  // Usamos la API pública de goqr (sin clave) para no arrastrar dependencias;
  // si el usuario no quiere salir, no la pide (botón explícito).
  const qrUrl = useMemo(() => {
    if (!open || !slide) return "";
    const u = new URL(window.location.href);
    u.searchParams.set("slide", String(slide.index));
    return u.toString();
  }, [open, slide]);

  if (!open || !slide) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-full max-h-screen w-full max-w-screen flex-col gap-0 overflow-hidden rounded-none border-none p-0",
          fullscreen && "bg-black"
        )}
        ref={containerRef}
      >
        <DialogTitle className="sr-only">
          Presentación · Diapositiva {slide.index} de {slides.length}: {slide.title}
        </DialogTitle>

        {/* Barra superior */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-black/40 px-3 text-white/80 backdrop-blur">
          <span className="font-mono text-[11px] text-white/60">
            {slide.index} / {slides.length}
          </span>
          <span className="truncate text-[12px] font-medium">{slide.title}</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setShowQr((v) => !v)}
            title="Mando por QR"
          >
            <QrCode className="size-3.5" /> QR
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setFullscreen((f) => !f)}
            title="Pantalla completa (F)"
          >
            {fullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => onOpenChange(false)}
            title="Salir (Esc)"
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Cuerpo: iframe + QR flotante */}
        <div className="relative flex-1 overflow-hidden bg-black">
          <iframe
            key={slide.index}
            title={`Diapositiva ${slide.index}`}
            srcDoc={slide.html}
            className="size-full border-0 bg-white"
            sandbox="allow-scripts allow-popups"
          />
          {showQr && (
            <div className="absolute right-4 top-4 rounded-2xl border border-white/15 bg-black/80 p-3 text-white shadow-xl backdrop-blur">
              <p className="mb-2 text-center text-[10px] uppercase tracking-wider text-white/60">
                Apunta con el móvil
              </p>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                alt="QR del mando"
                className="size-44 rounded-lg bg-white p-2"
                width={180}
                height={180}
              />
              <p className="mt-2 text-center text-[10px] text-white/50">
                Lleva a esta diapositiva
              </p>
            </div>
          )}
        </div>

        {/* Barra inferior de navegación */}
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-white/10 bg-black/40 px-4 text-white/80 backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-white/70 hover:text-white hover:bg-white/10"
            disabled={current === 0}
            onClick={() => go(-1)}
          >
            <ChevronLeft className="size-4" /> Anterior
          </Button>

          {/* Barra de progreso */}
          <div className="flex flex-1 items-center justify-center gap-1 px-4">
            {slides.map((s, i) => (
              <button
                key={s.index}
                onClick={() => setCurrent(i)}
                aria-label={`Ir a la diapositiva ${s.index}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === current ? "w-8 bg-prism-cyan" : "w-1.5 bg-white/25 hover:bg-white/40"
                )}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-white/70 hover:text-white hover:bg-white/10"
            disabled={current >= slides.length - 1}
            onClick={() => go(1)}
          >
            Siguiente <ChevronRight className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Hook de conveniencia: ¿tiene sentido ofrecer «presentar» para este HTML?
 *  Si no hay HTML o no hay diapositivas, no. */
export function canPresent(html: string | null | undefined): boolean {
  if (!html || !html.trim()) return false;
  return slidesFromHtml(html).length > 0;
}

/** Pequeño botón de lanzamiento, para incrustar donde se quiera. */
export function PresentLauncher({
  html,
  onLaunch,
  className,
}: {
  html: string;
  onLaunch: () => void;
  className?: string;
}) {
  if (!canPresent(html)) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-8 shrink-0", className)}
      onClick={onLaunch}
      title="Modo presentación (diapositivas)"
      aria-label="Modo presentación"
    >
      <Play className="size-3.5" />
    </Button>
  );
}
