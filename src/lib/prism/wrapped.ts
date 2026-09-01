"use client";
/** Prism AI — Informe semanal (U4 «Wrapped», PLAN-V7).
 *
 * Calcula un resumen amable de las métricas locales que ya vive en
 * `usage.ts` (peticiones, OK/fallos, latencia, volumen, ahorro por
 * compresión) y lo devuelve como dato + como HTML autocontenido
 * (estilo Prism Link, para descargar o compartir).
 *
 * Lógica pura (sin React ni DOM) para poder probarla en Node, como el
 * resto de piezas que calculan antes de pintar (`free-radar.ts`,
 * `passport.ts`). La UI la pinta `components/prism/wrapped-dialog.tsx`.
 */
import type { ModelUsage } from "./usage";
import { avgMs, p95Ms, fmtMs, fmtChars } from "./usage";
import { splitModelKey } from "./types";
import { PROVIDERS } from "./providers";

/** Ventana por defecto: 7 días naturales atrás desde hoy. */
export const WRAPPED_WINDOW_DAYS = 7;

export interface WrappedStats {
  /** ventana cubierta por el informe */
  desde: number;
  hasta: number;
  /** totales agregados */
  totalRequests: number;
  totalOk: number;
  totalFail: number;
  totalCharsIn: number;
  totalCharsOut: number;
  totalSaved: number;
  /** tasa de éxito (0..1) */
  successRate: number;
  /** media global de latencia (ms) */
  avgLatencyMs: number;
  /** p95 global (ms) */
  p95LatencyMs: number;
  /** modelo más usado (clave compuesta) o null si no hay actividad */
  topModel: string | null;
  /** día más activo (YYYY-MM-DD) o null si no hay actividad */
  topDay: string | null;
  /** actividad por día (YYYY-MM-DD -> nº de peticiones) */
  byDay: Record<string, number>;
  /** top N modelos con sus métricas para el ranking */
  ranking: {
    modelKey: string;
    label: string;
    requests: number;
    ok: number;
    avgMs: number;
    p95Ms: number;
  }[];
  /** ¿hay algo que contar o la ventana está vacía? */
  hasActivity: boolean;
}

/** Etiqueta bonita para un modelKey: «Proveedor · Modelo». */
export function modelLabel(modelKey: string): string {
  const split = splitModelKey(modelKey);
  if (!split) return modelKey;
  const prov = PROVIDERS[split.providerId];
  return `${prov?.name ?? split.providerId} · ${split.modelId}`;
}

/** Calcula el Wrapped a partir del estado de usage y los días pedidos. */
export function computeWrapped(
  byModel: Record<string, ModelUsage>,
  days: Record<string, number>,
  windowDays: number = WRAPPED_WINDOW_DAYS
): WrappedStats {
  const hasta = Date.now();
  const desde = hasta - windowDays * 86_400_000;
  const desdeKey = new Date(desde).toISOString().slice(0, 10);

  // Solo modelos con actividad en la ventana
  const enVentana = Object.entries(byModel).filter(
    ([, u]) => u.lastUsed >= desde
  );

  const totalRequests = enVentana.reduce((s, [, u]) => s + u.requests, 0);
  const totalOk = enVentana.reduce((s, [, u]) => s + u.ok, 0);
  const totalFail = enVentana.reduce((s, [, u]) => s + u.fail, 0);
  const totalCharsIn = enVentana.reduce((s, [, u]) => s + u.charsIn, 0);
  const totalCharsOut = enVentana.reduce((s, [, u]) => s + u.charsOut, 0);
  const totalSaved = enVentana.reduce((s, [, u]) => s + u.savedChars, 0);

  // latencia global: media de medias ponderada por ok (aprox)
  const totalMsSum = enVentana.reduce((s, [, u]) => s + u.totalMs, 0);
  const avgLatencyMs = totalOk > 0 ? Math.round(totalMsSum / totalOk) : 0;
  // p95 global: el mayor de los p95 individuales (aprox conservadora)
  const p95LatencyMs = enVentana.length
    ? Math.max(...enVentana.map(([, u]) => p95Ms(u)))
    : 0;

  // Ranking por nº de peticiones
  const ranking = enVentana
    .map(([modelKey, u]) => ({
      modelKey,
      label: modelLabel(modelKey),
      requests: u.requests,
      ok: u.ok,
      avgMs: avgMs(u),
      p95Ms: p95Ms(u),
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 5);

  const topModel = ranking.length ? ranking[0].modelKey : null;

  // byDay: solo días dentro de la ventana
  const byDay: Record<string, number> = {};
  for (const [k, v] of Object.entries(days)) {
    if (k >= desdeKey) byDay[k] = v;
  }
  const topDayEntry = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  const topDay = topDayEntry && topDayEntry[1] > 0 ? topDayEntry[0] : null;

  return {
    desde,
    hasta,
    totalRequests,
    totalOk,
    totalFail,
    totalCharsIn,
    totalCharsOut,
    totalSaved,
    successRate: totalRequests > 0 ? totalOk / totalRequests : 0,
    avgLatencyMs,
    p95LatencyMs,
    topModel,
    topDay,
    byDay,
    ranking,
    hasActivity: totalRequests > 0,
  };
}

/** Porcentaje de ahorro por compresión (0..100). 0 si no hay entrada. */
export function ahorroPct(s: WrappedStats): number {
  const base = s.totalCharsIn + s.totalSaved;
  if (base <= 0) return 0;
  return Math.round((s.totalSaved / base) * 100);
}

/** Genera un HTML autocontenido con el informe, listo para descargar
 *  (estilo Prism Link: una sola página, sin dependencias externas). */
export function wrappedToHtml(s: WrappedStats, version = "3.34.0"): string {
  const desdeTxt = new Date(s.desde).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
  const hastaTxt = new Date(s.hasta).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const ahorro = ahorroPct(s);
  const exito = Math.round(s.successRate * 100);
  const dias = Object.entries(s.byDay).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDia = Math.max(1, ...dias.map(([, v]) => v));
  const rankingRows = s.ranking
    .map(
      (r, i) => `
        <tr>
          <td>${i + 1}.</td>
          <td><code>${escapeHtml(r.label)}</code></td>
          <td>${r.requests}</td>
          <td>${r.ok}</td>
          <td>${fmtMs(r.avgMs)}</td>
          <td>${fmtMs(r.p95Ms)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prism AI · Wrapped ${desdeTxt} – ${hastaTxt}</title>
<style>
  :root{
    --bg:#0b0a12;--card:rgba(255,255,255,.045);--stroke:rgba(255,255,255,.09);
    --text:#eceaf4;--muted:#9b97ae;--faint:#676379;
    --violet:#8b5cf6;--cyan:#22d3ee;--pink:#f472b6;--amber:#fbbf24;--green:#34d399;
    --grad:linear-gradient(135deg,#8b5cf6 0%,#6d5ef0 45%,#22d3ee 100%);
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:var(--bg);color:var(--text);line-height:1.5;min-height:100vh;
    background-image:
      radial-gradient(ellipse 80% 60% at 70% -10%,rgba(139,92,246,.18),transparent 60%),
      radial-gradient(ellipse 60% 50% at 10% 110%,rgba(34,211,238,.12),transparent 60%);
    background-attachment:fixed}
  .wrap{max-width:880px;margin:0 auto;padding:48px 24px 80px}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px}
  .brand{font-weight:800;font-size:18px;letter-spacing:-.02em}
  .brand span{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .meta{font-family:ui-monospace,monospace;font-size:11px;color:var(--faint)}
  h1{font-size:clamp(28px,5vw,46px);font-weight:800;letter-spacing:-.03em;line-height:1.1;margin-bottom:10px}
  h1 em{font-style:normal;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .lede{color:var(--muted);font-size:15px;max-width:600px;margin-bottom:36px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:32px}
  .stat{border:1px solid var(--stroke);border-radius:18px;background:var(--card);
    backdrop-filter:blur(14px);padding:20px}
  .stat b{display:block;font-size:32px;font-weight:800;background:var(--grad);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .stat small{font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.08em}
  .stat .sub{margin-top:4px;font-size:12px;color:var(--muted)}
  section{margin-bottom:32px}
  h2{font-size:18px;font-weight:700;margin-bottom:14px;letter-spacing:-.01em}
  .bars{display:flex;align-items:flex-end;gap:8px;height:120px;border:1px solid var(--stroke);
    border-radius:14px;background:var(--card);padding:14px}
  .b{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:6px}
  .b i{display:block;border-radius:4px 4px 0 0;background:var(--grad);opacity:.9}
  .b small{font-family:ui-monospace,monospace;font-size:9.5px;color:var(--faint);text-align:center;
    white-space:nowrap;overflow:hidden}
  table{width:100%;border-collapse:collapse;border:1px solid var(--stroke);border-radius:14px;
    overflow:hidden;font-size:13px}
  th{text-align:left;padding:10px 14px;font-size:10.5px;font-weight:700;letter-spacing:.1em;
    text-transform:uppercase;color:var(--faint);background:rgba(255,255,255,.04);
    border-bottom:1px solid var(--stroke)}
  td{padding:10px 14px;border-bottom:1px solid var(--stroke);color:var(--muted)}
  tr:last-child td{border-bottom:none}
  td:first-child{color:var(--text);font-weight:600}
  code{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--cyan);
    background:rgba(34,211,238,.08);padding:1.5px 6px;border-radius:5px}
  .empty{padding:48px 20px;text-align:center;color:var(--muted);font-size:14px;
    border:1px dashed var(--stroke);border-radius:14px}
  footer{margin-top:48px;padding-top:24px;border-top:1px solid var(--stroke);
    font-size:11px;color:var(--faint);font-family:ui-monospace,monospace;
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  @media(max-width:560px){.bars{height:80px}.b small{font-size:8.5px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">Prism <span>AI</span> · Wrapped</div>
    <div class="meta">v${version} · ${desdeTxt} – ${hastaTxt}</div>
  </header>
  <h1>Tu semana en <em>Prism</em></h1>
  <p class="lede">Lo que usaste, lo que ahorraste y cómo te fue — medido en tu navegador, sin que nada saliera del dispositivo.</p>

  ${
    s.hasActivity
      ? `
  <div class="grid">
    <div class="stat"><b>${s.totalRequests}</b><small>Peticiones</small><div class="sub">${s.totalOk} OK · ${s.totalFail} fallos</div></div>
    <div class="stat"><b>${exito}%</b><small>Tasa de éxito</small><div class="sub">failover incluido</div></div>
    <div class="stat"><b>${ahorro}%</b><small>Ahorro por compresión</small><div class="sub">${fmtChars(s.totalSaved)} chars</div></div>
    <div class="stat"><b>${fmtMs(s.avgLatencyMs)}</b><small>Latencia media</small><div class="sub">p95 ${fmtMs(s.p95LatencyMs)}</div></div>
    <div class="stat"><b>${fmtChars(s.totalCharsOut)}</b><small>Caracteres generados</small><div class="sub">en ${fmtChars(s.totalCharsIn)} de entrada</div></div>
  </div>

  <section>
    <h2>Actividad por día</h2>
    <div class="bars">
      ${dias
        .map(
          ([k, v]) => `
        <div class="b" title="${k}: ${v} peticiones">
          <i style="height:${Math.max(8, (v / maxDia) * 100)}%"></i>
          <small>${k.slice(8)}</small>
        </div>`
        )
        .join("")}
    </div>
  </section>

  ${
    s.ranking.length
      ? `<section>
    <h2>Top ${s.ranking.length} modelos de la semana</h2>
    <table>
      <thead><tr><th>#</th><th>Modelo</th><th>Pet.</th><th>OK</th><th>Media</th><th>p95</th></tr></thead>
      <tbody>${rankingRows}</tbody>
    </table>
  </section>`
      : ""
  }

  ${
    s.topDay
      ? `<p style="margin-top:24px;color:var(--muted);font-size:13px">Día más activo: <b style="color:var(--text)">${s.topDay}</b> con ${s.byDay[s.topDay]} peticiones.</p>`
      : ""
  }
  `
      : `<div class="empty">Aún no hay actividad en esta ventana. Vuelve cuando lleves unos días usando Prism. 🌱</div>`
  }

  <footer>
    <span>Generado por Prism AI v${version}</span>
    <span>Tus datos, tu navegador — nada salió de aquí</span>
  </footer>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
