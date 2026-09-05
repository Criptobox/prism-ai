"use client";
/** Prism AI — Diálogo de la Caza de ofertas IA.
 *
 * Dos pestañas: «Ofertas» (el catálogo con buscador, chips por tipo y
 * favoritas) y «Ajustes» (avisos del navegador, margen de días y la fuente
 * JSON propia).
 *
 * Al abrir se marcan las novedades como vistas: la insignia de la barra
 * lateral solo señala «hay algo que no has visto», y abrir la puerta ES
 * verlo. El listado se calcula aquí, no en el store, porque depende del
 * «hoy»: una promo que venció ayer no puede seguir saliendo como vigente
 * solo porque nadie abrió la app ese día.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Star,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOfertas } from "@/lib/prism/ofertas-store";
import {
  ETIQUETA_TIPO,
  OFERTAS_BASE,
  OFERTAS_VERIFICADO,
  estadoOferta,
  filtrarOfertas,
  fusionarOfertas,
  resumenOfertas,
  validarOfertas,
  type FiltroTipo,
  type Oferta,
} from "@/lib/prism/ofertas";
import { fechaHoy } from "@/lib/prism/repaso";

/** Los chips del filtro, en el orden en que se pintan. */
const CHIPS: { valor: FiltroTipo; label: string }[] = [
  { valor: "todas", label: "Todos" },
  { valor: "gratis", label: ETIQUETA_TIPO.gratis },
  { valor: "dias", label: ETIQUETA_TIPO.dias },
  { valor: "descuento", label: ETIQUETA_TIPO.descuento },
  { valor: "creditos", label: ETIQUETA_TIPO.creditos },
  { valor: "estudiantes", label: ETIQUETA_TIPO.estudiantes },
  { valor: "favoritas", label: "Favoritas" },
];

export function OfertasDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const favoritas = useOfertas((s) => s.favoritas);
  const alternarFavorita = useOfertas((s) => s.alternarFavorita);
  const marcarVistas = useOfertas((s) => s.marcarVistas);
  const ofertasFeed = useOfertas((s) => s.ofertasFeed);
  const guardarFeed = useOfertas((s) => s.guardarFeed);
  const ajustes = useOfertas((s) => s.ajustes);
  const setAjustes = useOfertas((s) => s.setAjustes);

  // El «hoy» se fija al abrir, como en el Repaso: si la sesión cruza la
  // medianoche, el listado no cambia de debajo de tus pies.
  const [hoy, setHoy] = useState("");
  const [consulta, setConsulta] = useState("");
  const [tipo, setTipo] = useState<FiltroTipo>("todas");

  // Fuente propia: estado local mientras se edita; «Guardar y comprobar»
  // valida la URL, la guarda y trae las ofertas en un solo gesto.
  const [feedUrl, setFeedUrl] = useState("");
  const [cargando, setCargando] = useState(false);

  // Permiso de notificaciones: se consulta al abrir porque el usuario puede
  // cambiarlo desde el navegador en cualquier momento. Se va por la
  // Permissions API y no por el estático `Notification.permission` porque
  // el estático miente en headless (y en algunas webviews) tras conceder
  // el permiso desde ajustes: la API es la que refleja la verdad.
  const [permiso, setPermiso] = useState<"granted" | "denied" | "default" | "unsupported">("default");

  useEffect(() => {
    if (!open) return;
    setHoy(fechaHoy());
    setConsulta("");
    setTipo("todas");
    setFeedUrl(useOfertas.getState().ajustes.feedUrl);
    marcarVistas();
    const leerPermiso = async () => {
      if (typeof Notification === "undefined") {
        setPermiso("unsupported");
        return;
      }
      try {
        const q = await navigator.permissions.query({ name: "notifications" });
        setPermiso(q.state as NotificationPermission);
        q.onchange = () => setPermiso(q.state as NotificationPermission);
      } catch {
        setPermiso(Notification.permission);
      }
    };
    void leerPermiso();
  }, [open, marcarVistas]);

  const favoritasSet = useMemo(() => new Set(favoritas), [favoritas]);

  const todas = useMemo(() => fusionarOfertas(OFERTAS_BASE, ofertasFeed), [ofertasFeed]);

  const visibles = useMemo(
    () =>
      filtrarOfertas(todas, {
        consulta,
        tipo,
        favoritas: favoritasSet,
        hoy: hoy || fechaHoy(),
        diasAviso: ajustes.diasAviso,
      }),
    [todas, consulta, tipo, favoritasSet, hoy, ajustes.diasAviso]
  );

  const resumen = useMemo(
    () => resumenOfertas(todas, hoy || fechaHoy(), ajustes.diasAviso, favoritasSet),
    [todas, hoy, ajustes.diasAviso, favoritasSet]
  );

  /** Trae la fuente propia, valida y fusiona. Los fallos de red/CORS son
   * esperables (la app no tiene servidor que releve): se avisan y las
   * ofertas de la última carga se conservan en el store. */
  const comprobarFuente = async () => {
    const url = feedUrl.trim();
    if (!url) {
      toast.error("Escribe la URL de tu fuente primero");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json: unknown = await res.json();
      const validas = validarOfertas(json);
      if (!validas.length) {
        toast.error("Tu fuente no trajo ofertas válidas", {
          description: "Cada entrada necesita id, proveedor, título, valor y URL http(s).",
        });
        return;
      }
      guardarFeed(validas);
      setAjustes({ feedUrl: url });
      toast.success(`Tu fuente trajo ${validas.length} ofertas`, {
        description: "Ya están fusionadas con el catálogo de la app.",
      });
    } catch {
      toast.error("No se pudo cargar la fuente", {
        description: "Red caída o CORS del otro lado. Se conservan las ofertas de la última carga.",
      });
    } finally {
      setCargando(false);
    }
  };

  /** Pide permiso y, si llega, deja los avisos activados con una muestra. */
  const activarAvisos = async () => {
    if (typeof Notification === "undefined") {
      setPermiso("unsupported");
      return;
    }
    if (permiso === "granted") {
      // ya concedido: el botón funciona como interruptor
      setAjustes({ notificaciones: !ajustes.notificaciones });
      return;
    }
    const p = await Notification.requestPermission();
    setPermiso(p);
    if (p === "granted") {
      setAjustes({ notificaciones: true });
      toast.success("Avisos activados", {
        description: "Te avisaré aquí y en el navegador cuando haya ofertas nuevas o por expirar.",
      });
    } else {
      toast.error("Permiso denegado", {
        description: "El navegador bloqueó los avisos; puedes desbloquearlo en el candado de la barra de direcciones.",
      });
    }
  };

  const probarAviso = () => {
    toast.info("Aviso de prueba enviado");
    // Se intenta sin mirar el permiso estático (miente en headless): si no
    // hay permiso de verdad, el constructor lanza y se captura — el toast
    // dentro de la app ya avisó.
    try {
      new Notification("Prism AI · Caza de ofertas", {
        body: "Los avisos funcionan. Cuando algo bueno aparezca, te enterarás.",
      });
    } catch {
      // algunos navegadores móviles no dejan construir Notification sin
      // service worker: el toast de la app ya cumplió
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="size-4 text-amber-600 dark:text-amber-400" /> Caza de ofertas
          </DialogTitle>
          <DialogDescription>
            Ofertas vigentes de IA — días gratis, créditos y planes gratuitos — con
            avisos de lo nuevo y de lo que está a punto de terminar. Todo se comprueba
            en tu navegador; verificado el {OFERTAS_VERIFICADO.split("-").reverse().join("/")}.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="ofertas">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ofertas">
              Ofertas · {resumen.vigentes + resumen.porExpirar}
            </TabsTrigger>
            <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          </TabsList>

          {/* ——— Ofertas ——— */}
          <TabsContent value="ofertas" className="mt-3">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <MiniStat valor={resumen.vigentes} etiqueta="vigentes" />
              <MiniStat valor={resumen.porExpirar} etiqueta="por expirar" destacado={resumen.porExpirar > 0} />
              <MiniStat valor={resumen.favoritas} etiqueta="favoritas" />
            </div>

            {/* Buscador + chips: filtran acumulándose */}
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                placeholder="Buscar oferta o proveedor…"
                className="pl-8"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CHIPS.map(({ valor, label }) => {
                const activo = tipo === valor;
                const cuenta = valor === "favoritas" && resumen.favoritas > 0 ? ` · ${resumen.favoritas}` : "";
                return (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setTipo(valor)}
                    className={
                      "rounded-full border px-2.5 py-0.5 text-[11.5px] transition " +
                      (activo
                        ? "border-amber-500/50 bg-amber-500/10 font-medium text-amber-700 dark:text-amber-400"
                        : "border-border/60 text-muted-foreground hover:bg-accent/60")
                    }
                  >
                    {label}
                    {cuenta}
                  </button>
                );
              })}
            </div>

            {visibles.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                Nada por aquí con ese filtro. Prueba a quitar la búsqueda o el chip de tipo.
              </p>
            ) : (
              <ScrollArea className="mt-3 h-72 rounded-xl border border-border/60">
                <ul className="divide-y divide-border/40">
                  {visibles.map((o) => (
                    <TarjetaOferta
                      key={o.id}
                      oferta={o}
                      hoy={hoy || fechaHoy()}
                      diasAviso={ajustes.diasAviso}
                      favorita={favoritasSet.has(o.id)}
                      onFavorita={() => alternarFavorita(o.id)}
                    />
                  ))}
                </ul>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ——— Ajustes ——— */}
          <TabsContent value="ajustes" className="mt-3 flex flex-col gap-4">
            <div className="rounded-xl border border-border/60 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <BellRing className="size-3.5 text-muted-foreground" /> Avisos del navegador
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                Un aviso diario al abrir la app cuando haya ofertas nuevas o cerca de
                caducar. Además del aviso dentro de Prism.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={permiso === "granted" && ajustes.notificaciones ? "secondary" : "default"}
                  onClick={activarAvisos}
                >
                  {permiso === "granted"
                    ? ajustes.notificaciones
                      ? "Avisos activados"
                      : "Avisos en pausa"
                    : permiso === "denied"
                      ? "Permiso denegado"
                      : "Activar avisos"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={probarAviso}
                >
                  Probar aviso
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 p-3">
              <Label htmlFor="ofertas-dias-aviso" className="text-[13px] font-medium">
                Avisar cuando falten
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  id="ofertas-dias-aviso"
                  type="number"
                  min={1}
                  max={14}
                  className="w-20"
                  value={ajustes.diasAviso}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 1 && n <= 14) setAjustes({ diasAviso: Math.round(n) });
                  }}
                />
                <span className="text-[11.5px] text-muted-foreground">
                  días o menos (1-14): la oferta entra en «por expirar»
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 p-3">
              <Label htmlFor="ofertas-feed-url" className="text-[13px] font-medium">
                Fuente propia (JSON)
              </Label>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                URL de un JSON con un array de ofertas — id, proveedor, titulo, tipo
                (gratis/dias/descuento/creditos/estudiantes), valor, descripcion, url,
                termina y verificado. Pisa el catálogo base por id, así que puedes
                corregir entradas o añadir promos relámpago de tu comunidad.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="ofertas-feed-url"
                  placeholder="https://mi-fuente.example/ofertas.json"
                  className="flex-1"
                  value={feedUrl}
                  onChange={(e) => setFeedUrl(e.target.value)}
                />
                <Button size="sm" onClick={comprobarFuente} disabled={cargando}>
                  {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Guardar y comprobar
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Una tarjeta de oferta: proveedor y tipo arriba, valor en grande, y el
 * enlace «Reclamar» que abre la fuente. La estrella marca favorita y el
 * vencimiento se pinta ámbar cuando la cosa aprieta. */
function TarjetaOferta({
  oferta,
  hoy,
  diasAviso,
  favorita,
  onFavorita,
}: {
  oferta: Oferta;
  hoy: string;
  diasAviso: number;
  favorita: boolean;
  onFavorita: () => void;
}) {
  const estado = estadoOferta(oferta, hoy, diasAviso);
  return (
    <li className="flex items-start gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold">{oferta.proveedor}</span>
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {ETIQUETA_TIPO[oferta.tipo]}
          </span>
          {oferta.termina && (
            <span className="text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
              termina el {oferta.termina}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug">{oferta.titulo}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{oferta.descripcion}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{oferta.valor}</span>
          <span>·</span>
          <a
            href={oferta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-prism-violet hover:underline"
          >
            Reclamar <ExternalLink className="size-3" />
          </a>
          {estado === "porExpirar" && (
            <>
              <span>·</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">termina pronto</span>
            </>
          )}
        </p>
      </div>
      <button
        aria-label={`Favorita: ${oferta.titulo}`}
        aria-pressed={favorita}
        className={
          "rounded p-1 transition " +
          (favorita
            ? "text-amber-500"
            : "text-muted-foreground/50 hover:bg-amber-500/10 hover:text-amber-600")
        }
        onClick={onFavorita}
      >
        <Star className={"size-4 " + (favorita ? "fill-amber-400" : "")} />
      </button>
    </li>
  );
}

function MiniStat({
  valor,
  etiqueta,
  destacado,
}: {
  valor: number;
  etiqueta: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border px-2 py-2 " +
        (destacado ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-card/40")
      }
    >
      <p className="text-[15px] font-semibold tabular-nums">{valor}</p>
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
    </div>
  );
}
