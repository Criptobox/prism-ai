# Prism AI — Plan V7 (v3.32.0)

Las mejoras de la **Propuesta v7**: el análisis previo está en el mockup
`prism-ai-propuesta-v7-mockup.html`; aquí queda lo implementado, lo que
queda y por qué. Mismo método de siempre: **cada afirmación comprobada
contra el código**, y cada cambio con su test.

La base es `main` (v3.31.0, commit `dc1a06b`). El zip
`prism-ai-v3.32.0-plan-v6.zip` mencionado en la conversación no estaba
disponible en el entorno de trabajo, así que las cinco tareas del
PLAN-V6 **siguen pendientes** (ninguna estaba ejecutada en `main`);
este plan no las toca y se pueden hacer encima.

---

## 1. Lo que trae la v3.32.0

### Herramientas nuevas del agente (6)

El agente pasaba de 6 a 12 herramientas. Todas respetan la promesa del
producto: sin cuentas, sin servidores propios, la red siempre por
`/api/proxy` (escudo anti-SSRF de `net-guard.ts`) y en el registro de
peticiones.

| Tool | Qué hace | Dónde |
|---|---|---|
| `edit_file` | Edición quirúrgica por búsqueda/reemplazo exacto. Con «find» ambiguo (≥2 apariciones) SE NIEGA salvo `all: true`: cambiar «la que no es» era el riesgo. Ahorra la mayor parte de los tokens de reescribir el archivo entero. | `tool-runner.ts` |
| `run_js` | REPL en un iframe aislado (`allow-scripts` sin `allow-same-origin`, como el Sandbox). Contrato explícito: variable `resultado` o console.log. Techo de 5 s y serializador propio (ciclos, profundidad, funciones). | `js-repl.ts` |
| `read_console` | Relee la consola del último `run_project` sin reejecutar (hasta 40 líneas con nivel, filtro por nivel). | `tool-runner.ts` + `consola` en `RunOutcome` |
| `search_web` | Búsqueda real (HTML de DuckDuckGo) por el proxy. Parseador regex puro y conservador: si el HTML cambia, 0 resultados — nunca inventados. Anuncios fuera. | `busqueda-web.ts` |
| `fetch_api` | JSON de APIs públicas por el proxy, con `fields` por ruta de puntos. Un campo que no existe dice «sin dato». Sin `fields`, JSON entero recortado a 4 000 caracteres. | `tool-runner.ts` |
| `git_snapshot` | Puntos de restauración del proyecto (`create` / `list` / `restore`) en `localStorage` (`prism-snapshots-v1`, tope 12 y 2 MB). `restore` reemplaza el proyecto del bucle y la UI lo recoge. | `snapshots.ts` |

### Arreglo de fondo: el bucle del agente perdía su propio trabajo

Hasta v3.31, `buildToolContext` se reconstruía **en cada vuelta** desde
el seed: un `write_file` de la iteración 1 desaparecía en la iteración
2, y nada de lo escrito llegaba nunca al Sandbox. Ahora:

- el contexto es **uno** para todo el bucle (`use-agent-tools.ts`);
- tras cada tanda de tools, `onProjectFiles` entrega el estado actual y
  `chat-app.tsx` lo vuelca: con el Sandbox cerrado, como seed (al
  abrirlo está lo último del agente); con él abierto, **no se machaca
  el editor** — toast con botón «Cargar» y decide el usuario.

### HUD de contexto en el compositor (idea D4)

Barra bajo el input con la estimación de tokens de la conversación
(≈ chars/4, la métrica que ya usa `usage.ts`) contra una **ventana de
referencia** ajustable (`settings.ventanaCtx`, por defecto 32 000).
Tres niveles: normal / aviso al 80 % (ámbar) / rojo al 95 %. El
「ctx −%」 de cada respuesta llegaba **después** de gastar el contexto;
esto lo enseña **antes**. Es una estimación local y la UI lo dice — no
un dato del proveedor.

### Pestañas de conversación (idea D2, v3.33.0)

Como en un navegador: cada conversación abierta es una pestaña bajo la
cabecera. Cambiar de proyecto sin pasar por la barra lateral y sin
perder el hilo. Cerrar con la X o clic central **quita la pestaña, no
borra la conversación** (sigue en la barra lateral). Al cerrar la
activa, se activa la vecina; al cerrar la última, el lienzo vuelve a
la bienvenida. Tope de 8 pestañas (la más vieja se cae). Solo
escritorio (md+): en móvil la hoja lateral ya cumple ese papel. Patrón
ARIA real (`tablist`/`tab`), no botones, para no colisionar con tests
que localizan botones por nombre. La lógica va pura en `tabs.ts` con
sus tests.

### Bienvenida que trabaja (idea D3, v3.33.0)

Sobre las sugerencias existentes, una fila **contextual** que solo se
pinta si hay algo real que retomar: «Continuar «{última
conversación}»» (la reabre con su contexto delante), «Modelos gratis
de hoy» (abre el radar) y «Descifrar un error» (rellena el compositor
con una plantilla de stack trace, SIN enviar). Nada de ofertas
vacías: sin conversaciones previas, la fila no existe.

### Estética «Aurora» completa (idea D1, v3.33.0)

El `.glass` gana volumen (más blur, línea de luz superior), las
burbujas del chat estrenan `glass-msg` (asistente) y `tint-user`
(usuario, lavado violeta-cian de marca en vez del degradado oscuro),
y el fondo de tres brillos de v3.32 ahora tiene con qué combinarse.
Todo por CSS: el layout no se toca y los E2E de medidas siguen
verdes.

### Fondo aurora, de verdad (idea D1)

`.aurora` llevaba versiones escrito en `globals.css` sin que nadie lo
renderizara. Ahora vive en `layout.tsx`, con tercera capa rosa de
marca, y sigue apagándose con `prefers-reduced-motion`.

### Tests

953 → **1 020** (v3.32) → **1 029 unitarios** (v3.33) en 78 archivos,
todos verdes. Nuevos en v3.32: `tools-v7`, `busqueda-web`, `snapshots`,
`ctx-hud`, `js-repl` y el bloque de persistencia en `agent-tools-loop`.
En v3.33: `tabs` (unit) y `pestanas-welcome` (E2E, 5 escenarios). Los
tests viejos que usaban `search_web` como «herramienta inventada» se
actualizaron al nuevo catálogo (el producto manda; regla §1.6 de
INSTRUCCIONES-V6).

---

## 2. La puerta

| Paso | Estado |
|---|---|
| `npm run lint` | ✓ limpio |
| `npm run build` | ✓ compila y pasa tipos (incluidos `tests/`); `.next/next-server.js.nft.json` existe |
| `npm run test` | ✓ 1 020 / 1 020 |
| `npm run test:e2e` | ver `worklog.md` — depende del entorno |
| `npm run knip` | ✗ en este entorno: `oxc-parser` revienta con `RangeError: Array buffer allocation failed` (memoria del contenedor, no del código) |

---

## 3. Lo que queda de la propuesta (no cabe en esta tanda)

**De las 15 ideas del mockup**, quedan:

- **U1** Prism Sync (gist privado cifrado con el PIN de la bóveda) —
  la de más impacto; usar `github-oauth.ts` + `vault.ts`.
- **U2** biblioteca de snippets reutilizables (`/snip`).
- **U3** plantillas de Sandbox (los ZIP ya se cargan; falta el catálogo).
- **U4** informe semanal (Wrapped) sobre `usage.ts` + Prism Link.
- **U5** cola offline con IndexedDB + service worker.
- **U6** modo presentación de la vista previa (diapositivas por
  `section`/`h2`, mando por QR con `qr.ts`).

(D1, D2, D3 y D4 están hechas: aurora glass + pestañas + bienvenida
contextual + HUD.)

**Y las cinco tareas del PLAN-V6 siguen donde estaban** (ninguna estaba
en `main`): aviso de modelo que deja de ser gratis, orden de fallback
configurable, panel unificado, normalizar bloques de razonamiento y la
quinta del plan. Orden sugerido: primero la 1 y la 2 de V6 (huecos
reales comprobados), luego U1 (Sync), luego el resto de V7.

---

## 4. Cómo probar lo nuevo a mano

1. **HUD**: escribe una conversación larga y mira la barra bajo el
   input; al 80 % se vuelve ámbar.
2. **Agente**: activa el modo agente, pide «crea un index.html con un
   contador y compruébalo» — verás `write_file` + `run_project` en la
   línea de tiempo, y el proyecto aparece en el Sandbox.
3. **edit_file**: pide «cambia solo el título del archivo X» y observa
   que no reescribe el archivo entero.
4. **run_js / read_console**: pide al agente que pruebe una función en
   el REPL antes de escribir el archivo, o que relea los errores de la
   consola tras ejecutar.
5. **search_web / fetch_api**: «busca cómo se usa X en 2026» o «pide la
   temperatura actual de La Habana a open-meteo» (campos
   `current.temperature_2m`).
6. **git_snapshot**: «guarda un punto de restauración antes de
   refactorizar» y luego «vuelve al snapshot s1».

---

## 5. v3.34.0 — Segunda tanda de utilidad (U2, U3, U4, U6)

Las 4 piezas que faltaban del mockup v7, sin tocar nada de lo que ya
funciona. U1 (Prism Sync) y U5 (cola offline) quedan para más adelante
porque piden infra que esta tanda no tiene (gist cifrado + bóveda, e
interceptación del service worker) — conviene hacerlas cuando se
revisitte la bóveda y el SW.

| Idea | Qué hace | Dónde |
|---|---|---|
| **U2** Snippets | Biblioteca de trozos reutilizables (`/snip`): guarda, busca y edita. Snippets de fábrica + los que tú añadas. Atajos cortos (`/snip fn`). Lógica en `snippets.ts` (zustand persist `prism-snippets-v1`), UI en `snippets-dialog.tsx`. | `src/lib/prism/snippets.ts` + `src/components/prism/snippets-dialog.tsx` |
| **U3** Plantillas | Catálogo de los ZIPs que ya viven en `/public` (`demo-sandbox.zip`, `demo-modulos.zip`): nombre, qué enseña, de dónde viene. Un clic abre el Sandbox con el ZIP cargado (prop `initialZipUrl` nueva en `SandboxStudio`). | `src/lib/prism/templates.ts` + `src/components/prism/templates-dialog.tsx` |
| **U4** Wrapped | Informe semanal sobre `usage.ts`: peticiones, éxito, latencia, ahorro por compresión, top modelos, día más activo. Botón de descarga como HTML autocontenido (estilo Prism Link). | `src/lib/prism/wrapped.ts` + `src/components/prism/wrapped-dialog.tsx` |
| **U6** Presentación | Convierte el HTML de la vista previa en diapositivas (una por `<section>` o por `<h2>`) y las muestra a pantalla completa con flechas, teclado y mando por QR. | `src/lib/prism/slides.ts` + `src/components/prism/presentation-dialog.tsx` |

### Detalles que importan

- **Slash.** Cuatro comandos nuevos: `/snip`, `/plantillas`, `/wrapped`,
  `/presentar`. Cada uno abre su diálogo desde `chat-app.tsx`.
- **Plantillas.** El Sandbox ya sabía abrir ZIPs; lo nuevo es la
  prop `initialZipUrl` que carga desde una URL pública sin pasar el
  File por chat-app — más limpio y reutilizable.
- **Wrapped.** Toda la lógica es pura (`computeWrapped`, `ahorroPct`,
  `wrappedToHtml`) para poder probarla en Node. El HTML lleva el
  lenguaje visual del mockup (aurora + glass) y se abre con doble clic.
- **Presentación.** El parser es intencionalmente simple: lo que llega
  ya es HTML válido. Si no hay `<section>` ni `<h2>`, una diapositiva
  con todo. El QR usa la API pública de goqr (sin clave) y solo se
  pide bajo botón explícito.
- **Mockup.** El HTML de la propuesta v7 se incluye en
  `/public/propuestas/prism-ai-propuesta-v7-mockup.html` (borrado del repo
  en la limpieza de la v3.35.2: era un mockup de trabajo publicado en el
  sitio público) para que
  viaje con el zip y se pueda abrir desde la app servida.

### Puerta

- ✓ `npm run lint` (0 errores, 0 avisos en lo nuevo)
- ✓ `npm run build` (compila y pasa tipos, incluye tests)
- ✓ `npx tsc --noEmit`
- ✓ `npm run test`: 1 029 → **1 076** unitarios en 82 archivos
  (+47 nuevos: 15 snippets, 9 templates, 14 wrapped, 9 slides)
- E2E: no se tocaron los existentes; los nuevosslash son accionables
  por diálogo y no por nombre de botón, así que los selectores viejos
  siguen funcionando.

### Cómo probar lo nuevo a mano

1. `/snip` → abre la biblioteca; pulsa «Insertar» en cualquiera y
   aparece en el compositor sin enviarse.
2. `/plantillas` → elige «Web modular» y verás el Sandbox abrirse con
   3 archivos cargados.
3. `/wrapped` → enseña tus métricas de los últimos 7 días; «Descargar
   HTML» te da un informe autocontenido.
4. Genera una web con varios `<section>` o `<h2>` y `/presentar` →
   diapositivas a pantalla completa con flechas y QR de mando.

