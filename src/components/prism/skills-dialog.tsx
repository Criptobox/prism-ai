"use client";
/** Prism AI — Skills: packs de instrucciones que mejoran el comportamiento del modelo */
import { useState } from "react";
import { Plus, Puzzle, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePrism } from "@/lib/prism/store";

export function SkillsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const skills = usePrism((s) => s.skills);
  const toggleSkill = usePrism((s) => s.toggleSkill);
  const removeSkill = usePrism((s) => s.removeSkill);
  const addSkill = usePrism((s) => s.addSkill);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const activeCount = skills.filter((s) => s.enabled).length;

  const install = () => {
    if (!name.trim() || !instructions.trim()) {
      toast.error("La skill necesita nombre e instrucciones");
      return;
    }
    addSkill({
      name: name.trim(),
      description: description.trim() || "Skill personalizada",
      icon: "⚡",
      instructions: instructions.trim(),
    });
    setName("");
    setDescription("");
    setInstructions("");
    setCreating(false);
    toast.success("Skill instalada — actívala para usarla");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:h-[600px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Puzzle className="size-4 text-prism-violet" /> Skills
            <span className="rounded-full bg-prism-violet/10 px-2 py-0.5 text-[10px] font-medium text-prism-violet">
              {activeCount} activas
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Las skills activas se añaden a las instrucciones del modelo en todas tus conversaciones.
            Combínalas como quieras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 border-b px-4 py-3">
          <Button size="sm" variant="outline" className="h-9 w-full gap-1.5 text-xs" onClick={() => setCreating((v) => !v)}>
            <Plus className="size-3.5" /> Instalar skill personalizada
          </Button>
          {creating && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Chef de cocina" className="h-8 text-xs" />
              <Label className="text-xs">Descripción corta</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué hace esta skill" className="h-8 text-xs" />
              <Label className="text-xs">Instrucciones para el modelo</Label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                placeholder="Ej. Eres un chef experto. Cuando te den ingredientes, propón recetas paso a paso con tiempos y cantidades…"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-prism-violet/50"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={install}>
                  <Wand2 className="mr-1 size-3.5" /> Instalar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Lista de skills */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-2">
            {skills.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3.5 py-3 transition",
                  s.enabled ? "border-prism-violet/40 bg-prism-violet/[0.04]" : "border-border/60 bg-card/50"
                )}
              >
                <span className="mt-0.5 text-lg leading-none">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium">
                    {s.name}
                    {s.builtin && (
                      <span className="rounded-full bg-secondary px-1.5 py-px text-[9.5px] text-muted-foreground">
                        integrada
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{s.description}</p>
                </div>
                {!s.builtin && (
                  <button
                    onClick={() => removeSkill(s.id)}
                    aria-label={`Desinstalar ${s.name}`}
                    className="rounded p-1 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
                <Switch checked={s.enabled} onCheckedChange={() => toggleSkill(s.id)} aria-label={`Activar ${s.name}`} />
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
