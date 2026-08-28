/** Servidor mock compatible con OpenAI para pruebas E2E (puerto 3999).
 * - Si el último mensaje del usuario menciona página/HTML → responde con un documento HTML
 *   completo en un bloque ```html (para probar la vista previa en vivo).
 * - Si el mensaje trae imágenes (content array) → confirma que las vio.
 */
Bun.serve({
  port: 3999,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== "Bearer test-key-123") {
        return new Response(JSON.stringify({ error: { message: "Clave inválida" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = (await req.json()) as {
        stream?: boolean;
        messages?: { role: string; content: unknown }[];
      };
      const last = body.messages?.[body.messages.length - 1];
      const raw = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");
      const seesImage = Array.isArray(last?.content);
      const wantsHtml = /página|pagina|html|landing|juego/i.test(raw);
      const wantsAgent = body.messages?.some((m) =>
        typeof m.content === "string" && m.content.includes("MODO AGENTE")
      ) ?? false;

      let reply: string;
      if (wantsAgent) {
        // Respuesta estructurada del agente: plan → step → review(no) → step → review(ok) → answer → project-map
        const doc = (extra: string) =>
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
        reply = [
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
          doc(""),
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
          doc(".card{animation:subir .6s ease both}@keyframes subir{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}"),
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
      } else if (wantsHtml) {
        reply =
          "Aquí tienes tu página. La vista previa se construye en vivo:\n\n```html\n" +
          [
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
          ].join("\n") +
          "\n```";
      } else if (seesImage) {
        reply =
          "He recibido tu **imagen** correctamente 👀 El pipeline multimodal funciona: la imagen viajó como `image_url` en el protocolo OpenAI y el modelo la recibió. ¿Qué quieres que haga con ella?";
      } else {
        reply =
          "¡Hola! Soy **Prism AI** funcionando con tu API.\n\nTodo el pipeline opera correctamente: `UI → proxy → servidor → SSE → UI`.";
      }

      if (body.stream) {
        const chunks = reply.match(/[\s\S]{1,14}/g) ?? [];
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            let i = 0;
            const timer = setInterval(() => {
              if (i < chunks.length) {
                const payload = {
                  id: "mock-1",
                  choices: [{ delta: { content: chunks[i] }, index: 0 }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                i++;
              } else {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                clearInterval(timer);
              }
            }, 35);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
          },
        });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: reply }, index: 0 }] }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.pathname === "/v1/models") {
      return new Response(
        JSON.stringify({
          data: [
            { id: "mock-mini-free" },
            { id: "mock-pro-free" },
            { id: "mock-vision" },
            { id: "mock-paid-pro" },
          ],
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  },
});
console.log("Mock OpenAI-compatible server en http://localhost:3999");
