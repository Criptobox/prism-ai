"use client";
/** Prism AI — Vista de cambios: qué has tocado antes de exportar o subir.
 *
 * Un contador de «3 archivos editados» no dice nada. Esto enseña el diff real,
 * archivo a archivo, con el contexto de siempre y los números de línea de los
 * dos lados.
 */
import { Fragment, useMemo, useState } from "react";
import { ChevronRight, FileMinus2, FilePlus2, FileText } from "lucide-react";
import type { FileDiff } from "@/lib/prism/diff";
import { cn } from "@/lib/utils";

export interface ChangedFile {
  path: string;
  /** contenido original; null si el archivo es nuevo */
  before: string | null;
  /** contenido actual; null si se ha borrado */
  after: string | null;
  diff: FileDiff;
}

function Estado({ before, after }: { before: string | null; after: string | null }) {
  if (before === null)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <FilePlus2 className="size-2.5" /> nuevo
      </span>
    );
  if (after === null)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <FileMinus2 className="size-2.5" /> borrado
      </span>
    );
  return null;
}

function Hunks({ diff }: { diff: FileDiff }) {
  if (diff.tooBig) {
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Archivo demasiado grande para mostrar el detalle línea a línea
        {diff.added || diff.removed ? ` (${diff.added} añadidas, ${diff.removed} quitadas)` : ""}.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[11px] leading-relaxed">
        <tbody>
          {diff.hunks.map((h, hi) => (
            <Fragment key={hi}>
              {hi > 0 && (
                <tr>
                  <td colSpan={3} className="bg-muted/40 px-3 py-0.5 text-[10px] text-muted-foreground">
                    ⋯
                  </td>
                </tr>
              )}
              {h.lines.map((l, li) => (
                <tr
                  key={`${hi}-${li}`}
                  className={cn(
                    l.op === "mas" && "bg-emerald-500/10",
                    l.op === "menos" && "bg-red-500/10"
                  )}
                >
                  <td className="w-10 select-none border-r px-1.5 text-right align-top text-muted-foreground/50 tabular-nums">
                    {l.antes ?? ""}
                  </td>
                  <td className="w-10 select-none border-r px-1.5 text-right align-top text-muted-foreground/50 tabular-nums">
                    {l.despues ?? ""}
                  </td>
                  <td
                    className={cn(
                      "whitespace-pre-wrap break-all px-2",
                      l.op === "mas" && "text-emerald-700 dark:text-emerald-300",
                      l.op === "menos" && "text-red-700 dark:text-red-300"
                    )}
                  >
                    <span className="select-none opacity-50">
                      {l.op === "mas" ? "+" : l.op === "menos" ? "−" : " "}{" "}
                    </span>
                    {l.text || " "}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DiffView({
  changes,
  onOpenFile,
}: {
  changes: ChangedFile[];
  onOpenFile?: (path: string) => void;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(changes.map((c) => c.path)));
  const totales = useMemo(
    () =>
      changes.reduce(
        (acc, c) => ({ added: acc.added + c.diff.added, removed: acc.removed + c.diff.removed }),
        { added: 0, removed: 0 }
      ),
    [changes]
  );

  if (!changes.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <FileText className="size-8 text-muted-foreground/40" />
        <p className="max-w-[280px] text-xs text-muted-foreground">
          No has cambiado nada todavía. Cuando edites, crees o borres archivos, aquí verás
          exactamente qué se va a exportar o subir.
        </p>
      </div>
    );
  }

  const toggle = (p: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="border-b px-3 py-2 text-[11px] text-muted-foreground">
        {changes.length} archivo{changes.length === 1 ? "" : "s"} con cambios ·{" "}
        <span className="text-emerald-600 dark:text-emerald-400">+{totales.added}</span>{" "}
        <span className="text-red-600 dark:text-red-400">−{totales.removed}</span> líneas
      </p>
      <ul className="divide-y">
        {changes.map((c) => {
          const abierto = abiertos.has(c.path);
          return (
            <li key={c.path}>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => toggle(c.path)}
                  aria-expanded={abierto}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent/60"
                >
                  <ChevronRight
                    className={cn("size-3 shrink-0 transition-transform", abierto && "rotate-90")}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{c.path}</span>
                  <Estado before={c.before} after={c.after} />
                  <span className="shrink-0 text-[10px] tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">+{c.diff.added}</span>{" "}
                    <span className="text-red-600 dark:text-red-400">−{c.diff.removed}</span>
                  </span>
                </button>
                {onOpenFile && c.after !== null && (
                  <button
                    type="button"
                    onClick={() => onOpenFile(c.path)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Abrir en el editor"
                  >
                    editar
                  </button>
                )}
              </div>
              {abierto && <Hunks diff={c.diff} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
