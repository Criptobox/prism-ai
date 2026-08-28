"use client";
/** Prism AI — Vista del mapa del proyecto: archivos, funcionalidades y memoria compacta */
import { FileCode2, FolderTree, ListChecks, Network, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectMap } from "@/lib/prism/types";

function kindIcon(kind: string) {
  return <FileCode2 className="size-3.5 shrink-0 text-prism-cyan" />;
}

export function ProjectMapView({
  map,
  onClear,
}: {
  map: ProjectMap | null;
  onClear?: () => void;
}) {
  if (!map || (!map.files.length && !map.features.length)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Network className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">Aún no hay mapa del proyecto</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Cuando la IA cree una página o proyecto, aquí aparecerá su estructura:
          archivos, funcionalidades y decisiones. Ese mapa se inyecta en el contexto
          para que la IA revise el proyecto gastando muchos menos tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-md space-y-3">
        {/* Cabecera */}
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 p-3.5">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl prism-gradient-bg text-white">
            <FolderTree className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{map.name}</p>
            {map.description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {map.description}
              </p>
            )}
          </div>
          {onClear && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={onClear}
              title="Borrar mapa de esta conversación"
              aria-label="Borrar mapa"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Archivos */}
        {map.files.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card/40 p-3">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Archivos del proyecto ({map.files.length})
            </p>
            <ul className="space-y-1.5">
              {map.files.map((f) => (
                <li key={f.name} className="flex items-start gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  {kindIcon(f.kind)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11.5px] font-medium">{f.name}</p>
                    {f.summary && (
                      <p className="truncate text-[11px] text-muted-foreground">{f.summary}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-muted-foreground">
                    {f.kind}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Funcionalidades */}
        {map.features.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card/40 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="size-3.5" /> Funcionalidades
            </p>
            <div className="flex flex-wrap gap-1.5">
              {map.features.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="px-1 text-center text-[10.5px] leading-relaxed text-muted-foreground/70">
          Este mapa viaja como contexto compacto en cada mensaje — la IA revisa el
          proyecto sin releer todo el código y ahorra tokens.
        </p>
      </div>
    </div>
  );
}
