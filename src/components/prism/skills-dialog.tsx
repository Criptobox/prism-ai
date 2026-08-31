"use client";
/** Prism AI — Skills: packs de instrucciones, creación manual o instalación desde URL.
 *
 * Con permisos (skill-permissions.ts): ANTES de instalar se analiza el texto y
 * se muestran las capacidades que declara — cargar recursos de internet, pedir
 * claves, enviar datos. Las de RIESGO no se instalan sin una aceptación
 * explícita de dos pasos. El permiso persiste en la skill y se ve en la lista:
 * no es una etiqueta informativa que desaparece.
 *
 * El catálogo (v3.27) no es un camino nuevo: baja la entrada elegida por el
 * MISMO flujo de la URL, así que la puerta de permisos sigue en medio. Es lo
 * que permite que un catálogo abierto no sea un agujero.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Plus,
  Puzzle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
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
import {
  analyzeSkillPermissions,
  permisosLegibles,
  type SkillPermissionInfo,
} from "@/lib/prism/skill-permissions";
import { costeDeSkill } from "@/lib/prism/prompt-actual";
import {
  buscarEnCatalogo,
  parseCatalogo,
  yaInstalada,
  URL_CATALOGO,
  type EntradaCatalogo,
} from "@/lib/prism/catalogo-skills";

/** Panel de permisos: lo que la skill declara que va a hacer */
function PermisosBox({ p, compacte }: { p: SkillPermissionInfo; compacte?: boolean }) {
  if (p.nivel === "ok" && compacte) return null;
  return (
    <div
      className={cn(
        "rounded-lg border p-2",
        p.nivel === "riesgo"
          ? "border-red-500/40 bg-red-500/[0.06]"
          : p.nivel === "aviso"
            ? "border-amber-500/40 bg-amber-500/[0.06]"
            : "border-emerald-500/30 bg-emerald-500/[0.05]"
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold",
          p.nivel === "riesgo"
            ? "text-red-600 dark:text-red-400"
            : p.nivel === "aviso"
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {p.nivel === "ok" ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
        {p.nivel === "riesgo" ? "Permiso de riesgo" : p.nivel === "aviso" ? "Con avisos" : "Sin permisos sensibles"}
      </p>
      <ul className="mt-1 space-y-0.5">
        {permisosLegibles(p).map((t) => (
          <li key={t} className="text-[11px] leading-snug text-foreground/80">
            · {t}
          </li>
        ))}
      </ul>
      {p.motivos.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {p.motivos.map((m) => (
            <li key={m} className="text-[10.5px] leading-snug text-muted-foreground">
              ↳ {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const [urlMode, setUrlMode] = useState(false);
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
  const [catalogo, setCatalogo] = useState<EntradaCatalogo[] | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [skillUrl, setSkillUrl] = useState("");
  const [fetching, setFetching] = useState(false);

  /** Permisos en vivo mientras escribes la skill manual */
  const permisosManual = useMemo(
    () => (instructions.trim().length > 20 ? analyzeSkillPermissions(instructions) : null),
    [instructions]
  );
  /** Instalación pendiente desde URL: se muestran permisos ANTES de instalar */
  const [pendiente, setPendiente] = useState<{
    name: string;
    description: string;
    instructions: string;
    icon: string;
    permisos: SkillPermissionInfo;
  } | null>(null);
  /** Aceptación explícita del riesgo (dos pasos, se resetea al cambiar de skill) */
  const [riesgoOk, setRiesgoOk] = useState(false);

  const activeCount = skills.filter((s) => s.enabled).length;
  /** Lo que suman las activas en cada mensaje. El desglose completo del prompt
   *  está en Ajustes → Chat; aquí se enseña la parte que se decide en esta
   *  pantalla, que es donde sirve para decidir. */
  const costeActivas = useMemo(
    () =>
      skills
        .filter((s) => s.enabled)
        .reduce((a, s) => a + costeDeSkill(s.name, s.instructions), 0),
    [skills]
  );

  /** Permisos de cada skill de la lista: los guardados o el análisis del texto */
  const permisosPorSkill = useMemo(() => {
    const m = new Map<string, SkillPermissionInfo>();
    for (const s of skills) {
      m.set(s.id, s.permissions ?? analyzeSkillPermissions(s.instructions));
    }
    return m;
  }, [skills]);

  const cerrarFormularios = () => {
    setCreating(false);
    setUrlMode(false);
    setPendiente(null);
    setRiesgoOk(false);
    setName("");
    setDescription("");
    setInstructions("");
    setSkillUrl("");
  };

  /** El índice se pide la primera vez que abres el catálogo, no al abrir el
   *  diálogo: quien no lo use no paga la petición. */
  useEffect(() => {
    if (!catalogoAbierto || catalogo || catalogoError) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(URL_CATALOGO);
        if (!res.ok) throw new Error(`El índice respondió ${res.status}`);
        const lista = parseCatalogo(await res.json());
        if (!vivo) return;
        if (!lista.length) throw new Error("El índice no trae ninguna skill utilizable");
        setCatalogo(lista);
      } catch (e) {
        if (vivo) setCatalogoError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [catalogoAbierto, catalogo, catalogoError]);

  /** Descarga y analiza, pero NO instala: los permisos se ven primero */
  const fetchFromUrl = async (urlExplicita?: string) => {
    const raw = (urlExplicita ?? skillUrl).trim();
    // el catálogo del propio despliegue va por el mismo origen; lo pegado a
    // mano tiene que ser https, que es de donde vienen las de terceros
    const mismoOrigen = typeof window !== "undefined" && raw.startsWith(window.location.origin);
    if (!mismoOrigen && !/^https:\/\//i.test(raw)) {
      toast.error("Introduce una URL https:// (ej. raw.githubusercontent.com…)");
      return;
    }
    setFetching(true);
    setRiesgoOk(false);
    try {
      const res = await fetch(raw);
      if (!res.ok) throw new Error(`La URL respondió ${res.status}`);
      const body = await res.text();
      if (body.length > 64_000) throw new Error("El archivo supera 64 KB");
      let name = "";
      let description = "";
      let instructions = "";
      let icon = "⚡";
      const trimmed = body.trim();
      if (trimmed.startsWith("{")) {
        const j = JSON.parse(trimmed) as {
          name?: string;
          description?: string;
          instructions?: string;
          icon?: string;
          content?: string;
        };
        name = j.name?.trim() ?? "";
        description = j.description?.trim() ?? "";
        instructions = (j.instructions ?? j.content ?? "").trim();
        if (j.icon) icon = j.icon.slice(0, 4);
      } else {
        const title = trimmed.match(/^#\s+(.+)$/m);
        name = title?.[1]?.trim() ?? raw.split("/").pop()?.replace(/\.(md|txt|json)$/i, "") ?? "Skill";
        const descLine = trimmed.split("\n").find((l) => l.trim() && !l.startsWith("#"));
        description = (descLine ?? "").slice(0, 120);
        instructions = trimmed;
      }
      if (!instructions) throw new Error("El archivo no contiene instrucciones");
      setPendiente({
        name: name.slice(0, 60) || "Skill importada",
        description: description.slice(0, 160) || "Importada desde URL",
        icon,
        instructions,
        permisos: analyzeSkillPermissions(instructions),
      });
    } catch (e) {
      toast.error("No se pudo leer la skill", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setFetching(false);
    }
  };

  /** Trae una entrada del catálogo por el MISMO camino que una URL pegada a
   *  mano. Es lo que hace que un catálogo abierto no sea un agujero: la puerta
   *  de permisos sigue en medio, no hay atajo. */
  const traerDelCatalogo = (e: EntradaCatalogo) => {
    setCatalogoAbierto(false);
    setUrlMode(true);
    setCreating(false);
    setPendiente(null);
    setRiesgoOk(false);
    setSkillUrl(new URL(e.url, window.location.origin).toString());
    // se pide en el mismo gesto: el usuario ya dijo cuál quiere
    setTimeout(() => void fetchFromUrl(new URL(e.url, window.location.origin).toString()), 0);
  };

  /** Instala la skill pendiente de la URL (pide aceptación explícita si es de riesgo) */
  const confirmInstallUrl = () => {
    if (!pendiente) return;
    if (pendiente.permisos.nivel === "riesgo" && !riesgoOk) {
      setRiesgoOk(true);
      return;
    }
    addSkill({
      name: pendiente.name,
      description: pendiente.description,
      icon: pendiente.icon,
      instructions: pendiente.instructions,
      permissions: pendiente.permisos,
    });
    const nivel = pendiente.permisos.nivel;
    cerrarFormularios();
    toast.success(
      nivel === "riesgo" ? "Skill de riesgo instalada — la aceptaste expresamente" : "Skill instalada desde la URL — actívala para usarla"
    );
  };

  const install = () => {
    if (!name.trim() || !instructions.trim()) {
      toast.error("La skill necesita nombre e instrucciones");
      return;
    }
    const permisos = analyzeSkillPermissions(instructions.trim());
    if (permisos.nivel === "riesgo" && !riesgoOk) {
      setRiesgoOk(true);
      return;
    }
    addSkill({
      name: name.trim(),
      description: description.trim() || "Skill personalizada",
      icon: "⚡",
      instructions: instructions.trim(),
      permissions: permisos,
    });
    cerrarFormularios();
    toast.success(
      permisos.nivel === "riesgo"
        ? "Skill de riesgo instalada — la aceptaste expresamente"
        : "Skill instalada — actívala para usarla"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:h-[600px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Puzzle className="size-4 text-prism-violet" /> Skills
            <span className="rounded-full bg-prism-violet/10 px-2 py-0.5 text-[10px] font-medium text-prism-violet">
              {activeCount} activas
              {costeActivas > 0 && (
                <span className="ml-1 font-mono tabular-nums opacity-70">
                  · +{costeActivas.toLocaleString("es")} car./mensaje
                </span>
              )}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Las skills activas se añaden a las instrucciones del modelo en todas tus conversaciones.
            Antes de instalar una, Prism te muestra qué permisos declara su texto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 border-b px-4 py-3">
          {!pendiente && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 flex-1 gap-1.5 text-xs"
                onClick={() => {
                  setCreating((v) => !v);
                  setUrlMode(false);
                  setRiesgoOk(false);
                }}
              >
                <Plus className="size-3.5" /> Crear skill
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 flex-1 gap-1.5 text-xs"
                onClick={() => {
                  setUrlMode((v) => !v);
                  setCreating(false);
                  setPendiente(null);
                  setRiesgoOk(false);
                }}
              >
                <Download className="size-3.5" /> Desde URL
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 flex-1 gap-1.5 text-xs"
                onClick={() => {
                  setCatalogoAbierto((v) => !v);
                  setCreating(false);
                  setUrlMode(false);
                  setPendiente(null);
                  setRiesgoOk(false);
                }}
              >
                <Sparkles className="size-3.5" /> Catálogo
              </Button>
            </div>
          )}

          {catalogoAbierto && !pendiente && (
            <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Skills listas para instalar. Cada una pasa por la misma puerta de permisos que
                una URL pegada a mano: verás qué declara antes de que entre.
              </p>
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en el catálogo…"
                className="h-8 text-xs"
                aria-label="Buscar en el catálogo"
              />
              {catalogoError && (
                <p className="text-[11px] text-destructive">
                  No se pudo leer el catálogo: {catalogoError}
                </p>
              )}
              {!catalogo && !catalogoError && (
                <p className="text-[11px] text-muted-foreground">Cargando…</p>
              )}
              {catalogo && (
                <ul className="space-y-1">
                  {buscarEnCatalogo(catalogo, busqueda).map((e) => {
                    const puesta = yaInstalada(e, skills.map((s) => s.name));
                    return (
                      <li
                        key={e.id}
                        className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5"
                      >
                        <span aria-hidden className="text-base">
                          {e.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium">{e.name}</span>
                          <span className="block truncate text-[10.5px] text-muted-foreground">
                            {e.description}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant={puesta ? "ghost" : "outline"}
                          disabled={puesta}
                          className="h-7 shrink-0 text-[11px]"
                          onClick={() => traerDelCatalogo(e)}
                        >
                          {puesta ? "Ya la tienes" : "Ver e instalar"}
                        </Button>
                      </li>
                    );
                  })}
                  {!buscarEnCatalogo(catalogo, busqueda).length && (
                    <li className="px-1 py-2 text-[11px] text-muted-foreground">
                      Nada con «{busqueda}».
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
          {creating && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Chef de cocina" className="h-8 text-xs" />
              <Label className="text-xs">Descripción corta</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué hace esta skill" className="h-8 text-xs" />
              <Label className="text-xs">Instrucciones para el modelo</Label>
              <textarea
                value={instructions}
                onChange={(e) => {
                  setInstructions(e.target.value);
                  setRiesgoOk(false);
                }}
                rows={4}
                placeholder="Ej. Eres un chef experto. Cuando te den ingredientes, propón recetas paso a paso con tiempos y cantidades…"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-prism-violet/50"
              />
              {permisosManual && (
                <PermisosBox p={permisosManual} compacte />
              )}
              {riesgoOk && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/[0.06] p-2 text-[11px] leading-snug text-red-600 dark:text-red-400">
                  Esta skill pide claves o manda datos a servidores externos. Pulsa «Instalar
                  igualmente» para confirmar que lo viste — nadie más lo hará por ti.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={cerrarFormularios}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className={cn("h-8 text-xs", riesgoOk && "bg-red-600 hover:bg-red-700")}
                  onClick={install}
                >
                  {riesgoOk ? <ShieldAlert className="mr-1 size-3.5" /> : <Wand2 className="mr-1 size-3.5" />}
                  {riesgoOk ? "Instalar igualmente" : "Instalar"}
                </Button>
              </div>
            </div>
          )}
          {urlMode && !pendiente && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs">URL de la skill</Label>
              <Input
                value={skillUrl}
                onChange={(e) => setSkillUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/usuario/repo/main/skill.md"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void fetchFromUrl();
                }}
              />
              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                Acepta un archivo Markdown o JSON con &#123; name, description, instructions, icon &#125;.
                Se descarga, se analiza y ANTES de instalar verás qué permisos declara.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={cerrarFormularios}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void fetchFromUrl()}
                  disabled={fetching || !skillUrl.trim()}
                >
                  {fetching ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Download className="mr-1 size-3.5" />}
                  Analizar
                </Button>
              </div>
            </div>
          )}
          {pendiente && (
            <div className="space-y-2 rounded-xl border border-prism-violet/40 bg-muted/30 p-3">
              <p className="flex items-center gap-2 text-[13px] font-medium">
                <span>{pendiente.icon}</span> {pendiente.name}
              </p>
              <p className="text-[11.5px] text-muted-foreground">{pendiente.description}</p>
              <PermisosBox p={pendiente.permisos} />
              {riesgoOk && (
                <p className="text-[11px] leading-snug text-red-600 dark:text-red-400">
                  Entendido: pulsa otra vez «Instalar igualmente» para confirmar que asumes el riesgo
                  de esta skill en concreto.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={cerrarFormularios}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className={cn("h-8 text-xs", pendiente.permisos.nivel === "riesgo" && "bg-red-600 hover:bg-red-700")}
                  onClick={confirmInstallUrl}
                >
                  {pendiente.permisos.nivel === "riesgo" ? <ShieldAlert className="mr-1 size-3.5" /> : <Download className="mr-1 size-3.5" />}
                  {pendiente.permisos.nivel === "riesgo" ? (riesgoOk ? "Instalar igualmente" : "Riesgo: instalar") : "Instalar"}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-2">
            {skills.map((s) => {
              const permisos = permisosPorSkill.get(s.id);
              return (
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
                      {/* El precio, al lado del interruptor que lo cobra. Una
                          skill activa mete su texto en CADA mensaje, y hasta
                          la v3.19 eso no se veía en ninguna parte. */}
                      <span
                        className="rounded-full bg-secondary/60 px-1.5 py-px font-mono text-[9.5px] tabular-nums text-muted-foreground"
                        title={`Añade ${costeDeSkill(s.name, s.instructions).toLocaleString("es")} caracteres a cada mensaje mientras esté activa`}
                      >
                        +{costeDeSkill(s.name, s.instructions).toLocaleString("es")}
                      </span>
                      {permisos && permisos.nivel !== "ok" && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-medium",
                            permisos.nivel === "riesgo"
                              ? "bg-red-500/15 text-red-600 dark:text-red-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          )}
                          title={permisos.motivos.join(" ") || permisosLegibles(permisos).join(" · ")}
                        >
                          <ShieldAlert className="size-3" />
                          {permisos.nivel === "riesgo" ? "riesgo" : "avisos"}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{s.description}</p>
                    {permisos && (
                      <p className="mt-1 truncate text-[10.5px] leading-snug text-muted-foreground/80" title={permisosLegibles(permisos).join(" · ")}>
                        {permisosLegibles(permisos).slice(0, 2).join(" · ")}
                      </p>
                    )}
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
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
