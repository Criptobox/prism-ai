"use client";
/** Prism AI — Diálogo de snippets (U2, PLAN-V7).
 *
 * Biblioteca de trozos de texto reutilizables: los que trae la app de
 * fábrica y los que tú guardas. `/snip` abre este diálogo; elegir uno
 * lo inserta en el compositor SIN enviar nada.
 *
 * Modelo copiado de `prompt-library.tsx`: misma columna de búsqueda,
 * misma mecánica de crear/editar/borrar, mismo patrón de «al guardar
 * queda dentro del diálogo para seguir eligiendo».
 */
import { useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import {
  SNIPPET_CATEGORIES,
  filterSnippets,
  useSnippets,
  type Snippet,
} from "@/lib/prism/snippets";

export function SnippetsDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** inserta el snippet en el compositor y cierra */
  onPick: (text: string) => void;
}) {
  const items = useSnippets((s) => s.items);
  const add = useSnippets((s) => s.add);
  const update = useSnippets((s) => s.update);
  const remove = useSnippets((s) => s.remove);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [cat, setCat] = useState<string>(SNIPPET_CATEGORIES[0]);

  const filtered = useMemo(
    () => filterSnippets(items, query, category),
    [items, query, category]
  );

  const resetEditor = () => {
    setTitle("");
    setContent("");
    setShortcut("");
    setCat(SNIPPET_CATEGORIES[0]);
    setEditing(null);
    setCreating(false);
  };

  const save = () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Falta el título o el contenido");
      return;
    }
    if (editing) {
      update(editing.id, { title: title.trim(), content, shortcut: shortcut.trim(), category: cat });
      toast.success("Snippet actualizado");
    } else {
      add({ title: title.trim(), content, shortcut: shortcut.trim(), category: cat });
      toast.success("Snippet guardado");
    }
    resetEditor();
  };

  const startEdit = (s: Snippet) => {
    setEditing(s);
    setCreating(true);
    setTitle(s.title);
    setContent(s.content);
    setShortcut(s.shortcut ?? "");
    setCat(s.category);
  };

  const pick = (s: Snippet) => {
    onPick(s.content);
    onOpenChange(false);
    toast.success(`Insertado: ${s.title}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetEditor(); onOpenChange(v); }}>
      <DialogContent className="max-h-[88vh] overflow-hidden rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-prism-violet" />
            Snippets
          </DialogTitle>
          <DialogDescription>
            Tus trozos reutilizables. Elige uno para insertarlo en el compositor sin enviar nada.
          </DialogDescription>
        </DialogHeader>

        {!creating && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por título, atajo o contenido…"
                  className="h-9 pl-8"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => { resetEditor(); setCreating(true); }}
              >
                <Plus className="size-3.5" /> Nuevo
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <CategoryChip label="Todos" active={category === null} onClick={() => setCategory(null)} />
              {SNIPPET_CATEGORIES.map((c) => (
                <CategoryChip
                  key={c}
                  label={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                />
              ))}
            </div>
            <div className="max-h-[52vh] overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-muted-foreground">
                  No hay snippets que coincidan.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {filtered.map((s) => (
                    <li
                      key={s.id}
                      className="group rounded-xl border border-border/60 bg-card/40 px-3 py-2 transition hover:border-prism-violet/40 hover:bg-prism-violet/[0.05]"
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => pick(s)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold">{s.title}</span>
                            {s.shortcut && (
                              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                /snip {s.shortcut}
                              </code>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[11.5px] text-muted-foreground">
                            {s.content}
                          </p>
                          <span className="mt-1 inline-block rounded-full bg-muted/60 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">
                            {s.category}
                          </span>
                        </button>
                        <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => startEdit(s)}
                            title="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => { remove(s.id); toast.success("Snipped borrado"); }}
                            title="Borrar"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {creating && (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="snip-title">Título</Label>
              <Input
                id="snip-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Cómo se llama este trozo"
                className="mt-1"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="snip-cat">Categoría</Label>
                <select
                  id="snip-cat"
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {SNIPPET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="Personal">Personal</option>
                </select>
              </div>
              <div>
                <Label htmlFor="snip-short">Atajo (opcional)</Label>
                <Input
                  id="snip-short"
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value)}
                  placeholder="ej: fn, doc, test"
                  className="mt-1 font-mono text-[12px]"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="snip-content">Contenido</Label>
              <textarea
                id="snip-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="Lo que se insertará en el compositor…"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={resetEditor}>Cancelar</Button>
              <Button onClick={save}>{editing ? "Guardar cambios" : "Guardar snippet"}</Button>
            </div>
          </div>
        )}
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
          ? "border-prism-violet/40 bg-prism-violet/15 text-prism-violet"
          : "border-border/60 bg-card/40 text-muted-foreground hover:bg-muted/60"
      )}
    >
      {label}
    </button>
  );
}
