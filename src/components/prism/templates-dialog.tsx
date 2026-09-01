"use client";
/** Prism AI — Diálogo de plantillas (U3, PLAN-V7).
 *
 * Catálogo de los ZIPs que viven en `/public` (demos y starters).
 * Un clic descarga el ZIP y se lo pasa al cargador del Sandbox, que
 * ya sabe abrirlos — esta UI solo enseña qué hay antes de bajar nada.
 */
import { useMemo, useState } from "react";
import { Download, FileArchive, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TEMPLATES,
  filterTemplates,
  type TemplateItem,
} from "@/lib/prism/templates";

const CATEGORIES = ["Demos", "Plantillas", "Tutoriales"] as const;

export function TemplatesDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** El usuario eligió una plantilla: chat-app abre el Sandbox con ese ZIP. */
  onPick: (tpl: TemplateItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterTemplates(TEMPLATES, query, category),
    [query, category]
  );

  const load = (tpl: TemplateItem) => {
    setLoadingId(tpl.id);
    try {
      onPick(tpl);
      onOpenChange(false);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="size-4 text-prism-cyan" />
            Plantillas del Sandbox
          </DialogTitle>
          <DialogDescription>
            Una base para empezar ya. Cada plantilla carga un ZIP en el Sandbox; lo que edites después es tuyo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar plantilla…"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <CategoryChip label="Todas" active={category === null} onClick={() => setCategory(null)} />
            {CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                label={c}
                active={category === c}
                onClick={() => setCategory(c)}
              />
            ))}
          </div>

          <div className="max-h-[56vh] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">
                No hay plantillas que coincidan.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filtered.map((tpl) => (
                  <li
                    key={tpl.id}
                    className="lift-card flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/40 p-3"
                    style={{ ["--tpl-accent" as string]: tpl.accent }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xl"
                        style={{
                          background: `color-mix(in oklab, ${tpl.accent} 18%, transparent)`,
                          border: `1px solid color-mix(in oklab, ${tpl.accent} 35%, transparent)`,
                        }}
                        aria-hidden
                      >
                        {tpl.glyph}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[13px] font-semibold">{tpl.title}</h3>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
                          {tpl.description}
                        </p>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground/80">
                      <span className="font-medium text-foreground/80">Aprenderás:</span>{" "}
                      {tpl.teaches}
                    </p>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">
                        {tpl.category} · {tpl.fileCount} archivo{tpl.fileCount === 1 ? "" : "s"}
                      </span>
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={loadingId === tpl.id}
                        onClick={() => load(tpl)}
                      >
                        <Download className="size-3.5" />
                        {loadingId === tpl.id ? "Cargando…" : "Cargar"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
        active
          ? "border-prism-cyan/40 bg-prism-cyan/15 text-prism-cyan"
          : "border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/60"
      )}
    >
      {label}
    </button>
  );
}
