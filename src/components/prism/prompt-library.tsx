"use client";
/** Prism AI — Biblioteca de prompts: guarda, busca y reutiliza tus prompts */
import { useMemo, useState } from "react";
import { BookOpen, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PROMPT_CATEGORIES } from "@/lib/prism/prompts-data";
import { usePrism } from "@/lib/prism/store";

export function PromptLibrary({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** inserta el prompt en el cuadro de mensaje */
  onPick: (text: string) => void;
}) {
  const prompts = usePrism((s) => s.prompts);
  const addPrompt = usePrism((s) => s.addPrompt);
  const deletePrompt = usePrism((s) => s.deletePrompt);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prompts.filter(
      (p) =>
        (!category || p.category === category) &&
        (!q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
    );
  }, [prompts, query, category]);

  const save = () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Faltan el título o el contenido");
      return;
    }
    addPrompt({ title: title.trim(), content: content.trim(), category: category ?? "Personal" });
    setTitle("");
    setContent("");
    setCreating(false);
    toast.success("Prompt guardado en tu biblioteca");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:h-[600px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-prism-cyan" /> Biblioteca de prompts
          </DialogTitle>
          <DialogDescription className="text-xs">
            Toca un prompt para insertarlo en el mensaje. Todo se guarda en tu dispositivo.
          </DialogDescription>
        </DialogHeader>

        {/* Buscador + categorías */}
        <div className="space-y-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-2.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar prompts…"
                className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Limpiar">
                  <X className="size-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button size="sm" className="h-9 shrink-0 gap-1.5 px-3 text-xs" onClick={() => setCreating((v) => !v)}>
              <Plus className="size-3.5" /> Nuevo
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategory(null)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition",
                category === null
                  ? "border-prism-violet/50 bg-prism-violet/10 text-prism-violet"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              Todas
            </button>
            {[...PROMPT_CATEGORIES, "Personal"].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(category === c ? null : c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition",
                  category === c
                    ? "border-prism-violet/50 bg-prism-violet/10 text-prism-violet"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Formulario de creación */}
        {creating && (
          <div className="space-y-2 border-b bg-muted/30 px-4 py-3">
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Mi prompt de informes" className="h-8 text-xs" />
            <Label className="text-xs">Prompt</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Escribe el prompt completo…"
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-prism-violet/50"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={save}>
                Guardar prompt
              </Button>
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {query ? "Sin resultados" : "Aún no hay prompts en esta categoría"}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((p) => (
                <li
                  key={p.id}
                  className="group flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/50 bg-card/50 px-3 py-2.5 transition hover:border-prism-violet/40 hover:bg-card"
                  onClick={() => {
                    onPick(p.content);
                    onOpenChange(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      {p.title}
                      <span className="rounded-full bg-secondary px-1.5 py-px text-[9.5px] text-muted-foreground">
                        {p.category}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      {p.content}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePrompt(p.id);
                    }}
                    aria-label={`Eliminar ${p.title}`}
                    className="rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
