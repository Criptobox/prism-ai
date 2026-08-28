#!/usr/bin/env python3
"""Genera public/demo-modulos.zip — proyecto con módulos ES para el Sandbox.

Sirve de prueba real de que el import map del Sandbox resuelve importaciones
relativas anidadas (js/app.js → js/saludo.js → js/mat/constantes.js) y una
carpeta por su index.js, sin empaquetador y sin instalar nada.
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
os.makedirs(PUBLIC, exist_ok=True)

INDEX = """<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Demo con módulos ES</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main class="card">
    <h1 id="titulo">…</h1>
    <p id="suma">…</p>
    <p class="tip">Cada línea viene de un módulo distinto, importado en cadena.</p>
  </main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
"""

APP = """import { saludo } from "./saludo.js";
import { suma } from "./mat/index.js";

document.getElementById("titulo").textContent = saludo("módulos ES");
document.getElementById("suma").textContent = `2 + 3 = ${suma(2, 3)}`;
console.log("app.js con módulos ES cargado");
"""

SALUDO = """import { MARCA } from "./mat/constantes.js";
export const saludo = (que) => `Funcionan los ${que} — ${MARCA}`;
"""

MAT_INDEX = """export { suma } from "./ops.js";
"""

OPS = """import { MARCA } from "./constantes.js";

export function suma(a, b) {
  console.log("sumando en", MARCA);
  return a + b;
}
"""

CONSTANTES = """export const MARCA = "Prism Sandbox";
"""

CSS = """body {
  margin: 0; min-height: 100vh; display: grid; place-items: center;
  font-family: system-ui, sans-serif; color: #1c1633;
  background: radial-gradient(1200px 600px at 20% -10%, #e6e0ff 0%, #f7f6ff 55%, #fff 100%);
}
.card {
  text-align: center; background: #fff; padding: 2rem 2.5rem; border-radius: 20px;
  box-shadow: 0 20px 60px rgba(60, 40, 140, .18); max-width: 420px;
}
h1 { font-size: 1.4rem; margin: 0 0 .4rem; }
.tip { color: #7a7490; font-size: .8rem; margin-bottom: 0; }
"""

README = """# Demo con módulos ES

Proyecto de ejemplo que reparte el código en módulos que se importan entre sí:

- `js/app.js` — entrada (`<script type="module">`)
- `js/saludo.js` — importa una constante de otra carpeta
- `js/mat/index.js` — reexporta desde `ops.js`
- `js/mat/ops.js`, `js/mat/constantes.js`

El Sandbox lo ejecuta sin empaquetador ni `npm install`: reescribe los
especificadores y los sirve por un import map.
"""

target = os.path.join(PUBLIC, "demo-modulos.zip")
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("demo-esm/README.md", README)
    z.writestr("demo-esm/index.html", INDEX)
    z.writestr("demo-esm/css/style.css", CSS)
    z.writestr("demo-esm/js/app.js", APP)
    z.writestr("demo-esm/js/saludo.js", SALUDO)
    z.writestr("demo-esm/js/mat/index.js", MAT_INDEX)
    z.writestr("demo-esm/js/mat/ops.js", OPS)
    z.writestr("demo-esm/js/mat/constantes.js", CONSTANTES)

print("OK", target, os.path.getsize(target), "bytes")
