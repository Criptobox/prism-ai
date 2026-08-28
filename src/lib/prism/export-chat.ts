/** Prism AI — Exportación de conversaciones a Markdown y PDF (100% local, sin servidor).
 * El PDF se genera con el diálogo de impresión del navegador sobre una vista limpia,
 * lo que permite «Guardar como PDF» en escritorio y móvil sin dependencias pesadas.
 */

import type { Session } from "./types";

const ROLES = { user: "Tú", assistant: "Asistente" } as const;

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("es", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function modelOfSession(s: Session): string {
  const last = [...s.messages].reverse().find((m) => m.role === "assistant" && m.model);
  return last?.model ?? "";
}

/** Convierte la sesión a Markdown legible (los bloques de código se conservan tal cual) */
export function sessionToMarkdown(s: Session): string {
  const lines: string[] = [];
  lines.push(`# ${s.title || "Conversación"}`, "");
  lines.push(`> Exportado desde **Prism AI** · ${fmtDate(s.updatedAt)}`);
  const model = modelOfSession(s);
  if (model) lines.push(`> Modelo: \`${model}\``);
  lines.push("", `**${s.messages.length} mensajes**`, "", "---", "");

  for (const m of s.messages) {
    const who = ROLES[m.role as keyof typeof ROLES];
    if (!who) continue;
    lines.push(`## ${who}`, "");
    if (m.attachments?.length) {
      lines.push(
        ...m.attachments.map((a) => `*Imagen adjunta: ${a.name} (${Math.round(a.size / 1024)} KB)*`),
        ""
      );
    }
    lines.push(m.content.trim() || "_(sin contenido)_", "");
  }
  return lines.join("\n");
}

function sanitizeName(title: string): string {
  return (
    (title || "conversacion")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "conversacion"
  );
}

/** Descarga la conversación como archivo .md */
export function downloadSessionMarkdown(s: Session): void {
  const md = sessionToMarkdown(s);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeName(s.title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Descarga la conversación como «Prism Link»: HTML autocontenido que se abre
 * en cualquier navegador con doble clic, sin servidor y sin Prism AI. */
export function downloadSessionHtml(s: Session): void {
  const html = sessionToStandaloneHtml(s);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeName(s.title)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Conversación como página HTML estáta con estilos Prism (sin JS, sin dependencias) */
export function sessionToStandaloneHtml(s: Session): string {
  const model = modelOfSession(s);
  const body = s.messages
    .map((m) => {
      const who = ROLES[m.role as keyof typeof ROLES];
      if (!who) return "";
      const atts = m.attachments?.length
        ? `<div class="atts">${m.attachments
            .map(
              (a) =>
                `<figure><img src="${a.dataUrl}" alt="${escapeHtml(a.name)}" loading="lazy"/><figcaption>${escapeHtml(
                  a.name
                )}</figcaption></figure>`
            )
            .join("")}</div>`
        : "";
      const meta = [
        m.model ? escapeHtml(m.model) : "",
        m.elapsedMs != null ? `${(m.elapsedMs / 1000).toFixed(1)}s` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<section class="msg ${m.role}">
  <div class="head"><span class="who">${who}</span>${meta ? `<span class="meta">${meta}</span>` : ""}</div>
  ${atts}
  <div class="body">${miniMarkdown(m.content.trim() || "_(sin contenido)_")}</div>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<title>${escapeHtml(s.title || "Conversación")} · Prism Link</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding: 28px 16px 64px; background: linear-gradient(135deg,#0F172A,#1E1B4B 70%,#172554);
    color:#E2E8F0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height:1.6; }
  .wrap { max-width: 820px; margin: 0 auto; }
  header { text-align:center; margin-bottom: 26px; }
  .brand { font-size:11px; letter-spacing:.18em; text-transform:uppercase; font-weight:700;
    background: linear-gradient(90deg,#22D3EE,#A78BFA,#F472B6); -webkit-background-clip:text; background-clip:text; color:transparent; }
  h1 { margin:6px 0 4px; font-size:24px; color:#F8FAFC; }
  .meta { color:#94A3B8; font-size:12.5px; }
  .msg { margin: 0 0 16px; }
  .head { display:flex; align-items:baseline; gap:10px; margin: 0 4px 6px; }
  .who { font-size:10.5px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#A78BFA; }
  .msg.assistant .who { color:#22D3EE; }
  .meta { font-size:10.5px; color:#64748B; }
  .body { background: rgba(30,27,75,.45); border:1px solid rgba(148,163,184,.18); border-radius:14px;
    padding: 12px 16px; font-size:14px; }
  .msg.user .body { background: rgba(14,116,144,.12); border-color: rgba(34,211,238,.22); }
  .body p { margin:.45em 0; }
  .body h1,.body h2,.body h3 { margin:.8em 0 .3em; font-size:15px; color:#F1F5F9; }
  .body pre.code { background:#0B1120; color:#E2E8F0; padding:12px 14px; border-radius:10px;
    font-size:12.5px; overflow-x:auto; white-space:pre-wrap; border:1px solid rgba(148,163,184,.14); }
  .body code.inline { background:rgba(167,139,250,.16); border-radius:4px; padding:1px 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12.5px; color:#C4B5FD; }
  .body li { margin:.2em 0; }
  .body a { color:#22D3EE; }
  .atts { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin-bottom:6px; }
  .msg.user .atts { justify-content:flex-end; }
  figure { margin:0; text-align:center; }
  figure img { max-width:220px; max-height:180px; border-radius:10px; border:1px solid rgba(148,163,184,.25); }
  figcaption { font-size:10px; color:#64748B; }
  footer { text-align:center; color:#475569; font-size:11px; margin-top:36px; }
  footer b { background: linear-gradient(90deg,#22D3EE,#A78BFA); -webkit-background-clip:text; background-clip:text; color:transparent; }
</style></head><body><div class="wrap">
<header>
  <div class="brand">◆ Prism Link</div>
  <h1>${escapeHtml(s.title || "Conversación")}</h1>
  <div class="meta">${fmtDate(s.updatedAt)} · ${s.messages.length} mensajes${model ? ` · ${escapeHtml(model)}` : ""}</div>
</header>
${body}
<footer>Compartido con <b>Prism AI</b> — archivo autocontenido, sin servidor</footer>
</div></body></html>`;
}

/** Render simple de markdown (títulos, negritas, código y listas) para el PDF impreso */
function miniMarkdown(text: string): string {
  const blocks = escapeHtml(text).split(/```/);
  return blocks
    .map((block, i) => {
      if (i % 2 === 1) {
        const nl = block.indexOf("\n");
        const code = nl >= 0 ? block.slice(nl + 1) : block;
        return `<pre class="code">${code.replace(/\n$/, "")}</pre>`;
      }
      return block
        .replace(/^### (.*)$/gm, '<h3>$1</h3>')
        .replace(/^## (.*)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*)$/gm, "<h1>$1</h1>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
        .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, "<br/>");
    })
    .join("");
}

/** Abre el diálogo de impresión con la conversación formateada → «Guardar como PDF» */
export function printSessionPdf(s: Session): void {
  const model = modelOfSession(s);
  const body = s.messages
    .map((m) => {
      const who = ROLES[m.role as keyof typeof ROLES];
      if (!who) return "";
      const atts = m.attachments?.length
        ? `<div class="atts">${m.attachments
            .map(
              (a) =>
                `<figure><img src="${a.dataUrl}" alt="${escapeHtml(a.name)}"/><figcaption>${escapeHtml(
                  a.name
                )}</figcaption></figure>`
            )
            .join("")}</div>`
        : "";
      return `<section class="msg ${m.role}"><div class="who">${who}</div>${atts}<div class="body">${miniMarkdown(
        m.content.trim() || "_(sin contenido)_"
      )}</div></section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>${escapeHtml(s.title || "Conversación")} — Prism AI</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#1a1a22; margin:0; padding:32px 40px; line-height:1.6; }
  header { border-bottom:2px solid #8b5cf6; padding-bottom:12px; margin-bottom:20px; }
  header h1 { margin:0 0 4px; font-size:21px; }
  header .meta { color:#666; font-size:12px; }
  .brand { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#8b5cf6; font-weight:700; margin-bottom:6px; }
  .msg { margin:0 0 18px; page-break-inside:avoid; }
  .msg .who { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#8b5cf6; margin-bottom:3px; }
  .msg.assistant .who { color:#0891b2; }
  .msg .body { background:#f7f6fb; border:1px solid #e6e3f2; border-radius:10px; padding:10px 14px; font-size:13px; }
  .msg.user .body { background:#f0fbfd; border-color:#d3eef4; }
  .body p { margin:.4em 0; }
  .body h1,.body h2,.body h3 { margin:.7em 0 .3em; font-size:14px; }
  .body pre.code { background:#14141c; color:#e6e6f0; padding:10px 12px; border-radius:8px; font-size:11.5px; overflow-x:auto; white-space:pre-wrap; }
  .body code.inline { background:#ece8fa; border-radius:4px; padding:0 4px; font-family:ui-monospace,monospace; font-size:11.5px; }
  .body li { margin:.15em 0; }
  .atts { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin-bottom:6px; }
  .msg.user .atts { justify-content:flex-end; }
  figure { margin:0; text-align:center; }
  figure img { max-width:200px; max-height:160px; border-radius:8px; border:1px solid #ddd; }
  figcaption { font-size:10px; color:#888; }
  @page { margin: 14mm; }
</style></head><body>
<header><div class="brand">Prism AI</div><h1>${escapeHtml(s.title || "Conversación")}</h1>
<div class="meta">${fmtDate(s.updatedAt)} · ${s.messages.length} mensajes${model ? ` · <code>${escapeHtml(model)}</code>` : ""}</div></header>
${body}
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.srcdoc = html;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 60000);
    }
  };
  document.body.appendChild(iframe);
}
