"use client";
/* eslint-disable react-hooks/refs -- grafo con física imperativa: las posiciones viven en refs y se leen durante el render controlado por el tick de animación (patrón canvas-like) */
/** Prism AI — Grafo de relaciones estilo Obsidian: física de fuerzas propia en
 * SVG (sin dependencias). Nodos por tipo (archivo/funcionalidad/tech/nota),
 * drag, zoom, pan, hover con resaltado de vecinos, filtros, búsqueda y panel
 * de detalles con backlinks — como el graph view de obsidian.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Locate, Pause, Play, RefreshCcw, X } from "lucide-react";
import { buildGraph, fileRelations, type GraphEdge, type GraphNode } from "@/lib/prism/project-map";
import type { ProjectMap } from "@/lib/prism/types";
import { cn } from "@/lib/utils";

type Pos = { x: number; y: number; vx: number; vy: number };

const TYPE_LABEL: Record<GraphNode["type"], string> = {
  file: "Archivos",
  feature: "Funcionalidades",
  tech: "Tech",
  note: "Notas",
};

function nodeColor(n: GraphNode): string {
  if (n.type === "feature") return "#10b981";
  if (n.type === "tech") return "#a855f7";
  if (n.type === "note") return "#ec4899";
  if (n.kind === "css") return "#3b82f6";
  if (n.kind === "js" || n.kind === "ts") return "#f59e0b";
  if (n.kind === "img") return "#14b8a6";
  return "#06b6d4"; // html y otros archivos
}

function nodeRadius(n: GraphNode): number {
  const base = n.type === "file" ? 7 : n.type === "tech" ? 6 : 5;
  return base + Math.min(3, n.degree);
}

function edgeStyle(kind: GraphEdge["kind"]): { stroke: string; dash?: string } {
  if (kind === "link") return { stroke: "#06b6d4" };
  if (kind === "feat") return { stroke: "#10b981", dash: "2 3" };
  return { stroke: "#a855f7", dash: "2 3" };
}

/** radio inicial sobre un anillo amplio para que la física respire */
function initialRadius(n: number, i: number): number {
  return 70 + ((i * 53) % Math.max(140, n * 22));
}

export function ProjectGraph({ map }: { map: ProjectMap | null }) {
  const graph = useMemo(() => buildGraph(map), [map]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 480, h: 520 });
  const [, setTick] = useState(0);

  const posRef = useRef<Record<string, Pos>>({});
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(true);
  const dragRef = useRef<string | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const [view, setView] = useState({ tx: 240, ty: 260, s: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<GraphNode["type"]>>(new Set());

  const visible = useMemo(() => {
    const nodes = graph.nodes.filter((n) => !hidden.has(n.type));
    const ids = new Set(nodes.map((n) => n.id.toLowerCase()));
    const edges = graph.edges.filter(
      (e) => ids.has(e.source.toLowerCase()) && ids.has(e.target.toLowerCase())
    );
    return { nodes, edges };
  }, [graph, hidden]);

  const neighborIds = useMemo(() => {
    const focus = hovered ?? selected;
    if (!focus) return null;
    const low = focus.toLowerCase();
    const set = new Set<string>([low]);
    for (const e of visible.edges) {
      if (e.source.toLowerCase() === low) set.add(e.target.toLowerCase());
      if (e.target.toLowerCase() === low) set.add(e.source.toLowerCase());
    }
    return set;
  }, [hovered, selected, visible.edges]);

  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!q) return null;
    return new Set(visible.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id.toLowerCase()));
  }, [q, visible.nodes]);

  /* --------- tamaño del contenedor (centra la vista la primera vez) --------- */
  const centeredRef = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) {
        setSize({ w: r.width, h: r.height });
        if (!centeredRef.current) {
          centeredRef.current = true;
          setView({ tx: r.width / 2, ty: r.height / 2, s: 1 });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* --------- posiciones iniciales (círculo amplio) --------- */
  const resetPositions = () => {
    const next: Record<string, Pos> = {};
    const n = visible.nodes.length || 1;
    visible.nodes.forEach((node, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = initialRadius(n, i);
      next[node.id] = {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: 0,
        vy: 0,
      };
    });
    posRef.current = next;
    alphaRef.current = 1;
  };

  // reconstruir posiciones al cambiar el grafo (conserva las previas si existen)
  useEffect(() => {
    const prev = posRef.current;
    const next: Record<string, Pos> = {};
    const n = visible.nodes.length || 1;
    visible.nodes.forEach((node, i) => {
      if (prev[node.id]) {
        next[node.id] = prev[node.id];
        return;
      }
      const a = (i / n) * Math.PI * 2;
      const r = initialRadius(n, i);
      next[node.id] = { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 };
    });
    posRef.current = next;
    alphaRef.current = Math.max(alphaRef.current, 0.5);
  }, [visible.nodes]);

  /* --------- física de fuerzas (rAF siempre vivo; se salta el trabajo en reposo) --------- */
  useEffect(() => {
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(step);
      if (!runningRef.current) return;
      if (alphaRef.current <= 0.02 && !dragRef.current) return;
      const pos = posRef.current;
      const nodes = visible.nodes;
      const edges = visible.edges;
      const alpha = alphaRef.current;
      {
        const K = 170; // repulsión: como en Obsidian, los nodos se empujan y respiran
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = pos[nodes[i].id];
            const b = pos[nodes[j].id];
            if (!a || !b) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) {
              dx = (Math.random() - 0.5) * 2;
              dy = (Math.random() - 0.5) * 2;
              d2 = dx * dx + dy * dy + 0.01;
            }
            const d = Math.sqrt(d2);
            const f = (K * K) / d2 / Math.max(d, 8);
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
        for (const e of edges) {
          const a = pos[e.source];
          const b = pos[e.target];
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = (d - 120) * 0.016;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
        for (const node of nodes) {
          const p = pos[node.id];
          if (!p) continue;
          p.vx += -p.x * 0.006;
          p.vy += -p.y * 0.006;
          if (dragRef.current === node.id) {
            p.vx = 0;
            p.vy = 0;
            continue;
          }
          p.vx *= 0.9;
          p.vy *= 0.9;
          p.x += Math.max(-20, Math.min(20, p.vx * alpha));
          p.y += Math.max(-20, Math.min(20, p.vy * alpha));
        }
        alphaRef.current = alpha * 0.992;
        setTick((t) => t + 1);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [visible]);

  const reheat = () => {
    alphaRef.current = Math.max(alphaRef.current, 0.4);
  };

  /* --------- interacción --------- */
  const toWorld = (clientX: number, clientY: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    const px = clientX - (rect?.left ?? 0);
    const py = clientY - (rect?.top ?? 0);
    return { x: (px - v.tx) / v.s, y: (py - v.ty) / v.s };
  };

  const onNodePointerDown = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = id;
    setSelected(id);
    reheat();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag) {
      const p = posRef.current[drag];
      if (p) {
        const w = toWorld(e.clientX, e.clientY);
        p.x = w.x;
        p.y = w.y;
        p.vx = 0;
        p.vy = 0;
        setTick((t) => t + 1);
      }
      return;
    }
    const pan = panRef.current;
    if (pan) {
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
      setView((v) => ({ ...v, tx: pan.tx + dx, ty: pan.ty + dy }));
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
    if (panRef.current && !panRef.current.moved) setSelected(null);
    panRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    setView((v) => ({ ...v, s: Math.min(3, Math.max(0.35, v.s * factor)) }));
  };

  const zoomBy = (f: number) => setView((v) => ({ ...v, s: Math.min(3, Math.max(0.35, v.s * f)) }));
  const recenter = () => setView({ tx: size.w / 2, ty: size.h / 2, s: 1 });
  const [running, setRunning] = useState(true);
  const stabilize = () => {
    resetPositions();
    runningRef.current = true;
    setRunning(true);
  };

  const toggleRunning = () => {
    setRunning((r) => {
      const next = !r;
      runningRef.current = next;
      if (next) alphaRef.current = Math.max(alphaRef.current, 0.3);
      return next;
    });
  };

  const toggleType = (t: GraphNode["type"]) => {
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const pos = posRef.current;
  const selNode = selected ? visible.nodes.find((n) => n.id === selected) ?? null : null;
  const rel = selNode?.type === "file" && map ? fileRelations(map, selNode.id) : null;

  const typesPresent: Array<{ t: GraphNode["type"]; count: number; color: string }> = (
    [
      ["file", "#06b6d4"],
      ["feature", "#10b981"],
      ["tech", "#a855f7"],
      ["note", "#ec4899"],
    ] as const
  )
    .map(([t, color]) => ({ t, color, count: graph.nodes.filter((n) => n.type === t).length }))
    .filter((x) => x.count > 0);

  return (
    <div className="flex h-full flex-col">
      {/* barra: búsqueda + filtros tipo Obsidian */}
      <div className="shrink-0 space-y-2 border-b border-border/60 p-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nodos…"
          className="h-7 w-full rounded-lg border border-border/60 bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-prism-cyan/60"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {typesPresent.map(({ t, count, color }) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition",
                hidden.has(t)
                  ? "border-border/40 text-muted-foreground/50"
                  : "border-border/60 text-foreground hover:border-foreground/40"
              )}
              title={hidden.has(t) ? `Mostrar ${TYPE_LABEL[t]}` : `Ocultar ${TYPE_LABEL[t]}`}
            >
              <span
                className="inline-block size-1.5 rounded-full"
                style={{ background: color, opacity: hidden.has(t) ? 0.3 : 1 }}
              />
              {TYPE_LABEL[t]} · {count}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={toggleRunning}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            title={running ? "Pausar simulación" : "Reanudar simulación"}
            aria-label={running ? "Pausar simulación" : "Reanudar simulación"}
          >
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <button
            onClick={stabilize}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            title="Estabilizar el grafo"
            aria-label="Estabilizar el grafo"
          >
            <RefreshCcw className="size-3.5" />
          </button>
          <button
            onClick={() => zoomBy(0.85)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            title="Alejar"
            aria-label="Alejar"
          >
            <span className="text-xs leading-none">−</span>
          </button>
          <button
            onClick={() => zoomBy(1.18)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            title="Acercar"
            aria-label="Acercar"
          >
            <span className="text-xs leading-none">+</span>
          </button>
          <button
            onClick={recenter}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            title="Centrar vista"
            aria-label="Centrar vista"
          >
            <Locate className="size-3.5" />
          </button>
        </div>
      </div>

      {/* lienzo */}
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <svg
          width={size.w}
          height={size.h}
          className={cn("touch-none select-none", panRef.current ? "cursor-grabbing" : "cursor-grab")}
          onPointerDown={(e) => {
            panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
          }}
          role="img"
          aria-label={`Grafo del proyecto: ${visible.nodes.length} nodos y ${visible.edges.length} relaciones`}
        >
          <g transform={`translate(${view.tx},${view.ty}) scale(${view.s})`}>
            {visible.edges.map((e) => {
              const a = pos[e.source];
              const b = pos[e.target];
              if (!a || !b) return null;
              const st = edgeStyle(e.kind);
              const focus = hovered ?? selected;
              const low = focus?.toLowerCase();
              const active =
                !!low && (e.source.toLowerCase() === low || e.target.toLowerCase() === low);
              return (
                <line
                  key={`${e.source}|${e.target}|${e.kind}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={st.stroke}
                  strokeWidth={active ? 1.7 : 1}
                  strokeDasharray={st.dash}
                  opacity={active ? 0.9 : 0.25}
                />
              );
            })}
            {visible.nodes.map((n) => {
              const p = pos[n.id];
              if (!p) return null;
              const color = nodeColor(n);
              const focus = hovered ?? selected;
              const low = focus?.toLowerCase();
              const isFocus = !!low && n.id.toLowerCase() === low;
              const isNeighbor = !!neighborIds && neighborIds.has(n.id.toLowerCase());
              const isMatch = !!matchIds && matchIds.has(n.id.toLowerCase());
              const dimmed = (!!neighborIds || !!matchIds) && !isFocus && !isNeighbor && !isMatch;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  className="cursor-pointer"
                  onPointerDown={(e) => onNodePointerDown(n.id, e)}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  data-node={n.id}
                  opacity={dimmed ? 0.14 : 1}
                >
                  <circle r={nodeRadius(n) + 3} fill={color} opacity={isFocus || isMatch ? 0.22 : 0} />
                  <circle r={nodeRadius(n)} fill={color} fillOpacity={0.85} stroke={color} strokeWidth={1} />
                  <text
                    y={nodeRadius(n) + 10}
                    textAnchor="middle"
                    fontSize={9}
                    fill="currentColor"
                    className="text-foreground"
                    opacity={isFocus || isNeighbor || isMatch ? 1 : 0.62}
                  >
                    {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* stats estilo Obsidian */}
        <div data-testid="graph-stats" className="pointer-events-none absolute bottom-2 right-2.5 rounded-md bg-background/70 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
          {visible.nodes.length} nodos · {visible.edges.length} relaciones
        </div>

        {/* panel de detalles del nodo seleccionado */}
        {selNode && (
          <div data-testid="graph-details" className="absolute bottom-2 left-2.5 w-60 rounded-xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-start gap-2">
              <span
                className="mt-1 inline-block size-2 shrink-0 rounded-full"
                style={{ background: nodeColor(selNode) }}
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-semibold leading-snug">{selNode.label}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {selNode.type === "file"
                    ? `archivo · ${selNode.kind ?? "otro"}`
                    : selNode.type === "feature"
                      ? "funcionalidad"
                      : selNode.type === "tech"
                        ? "tecnología"
                        : "nota de memoria"}
                  {" · "}
                  {selNode.degree} {selNode.degree === 1 ? "conexión" : "conexiones"}
                </p>
                {selNode.summary && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{selNode.summary}</p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Cerrar detalles"
              >
                <X className="size-3" />
              </button>
            </div>
            {rel && (rel.outgoing.length > 0 || rel.incoming.length > 0) && (
              <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                {rel.outgoing.length > 0 && (
                  <div>
                    <p className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Enlaza a
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {rel.outgoing.map((t) => (
                        <button
                          key={t}
                          onClick={() => setSelected(t)}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted/70"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {rel.incoming.length > 0 && (
                  <div>
                    <p className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Referenciado por
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {rel.incoming.map((t) => (
                        <button
                          key={t}
                          onClick={() => setSelected(t)}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted/70"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
