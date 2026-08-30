"use client";
/** Prism AI — Ficha del proyecto (Project Passport): la cabecera del mapa
 * convertida en tarjeta informativa de un vistazo: pila, entrada, núcleo,
 * huérfanos y contadores. Se calcula del mapa (passport.ts), nunca inventada.
 */
import { AlertTriangle, DoorOpen, Layers, Share2 } from "lucide-react";
import { buildPassport, passportSumario } from "@/lib/prism/passport";
import type { ProjectMap } from "@/lib/prism/types";
import { cn } from "@/lib/utils";

function Chip({
  icon,
  label,
  tone = "neutral",
  title,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "neutral" | "warn" | "accent";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] leading-none",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "accent" && "border-prism-violet/40 bg-prism-violet/10 text-prism-violet",
        tone === "neutral" && "border-border/60 bg-muted/40 text-muted-foreground"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function ProjectPassportCard({ map }: { map: ProjectMap | null }) {
  const p = buildPassport(map);
  if (!p) return null;

  return (
    <div className="mx-3 mb-3 rounded-xl border border-border/60 bg-gradient-to-br from-prism-violet/[0.05] to-prism-cyan/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5 text-prism-violet" /> Ficha del proyecto
        </p>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">
          {passportSumario(p)}
        </span>
      </div>

      {p.tech.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.tech.map((t) => (
            <Chip
              key={t.name}
              icon={<Layers className="size-3" />}
              label={t.count > 1 ? `${t.name} ×${t.count}` : t.name}
              tone="accent"
              title={`Tecnología detectada en ${t.count} archivo(s)`}
            />
          ))}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {p.entries.map((e) => (
          <Chip
            key={e}
            icon={<DoorOpen className="size-3" />}
            label={`Entrada: ${e}`}
            title="Punto de entrada detectado del proyecto"
          />
        ))}
        {p.hub && (
          <Chip
            icon={<Share2 className="size-3" />}
            label={`Núcleo: ${p.hub}`}
            title="El archivo al que más otros archivos referencian"
          />
        )}
        {p.notesCount > 0 && (
          <Chip
            icon={<span className="text-[10px]">📝</span>}
            label={`${p.notesCount} nota${p.notesCount === 1 ? "" : "s"}`}
            title="Notas de memoria del proyecto"
          />
        )}
        {p.versions > 0 && (
          <Chip
            icon={<span className="text-[10px]">🕓</span>}
            label={`${p.versions} versión${p.versions === 1 ? "" : "es"}`}
            title="Versiones del mapa en el historial"
          />
        )}
        {p.orphans.map((o) => (
          <Chip
            key={o}
            icon={<AlertTriangle className="size-3" />}
            label={`Huérfana: ${o}`}
            tone="warn"
            title="Nadie enlaza a esta página y ella no enlaza a ninguna otra — quizá sobra o falta un enlace"
          />
        ))}
      </div>
    </div>
  );
}
