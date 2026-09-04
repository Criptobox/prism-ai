"use client";
/** Prism AI — Pestaña «Gasto» del Panel del sistema.
 *
 * Responde a una pregunta que el panel de Uso no respondía: **cuál de tus
 * modelos de PAGO se está llevando el trabajo, y en qué tipo de encargo**. Uso
 * mezclaba gratis y de pago en la misma tabla ordenada por número de
 * peticiones, que es justo el orden que no ayuda cuando hay una factura de por
 * medio.
 *
 * Todo lo que se pinta aquí está medido en tu dispositivo. Lo que no se sabe
 * se dice: no hay precios, no hay tokens exactos y no hay porcentajes con
 * denominador cero. La cuenta buena la tiene tu proveedor.
 */
import { useEffect, useMemo, useState } from "react";
import { Coins, Gift, Info } from "lucide-react";
import { usePrism } from "@/lib/prism/store";
import { fmtChars, fmtMs, useUsage } from "@/lib/prism/usage";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import {
  encargoQueMasGasta,
  filasDeGasto,
  parteDe,
  sinClasificarDe,
  soloDePago,
  tareasConModelos,
  tokensAprox,
  totalDeProveedor,
  ahorroDeCacheDe,
  totalDe,
  type FilaGasto,
  type TareaConModelos,
} from "@/lib/prism/gasto-modelos";
import { gastoDeHoy } from "@/lib/prism/chat-client";
import {
  PRECIOS_FECHA,
  costeDeModelo,
  cuantosSinPrecio,
  fmtDinero,
  pieDePrecios,
  preciosViejos,
  sumaCostes,
  type Coste,
  type TablaPrecios,
} from "@/lib/prism/precios";
import { normalizarTope, TOPE_DIARIO_POR_DEFECTO } from "@/lib/prism/gasto";
import { ModelLogo } from "./model-logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** «≈ 12,3k» — siempre con el «≈» delante: son caracteres ÷ 4, no el contador
 *  del proveedor, y confundirlos es lo que lleva a discutir con una factura. */
function tokens(chars: number): string {
  const t = tokensAprox(chars);
  return t > 0 ? `≈ ${fmtChars(t)} tok` : "0 tok";
}

/** Barra de reparto. Sin número inventado: si no hay total, no hay barra. */
function Barra({ parte }: { parte: number | null }) {
  if (parte == null) return null;
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-prism-violet/70"
        style={{ width: `${Math.max(2, parte)}%` }}
      />
    </div>
  );
}

/** El desglose de un modelo por tipo de encargo, ahora con lo que costó cada
 *  uno. El importe sale de los tokens que el proveedor reportó PARA ESE
 *  encargo —se guardan aparte justo para esto—, nunca repartiendo el total por
 *  caracteres, que sería inventar con aire de exactitud. */
function Encargos({
  fila,
  tabla,
  providerId,
  modelId,
}: {
  fila: FilaGasto;
  tabla: TablaPrecios | undefined;
  providerId: string;
  modelId: string;
}) {
  if (fila.tareas.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-muted-foreground">
        Sin desglose por encargo todavía
        {fila.sinClasificar > 0 && ` · ${fila.sinClasificar} llamada(s) de antes de la v3.48`}.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1.5">
      {fila.tareas.map((t) => (
        <li key={t.tarea} className="text-[11px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">{t.etiqueta}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {t.llamadas} {t.llamadas === 1 ? "llamada" : "llamadas"} ·{" "}
              {(() => {
                const c = costeDeModelo(
                  providerId,
                  modelId,
                  t.uso.conUso > 0
                    ? {
                        entrada: t.uso.entrada,
                        salida: t.uso.salida,
                        cacheLeido: t.uso.cacheLeido,
                        cacheEscrito: t.uso.cacheEscrito,
                      }
                    : null,
                  tabla
                );
                return c.coste ? fmtDinero(c.coste.total) : `${tokens(t.charsIn)} → ${tokens(t.charsOut)}`;
              })()}
            </span>
          </div>
          <Barra parte={parteDe(t.charsIn, fila.charsIn)} />
        </li>
      ))}
      {fila.sinClasificar > 0 && (
        <li className="text-[11px] text-muted-foreground">
          {fila.sinClasificar} sin clasificar (registradas antes de la v3.48)
        </li>
      )}
    </ul>
  );
}

/** El reparto por encargo, y dentro de cada encargo, QUÉ MODELO lo hizo.
 *
 * Las dos preguntas juntas: por separado, «gastas en páginas web» y «gastas
 * con este modelo» no deciden nada; cruzadas sí —«las páginas web me las está
 * haciendo el de pago»—, que es lo que se viene a mirar aquí. */
function Reparto({
  tareas,
  total,
  tabla,
}: {
  tareas: TareaConModelos[];
  total: number;
  tabla: TablaPrecios | undefined;
}) {
  const top = encargoQueMasGasta(tareas);
  if (!top) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        Todavía no hay ningún encargo clasificado con un modelo de pago. En cuanto envíes uno,
        aquí verás en qué se te va y con qué modelo.
      </p>
    );
  }
  return (
    <>
      <p className="text-[11px] text-muted-foreground">
        Donde más contexto va: <span className="font-medium text-foreground">{top.etiqueta}</span>{" "}
        · {top.llamadas} {top.llamadas === 1 ? "llamada" : "llamadas"}
      </p>
      <ul className="mt-2 space-y-3">
        {tareas.map((t) => (
          <li key={t.tarea}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium">{t.etiqueta}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {t.llamadas} ·{" "}
                {(() => {
                  const c = sumaCostes(
                    t.modelos.map(
                      (m) =>
                        costeDeModelo(
                          m.providerId,
                          m.modelId,
                          m.uso.conUso > 0
                            ? {
                                entrada: m.uso.entrada,
                                salida: m.uso.salida,
                                cacheLeido: m.uso.cacheLeido,
                                cacheEscrito: m.uso.cacheEscrito,
                              }
                            : null,
                          tabla
                        ).coste
                    )
                  );
                  return c ? fmtDinero(c.total) : `${tokens(t.charsIn)} enviados`;
                })()}
              </span>
            </div>
            <Barra parte={parteDe(t.charsIn, total)} />
            {/* el modelo, pegado al encargo: es el dato con el que se decide */}
            <ul className="mt-1 space-y-0.5 pl-2">
              {t.modelos.map((m) => (
                <li
                  key={m.key}
                  className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ModelLogo
                      modelId={m.modelId}
                      providerId={m.providerId}
                      className="size-3 shrink-0"
                    />
                    <span className="truncate font-mono">{m.modelId}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {m.llamadas} ·{" "}
                    {(() => {
                      const c = costeDeModelo(
                        m.providerId,
                        m.modelId,
                        m.uso.conUso > 0
                          ? {
                              entrada: m.uso.entrada,
                              salida: m.uso.salida,
                              cacheLeido: m.uso.cacheLeido,
                              cacheEscrito: m.uso.cacheEscrito,
                            }
                          : null,
                        tabla
                      );
                      return c.coste
                        ? fmtDinero(c.coste.total)
                        : `${tokens(m.charsIn)} → ${tokens(m.charsOut)}`;
                    })()}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Los precios: los que vienen en la app, y los frescos si la ruta responde.
 *
 * Se empieza SIEMPRE por la instantánea empaquetada para que el panel pinte al
 * instante y funcione sin red; si llega algo mejor, se cambia y se actualiza la
 * fecha que se enseña. Un fallo aquí no vacía la pantalla: deja la
 * instantánea, que es un dato con fecha, no una invención. */
function usePrecios(): { tabla: TablaPrecios | undefined; fecha: string } {
  const [estado, setEstado] = useState<{ tabla: TablaPrecios | undefined; fecha: string }>({
    tabla: undefined,
    fecha: PRECIOS_FECHA,
  });
  useEffect(() => {
    let vivo = true;
    fetch("/api/precios")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { precios?: TablaPrecios; fecha?: string } | null) => {
        if (!vivo || !j?.precios || !j.fecha) return;
        if (Object.keys(j.precios).length === 0) return;
        setEstado({ tabla: j.precios, fecha: j.fecha });
      })
      .catch(() => {
        /* sin red: se queda la instantánea empaquetada */
      });
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

/** Un importe con su explicación cuando no lo hay. Nunca un número solo. */
function Importe({ coste, motivo }: { coste: Coste | null; motivo?: string | null }) {
  if (!coste) {
    return <span className="text-muted-foreground">{motivo ?? "sin dato"}</span>;
  }
  return <span className="tabular-nums">{fmtDinero(coste.total)}</span>;
}

export function GastoPanelBody() {
  const byModel = useUsage((s) => s.byModel);
  const tope = usePrism((s) => normalizarTope(s.settings.topeLlamadasPago ?? TOPE_DIARIO_POR_DEFECTO));

  // El contador del techo vive en memoria (a propósito: en localStorage se
  // borra desde las DevTools). Se relee cada segundo para que no se quede
  // congelado mientras miras el panel.
  const [hoy, setHoy] = useState(() => gastoDeHoy());
  useEffect(() => {
    setHoy(gastoDeHoy());
    const id = setInterval(() => setHoy(gastoDeHoy()), 1000);
    return () => clearInterval(id);
  }, []);

  const filas = useMemo(
    () => filasDeGasto(byModel, (id) => PROVIDER_MAP[id]?.name ?? id),
    [byModel]
  );
  const pago = useMemo(() => soloDePago(filas), [filas]);
  const gratis = useMemo(() => filas.filter((f) => !f.dePago), [filas]);
  const total = useMemo(() => totalDe(pago), [pago]);
  const tareas = useMemo(() => tareasConModelos(pago), [pago]);
  const sinClasificar = useMemo(() => sinClasificarDe(pago), [pago]);
  const totalGratis = useMemo(() => totalDe(gratis), [gratis]);
  // la cuenta del proveedor, solo de los de pago: es donde importa
  const prov = useMemo(() => totalDeProveedor(pago), [pago]);
  const { tabla, fecha } = usePrecios();
  // El coste de cada modelo de pago: tokens del proveedor × precio fechado.
  // Donde falte cualquiera de las dos mitades, `motivo` dice cuál.
  const costes = useMemo(
    () =>
      new Map(
        pago.map((f) => [
          f.key,
          costeDeModelo(
            f.providerId,
            f.modelId,
            f.conUso > 0
              ? {
                  entrada: f.tokIn,
                  salida: f.tokOut,
                  cacheLeido: f.tokCache,
                  cacheEscrito: f.tokCacheEscrito,
                }
              : null,
            tabla
          ),
        ])
      ),
    [pago, tabla]
  );
  const costeTotal = useMemo(
    () => sumaCostes([...costes.values()].map((c) => c.coste)),
    [costes]
  );
  const sinPrecio = useMemo(() => cuantosSinPrecio([...costes.values()].map((c) => c.coste)), [costes]);
  const viejos = preciosViejos(fecha, Date.now());
  const ahorro = useMemo(() => ahorroDeCacheDe(prov), [prov]);

  const restantes = tope == null ? null : Math.max(0, tope - hoy.pago);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 px-5 py-4">
        {/* ——— Hoy, contra tu techo ——— */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border bg-card/60 p-3">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Coins className="size-3 text-amber-500" /> De pago · esta sesión
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {hoy.pago}
              {tope != null && <span className="text-sm text-muted-foreground"> / {tope}</span>}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {restantes == null ? "sin techo puesto" : `quedan ${restantes} hoy`}
            </p>
          </div>
          <div className="rounded-xl border bg-card/60 p-3">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Gift className="size-3 text-emerald-500" /> Gratis · esta sesión
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{hoy.gratis}</p>
            <p className="text-[10px] text-muted-foreground">no cuentan para el techo</p>
          </div>
          <div className="col-span-2 rounded-xl border bg-card/60 p-3 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Histórico de pago
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{total.llamadas}</p>
            <p className="text-[10px] text-muted-foreground">
              {total.modelos} {total.modelos === 1 ? "modelo" : "modelos"} ·{" "}
              {tokens(total.charsIn)} enviados
            </p>
          </div>
        </div>

        {/* El contador del techo se reinicia al recargar. Decirlo aquí y no
            en el worklog: quien mira este número tiene que saber qué mide. */}
        <p className="flex items-start gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>
            <strong>Esta sesión</strong> = desde que abriste Prism; es el contador que aplica el
            techo y se reinicia al recargar. El histórico sí persiste. Los tokens son{" "}
            <strong>aproximados</strong> (caracteres ÷ 4): el contador exacto lo tiene tu
            proveedor. Los importes en dólares salen de los tokens que él reporta por el precio del
            catálogo público, con su fecha al lado — y donde falte cualquiera de las dos cosas
            verás «sin dato», nunca un número redondeado a ojo.
          </span>
        </p>

        {/* ——— La caché del prompt: el único dato que NO es estimación ———
         *
         * Todo lo demás de esta pestaña son caracteres contados por nosotros.
         * Esto lo dice el proveedor: cuántos tokens le entraron, cuántos le
         * salieron y cuántos sirvió desde la caché. Si no lo dice, se dice que
         * no se sabe — que es lo que pasa con casi todos menos Anthropic. */}
        <div className="rounded-xl border bg-card/40 p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            La cuenta del proveedor · no es estimación nuestra
          </p>
          {prov.llamadas === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Sin dato. Ninguno de tus proveedores de pago ha devuelto su cuenta de tokens
              todavía. Anthropic la manda siempre; los demás, casi nunca.
            </p>
          ) : (
            <>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {prov.llamadas} {prov.llamadas === 1 ? "llamada" : "llamadas"} con cuenta ·{" "}
                {fmtChars(prov.entrada)} tok entrada · {fmtChars(prov.salida)} tok salida
              </p>
              <p className="mt-1 text-[13px] font-semibold">
                {ahorro == null ? (
                  <span className="text-muted-foreground">Caché: sin dato</span>
                ) : (
                  <>
                    {ahorro}%{" "}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      del prompt servido desde la caché ({fmtChars(prov.cacheLeido)} tok)
                    </span>
                  </>
                )}
              </p>
              <Barra parte={ahorro} />
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                Lo que entra por caché cuesta una fracción de lo que cuesta como entrada nueva.
                Sube solo cuando repites conversación con el mismo proyecto y las mismas reglas;
                empezar un hilo nuevo la vacía.
              </p>
            </>
          )}
        </div>

        {/* ——— Lo que llevas gastado, en dinero ——— */}
        <div className="rounded-xl border bg-card/40 p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Lo que llevas gastado
          </p>
          {costeTotal ? (
            <>
              <p className="text-2xl font-semibold tabular-nums">{fmtDinero(costeTotal.total)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {fmtDinero(costeTotal.entrada)} de entrada · {fmtDinero(costeTotal.salida)} de
                salida · {fmtDinero(costeTotal.cache + costeTotal.cacheEscrito)} de caché
              </p>
              {costeTotal.sinCache > costeTotal.total && (
                <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  La caché del prompt te ha ahorrado{" "}
                  {fmtDinero(costeTotal.sinCache - costeTotal.total)} (habría costado{" "}
                  {fmtDinero(costeTotal.sinCache)}).
                </p>
              )}
              {sinPrecio > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No incluye {sinPrecio} {sinPrecio === 1 ? "modelo" : "modelos"} sin precio en el
                  catálogo: el total de arriba es de menos, no del todo.
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Sin dato todavía. Para poner un importe hacen falta dos cosas: que tu proveedor diga
              cuántos tokens gastó y que el modelo esté en el catálogo de precios. Con una sola de
              las dos, esta app no calcula nada.
            </p>
          )}
          {/* La fuente y la fecha van SIEMPRE pegadas al número. Un importe sin
              procedencia se lee como una factura, y esto no lo es. */}
          <p
            className={cn(
              "mt-2 text-[10px] leading-relaxed",
              viejos ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/80"
            )}
          >
            {pieDePrecios(fecha, Date.now())}
          </p>
        </div>

        {/* ——— En qué se te va ——— */}
        <div className="rounded-xl border bg-card/40 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            En qué se te va · qué encargo y con qué modelo
          </p>
          <Reparto tareas={tareas} total={total.charsIn} tabla={tabla} />
          {sinClasificar > 0 && (
            <p className="mt-2 text-[10.5px] text-muted-foreground">
              {sinClasificar} llamada(s) de pago sin clasificar: son de antes de que se guardara el
              tipo de encargo. No se reparten a ojo entre las tareas.
            </p>
          )}
        </div>

        {/* ——— Modelo a modelo ——— */}
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Modelo a modelo
          </p>
          {pago.length === 0 ? (
            <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              No has usado ningún modelo de pago en este dispositivo. Todo lo registrado es de
              modelos con capa gratuita.
            </p>
          ) : (
            <ul className="space-y-2">
              {pago.map((f) => (
                <li key={f.key} className="rounded-xl border bg-card/40 p-3">
                  <div className="flex items-start gap-2">
                    <ModelLogo
                      modelId={f.modelId}
                      providerId={f.providerId}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{f.modelId}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {f.proveedor} · {f.ok}✓{f.fallos > 0 ? ` ${f.fallos}✗` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold tabular-nums">{f.llamadas}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {f.llamadas === 1 ? "llamada" : "llamadas"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                    Enviado {tokens(f.charsIn)} · recibido {tokens(f.charsOut)}
                    <span className="text-muted-foreground/70">
                      {" "}
                      ({fmtChars(f.charsIn)} → {fmtChars(f.charsOut)} car.)
                    </span>
                  </p>
                  <p className="mt-1 text-[11px]">
                    <span className="text-muted-foreground">Coste: </span>
                    <Importe
                      coste={costes.get(f.key)?.coste ?? null}
                      motivo={costes.get(f.key)?.motivo}
                    />
                  </p>
                  <Encargos fila={f} tabla={tabla} providerId={f.providerId} modelId={f.modelId} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ——— Lo gratis, en una línea ——— */}
        {gratis.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Y {gratis.length} {gratis.length === 1 ? "modelo gratis" : "modelos gratis"} con{" "}
            {totalGratis.llamadas} {totalGratis.llamadas === 1 ? "llamada" : "llamadas"} y{" "}
            {tokens(totalGratis.charsIn)} enviados. No cuentan para el techo; el detalle está en la
            pestaña de Uso.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
