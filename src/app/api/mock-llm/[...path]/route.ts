import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mock OpenAI-compatible incluido en la app (para pruebas E2E sin claves).
 * - POST /api/mock-llm/v1/chat/completions — chat streaming/no-streaming
 *   · system con «MODO AGENTE» → respuesta con bucle plan→step→review→answer+project-map
 *   · mensaje con página/html/landing/juego → documento HTML en ```html
 *   · mensaje multimodal (imágenes) → confirma que las vio
 *   · resto → saludo de prueba
 * - GET /api/mock-llm/v1/models — lista de modelos
 * Clave válida: "test-key-123".
 */

const KEY = "test-key-123";

const AGENT_DOC = (extra: string) =>
  [
    "<!DOCTYPE html>",
    '<html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Agente Demo</title>",
    "<style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#0f172a;color:#fff}",
    "h1{font-size:2.2rem;margin:0 0 8px}.card{text-align:center;padding:40px;border-radius:20px;background:rgba(255,255,255,.06)}",
    extra,
    "</style></head><body>",
    '<div class="card"><h1>Construido por el agente</h1><p>Iteraciones verificadas automáticamente.</p>',
    '<button id="b">Púlsame</button><span id="n">0</span></div>',
    "<script>let n=0;document.getElementById('b').onclick=()=>{n++;document.getElementById('n').textContent=n};</script>",
    "</body></html>",
  ].join("\n");

const HTML_DOC = [
  "<!DOCTYPE html>",
  '<html lang="es">',
  "<head>",
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  "<title>Demo Prism</title>",
  "<style>",
  "  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;",
  "  background:linear-gradient(135deg,#1e1b4b,#0f766e 55%,#be185d);color:#fff}",
  "  .card{background:rgba(255,255,255,.1);backdrop-filter:blur(12px);padding:48px;border-radius:24px;",
  "  text-align:center;max-width:420px;border:1px solid rgba(255,255,255,.2)}",
  "  h1{margin:0 0 12px;font-size:2rem}",
  "  p{opacity:.85;line-height:1.6}",
  "  button{margin-top:20px;padding:12px 28px;border:0;border-radius:999px;font-weight:600;",
  "  background:#fff;color:#1e1b4b;cursor:pointer;transition:transform .2s}",
  "  button:hover{transform:scale(1.05)}",
  "  #n{font-size:3rem;font-weight:800;display:block;margin-top:16px}",
  "</style>",
  "</head>",
  "<body>",
  '<div class="card">',
  "<h1>Funciona en vivo ✨</h1>",
  "<p>Esta página se generó con Prism AI y se renderiza mientras la IA escribe.</p>",
  '<button id="b">Púlsame</button>',
  '<span id="n">0</span>',
  "</div>",
  "<script>",
  "let n=0;document.getElementById('b').onclick=()=>{n++;document.getElementById('n').textContent=n};",
  "</script>",
  "</body>",
  "</html>",
].join("\n");

function buildReply(body: { messages?: { role: string; content: unknown }[] }): string {
  const msgs = body.messages ?? [];
  const last = msgs[msgs.length - 1];
  const raw = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");
  const seesImage = Array.isArray(last?.content);
  const wantsAgent = msgs.some(
    (m) => typeof m.content === "string" && m.content.includes("MODO AGENTE")
  );
  const wantsHtml = /página|pagina|html|landing|juego/i.test(raw);

  if (wantsAgent) {
    return [
      "<plan>",
      "- Crear la estructura HTML base",
      "- Añadir estilos y animación",
      "- Verificar el resultado final",
      "</plan>",
      "",
      '<step n="1" title="Estructura HTML base">',
      "Creo el documento con semántica clara:",
      "",
      "```html",
      AGENT_DOC(""),
      "```",
      "</step>",
      "",
      '<review pass="no">',
      "- Falta animación de entrada",
      "- El botón necesita estilo hover",
      "</review>",
      "",
      '<step n="2" title="Pulido: animación y hover">',
      "Añado la animación y mejoro el botón:",
      "",
      "```html",
      AGENT_DOC(
        ".card{animation:subir .6s ease both}@keyframes subir{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}"
      ),
      "```",
      "</step>",
      "",
      '<review pass="yes">',
      "- Estructura correcta",
      "- Animación funcionando",
      "- Responsive verificado",
      "</review>",
      "",
      "<answer>",
      "Listo: la página quedó construida en **2 iteraciones** con revisión final aprobada. El bucle detectó 2 fallos en la primera pasada y los corrigió automáticamente.",
      "</answer>",
      "",
      '<project-map>{"name":"Agente Demo","description":"Página de presentación generada por el agente","files":[{"name":"index.html","kind":"html","summary":"Presentación con animación y botón de prueba"}],"features":["Animación de entrada","Botón interactivo","Responsive"]}</project-map>',
    ].join("\n");
  }
  if (wantsHtml) {
    return `Aquí tienes tu página. La vista previa se construye en vivo:\n\n\`\`\`html\n${HTML_DOC}\n\`\`\``;
  }
  if (seesImage) {
    return "He recibido tu **imagen** correctamente 👀 El pipeline multimodal funciona: la imagen viajó como `image_url` en el protocolo OpenAI y el modelo la recibió. ¿Qué quieres que haga con ella?";
  }
  return "¡Hola! Soy **Prism AI** funcionando con tu API.\n\nTodo el pipeline opera correctamente: `UI → proxy → servidor → SSE → UI`.";
}

function sse(reply: string): Response {
  const chunks = reply.match(/[\s\S]{1,14}/g) ?? [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let i = 0;
      const timer = setInterval(() => {
        if (i < chunks.length) {
          const payload = { id: "mock-1", choices: [{ delta: { content: chunks[i] }, index: 0 }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          i++;
        } else {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          clearInterval(timer);
        }
      }, 30);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.join("/").endsWith("chat/completions")) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (req.headers.get("authorization") !== `Bearer ${KEY}`) {
    return Response.json({ error: { message: "Clave inválida" } }, { status: 401 });
  }
  const body = (await req.json()) as { stream?: boolean; model?: string; messages?: { role: string; content: unknown }[] };
  // Simulación del límite real de AiHubMix: «cuentas sin recargar solo 10 intentos»
  if ((body.model ?? "").toLowerCase().includes("kimi-k3")) {
    return Response.json(
      {
        error: {
          message:
            "Sorry, to prevent abuse of free resources, accounts that have not been recharged can only try 10 times. You can increase the free quota after recharging: https://console.aihubmix.com/topup",
        },
      },
      { status: 429 }
    );
  }
  const reply = buildReply(body);
  if (body.stream) return sse(reply);
  return Response.json({ choices: [{ message: { content: reply }, index: 0 }] });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.join("/").endsWith("models")) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({
    data: [
      { id: "mock-mini-free" },
      { id: "mock-pro-free" },
      { id: "mock-vision" },
      { id: "mock-paid-pro" },
    ],
  });
}
