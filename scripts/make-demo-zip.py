#!/usr/bin/env python3
"""Genera public/demo-sandbox.zip — proyecto web demo para el Sandbox de Prism AI."""
import os
import zipfile

# Raíz del repo = carpeta padre de scripts/ (funciona desde cualquier cwd)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
os.makedirs(PUBLIC, exist_ok=True)

INDEX = """<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Demo Sandbox Prism</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main class="card">
    <img src="assets/prisma.svg" alt="Prisma" width="72" height="72">
    <h1>Funciona <span>de verdad</span></h1>
    <p>Este proyecto vino de un ZIP y ahora corre en el Sandbox de Prism AI.</p>
    <button id="btn">Pulsado 0 veces</button>
    <canvas id="lienzo" width="260" height="90"></canvas>
    <p class="tip">Abre la pestaña «Consola» para ver los logs.</p>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
"""

CSS = """:root { --violet: #7c5cff; --ink: #1c1633; }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center;
  font-family: system-ui, sans-serif; color: var(--ink);
  background: radial-gradient(1200px 600px at 20% -10%, #e6e0ff 0%, #f7f6ff 55%, #ffffff 100%);
}
.card {
  text-align: center; background: #fff; padding: 2rem 2.5rem; border-radius: 20px;
  box-shadow: 0 20px 60px rgba(60, 40, 140, .18); max-width: 420px;
}
h1 { margin: .6rem 0 .2rem; font-size: 1.6rem; }
h1 span { color: var(--violet); }
button {
  margin-top: .8rem; border: 0; background: linear-gradient(135deg, #7c5cff, #4f9dff);
  color: #fff; font-size: 1rem; padding: .7rem 1.4rem; border-radius: 12px; cursor: pointer;
}
button:active { transform: scale(.97); }
canvas { margin-top: 1rem; border-radius: 12px; background: #14101f; }
.tip { color: #7a7490; font-size: .8rem; margin-bottom: 0; }
"""

JS = """const btn = document.getElementById("btn");
const canvas = document.getElementById("lienzo");
let n = 0;

btn.addEventListener("click", () => {
  n += 1;
  btn.textContent = `Pulsado ${n} ${n === 1 ? "vez" : "veces"}`;
  console.log("click", n);
  dibujar(n);
});

function dibujar(n) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 36;
    const h = 20 + ((n * 13 + i * 29) % 55);
    const hue = 250 + i * 8;
    ctx.fillStyle = `hsl(${hue} 90% 65%)`;
    ctx.fillRect(x, canvas.height - 12 - h, 24, h);
  }
}

console.log("Demo del Sandbox lista ✔");
dibujar(1);
"""

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs><linearGradient id="g" x1="0" y1="0" x2="64" y2="64">
    <stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#4f9dff"/>
  </linearGradient></defs>
  <path d="M32 4 60 56H4L32 4z" fill="url(#g)" opacity=".9"/>
  <circle cx="32" cy="42" r="7" fill="#fff"/>
</svg>
"""

README = """# Demo del Sandbox

Proyecto web estático de ejemplo para probar Prism AI Sandbox.

- `index.html` — entrada
- `css/style.css` — estilos (inlineado automático)
- `js/app.js` — lógica (inlineado automático)
- `assets/prisma.svg` — imagen local (data URL automática)

Edítalo, pulsa **Ejecutar** para verlo correr y **Revisar** para que el
Sandbox te diga qué habría que arreglar antes de subirlo a GitHub.
"""

target = os.path.join(PUBLIC, "demo-sandbox.zip")
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("demo-web/README.md", README)
    z.writestr("demo-web/index.html", INDEX)
    z.writestr("demo-web/css/style.css", CSS)
    z.writestr("demo-web/js/app.js", JS)
    z.writestr("demo-web/assets/prisma.svg", SVG)

print("OK", target, os.path.getsize(target), "bytes")
