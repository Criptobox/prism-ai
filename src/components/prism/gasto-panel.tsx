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
  totalDe,
  type FilaGasto,
  type TareaConModelos,
} from "@/lib/prism/gasto-modelos";
import { gastoDeHoy } from "@/lib/prism/chat-client";
import { normalizarTope, TOPE_DIARIO_POR_DEFECTO } from "@/lib/prism/gasto";
import { ModelLogo } from "./model-logo";
import { ScrollArea } from "@/components/ui/scroll-area";

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

/** El desglose de un modelo por tipo de encargo. */
function Encargos({ fila }: { fila: FilaGasto }) {
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
              {t.llamadas} {t.llamadas === 1 ? "llamada" : "llamadas"} · {tokens(t.charsIn)} →{" "}
              {tokens(t.charsOut)}
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
function Reparto({ tareas, total }: { tareas: TareaConModelos[]; total: number }) {
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
                {t.llamadas} · {tokens(t.charsIn)} enviados
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
                    {m.llamadas} · {tokens(m.charsIn)} → {tokens(m.charsOut)}
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
            <strong>aproximados</strong> (caracteres ÷ 4): el contador exacto lo tiene tu proveedor.
            Aquí no verás euros ni dólares —los precios cambian por modelo y por tramo, y un importe
            inventado se leería como un dato.
          </span>
        </p>

        {/* ——— En qué se te va ——— */}
        <div className="rounded-xl border bg-card/40 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            En qué se te va · qué encargo y con qué modelo
          </p>
          <Reparto tareas={tareas} total={total.charsIn} />
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
                  <Encargos fila={f} />
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
