<div align="center">

<img src="public/logo.svg" alt="Prism AI" width="88" />

# Prism AI

**Un prisma, todos tus modelos.** Chat PWA premium con tus propias APIs · solo modelos gratis · vista previa web en vivo · sin cuentas, sin servidores, sin límites.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PWA](https://img.shields.io/badge/PWA-instalable-5A0FC8?logo=pwa)](https://developer.mozilla.org/es/docs/Web/Progressive_web_apps)
[![CI](https://img.shields.io/badge/CI-build%20%2B%20test-emerald?logo=githubactions)](.github/workflows/ci.yml)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-emerald)](LICENSE)

</div>

---

Prism AI es un chat de IA **100% local y privado**: tus claves API se guardan únicamente en tu dispositivo (localStorage), las peticiones van directas al proveedor o por el proxy incluido, y no existe ningún sistema de cuentas. Trae tu propia clave (BYOK) de AiHubMix, Gemini, Groq, OpenRouter y más — y Prism AI se encarga de mostrarte **solo los modelos gratis disponibles**, con radar de ofertas, failover automático y vista previa web en tiempo real de lo que la IA construye.

## ✨ Características

| | |
|---|---|
| 🔓 **Sin login ni servidores** | Todo vive en tu navegador. Exporta/importa tu backup JSON cuando quieras. |
| 🆓 **Solo modelos gratis** | Filtro «Solo gratis» activado por defecto: 27+ modelos `-free` de AiHubMix, `:free` de OpenRouter, Gemini, Groq, GLM-Flash, Ollama local… |
| 📡 **Radar de modelos gratis** | Ofertas vigentes (con fechas límite), 12 fuentes permanentes, lista **EN VIVO** de OpenRouter y activación de modelos en 1 clic. |
| 🛡 **Failover automático** | ¿Cuota agotada? Prism avisa y reintenta solo con otro modelo gratis conectado. |
| 🛡 **Escudo PII local** | Enmascara correos, teléfonos, tarjetas (Luhn), IBAN y DNI/NIE en lo que se envía al modelo — activado por defecto, tu texto visible no cambia. |
| 🖥 **Copiar como cURL** | Registro de las últimas peticiones con su estado y latencia: copia cualquier llamada como comando curl con las claves redactadas a `TU_API_KEY`. |
| ⚡ **Auto (router gratis)** | Un pseudo-modelo que elige el mejor candidato gratis (LKGP: el último que funcionó va primero), salta al siguiente si falla y respeta los cooldowns — inspirado en el `auto` de OmniRoute. |
| 💓 **Salud de modelos** | Circuit breaker ligero: tras un 429/5xx el modelo se «enfría» (respeta Retry-After, backoff exponencial) y el failover/Auto lo saltan. Badge de segundos en el selector. |
| 🗜 **Compresión de contexto** | Modos Lite y Estándar (tipo RTK/Caveman) que reducen el historial un 15-50%: código, URLs y JSON intactos, tu pregunta actual nunca se toca. Chip «ctx −%» en cada respuesta. |
| 📊 **Uso local** | Métricas por modelo: peticiones, éxito, latencia media y p95, volumen y ahorro de compresión. Todo en tu navegador, nada sale del dispositivo. |
| 🎛 **Estilos de respuesta** | Normal, Conciso o Detallado (output styles): da forma a cómo responde el modelo en todos los chats. |
| 👁 **Vista previa en vivo** | Si la IA genera HTML, lo ves renderizarse mientras escribe, con pestañas Vista / Código / Mapa. |
| 🕸 **Grafo del proyecto (Obsidian)** | La memoria del proyecto se dibuja como un grafo de fuerzas estilo Obsidian: arrastra nodos, zoom/pan, filtra por tipo, busca y pasa el ratón para iluminar vecinos. Relaciones reales entre archivos (enlaces `<a>`, `<script>`, `<link>`) más funcionalidades y tech por archivo. |
| 📝 **Notas de memoria + historial** | Fija reglas del proyecto («el tema es azul») que la IA respeta en cada respuesta, revisa backlinks y huérfanos, y viaja en el tiempo con el historial del mapa (hasta 6 versiones restaurables). |
| 🤖 **Modo agente con bucles** | Plan → ejecutar → revisar en iteraciones (estilo Claude Code), con línea de tiempo visible. |
| ⚔️ **Arena de modelos** | El mismo prompt a 2-3 modelos gratis en paralelo, lado a lado con tiempo y tamaño. |
| 🖌 **Modo imagen** | Describe lo que quieres ver y se genera al instante con Pollinations — gratis y sin clave. |
| 📄 **Documentos (PDF/TXT)** | Adjunta PDFs: el texto se extrae en local con pdf.js y viaja como contexto al modelo. |
| 📊 **Hojas de cálculo** | CSV, TSV, XLSX y XLS se leen **en tu dispositivo** (xlsx bajo demanda) y llegan al modelo como tablas markdown — el archivo no sale de aquí. |
| ⌨️ **Comandos slash** | Escribe `/` y sale el menú (filtra en vivo, flechas + Enter + Esc): `/imagen`, `/agente`, `/resumen`, `/arena`, `/html`, `/nuevo`, `/snip`, `/plantillas`, `/wrapped` y `/presentar`. |
| 🎨 **Diseños que no se repiten** | Skill activa por defecto: cada web nueva estrena estilo, composición y tipografía. Una web nueva no puede ser la anterior con otro color. |
| 🧘 **Modo foco (zen)** | Un icono en la cabecera esconde barra lateral y vista previa y evita que el split se abra solo. Se recuerda entre sesiones. |
| 🌗 **Tema Claro / Oscuro / Sistema** | Tres opciones en la cabecera y en la barra lateral. Por defecto sigue al sistema. |
| 🌍 **Resumir y traducir** | «Resumir hasta aquí» en la cabecera y «Traducir respuesta» (EN/FR/PT/DE/IT/JA) en cada burbuja. |
| 🔐 **Bóveda con PIN** | Cifrado opcional AES-GCM: sin el PIN, las claves no se pueden leer aunque extraigan el navegador. |
| ⌨️ **Atajos de teclado** | `Ctrl+K` modelo · `Ctrl+Shift+A` Arena · `Ctrl+Shift+E` exportar · `/` comandos · `?` cheat sheet. |
| 🌿 **Regenerar no borra** | Cada regeneración guarda la anterior como rama: las flechas del mensaje te llevan entre versiones (`2/3`) para comparar. Editar un mensaje tuyo tampoco destruye lo que venía después. |
| 🧵 **Hilos** | Archiva el tema actual y empieza otro **dentro de la misma conversación**, sin arrastrar contexto que ya no viene a cuento ni llenar la lista de conversaciones. |
| ▶️ **Continuar al agente** | Si el modo agente se queda a medias —revisión pendiente o sin cerrar—, se dice y se ofrece retomar desde donde lo dejó, en vez de dejar el trabajo colgado en silencio. |
| 🔗 **Prism Link** | Comparte cualquier chat como página HTML autocontenida que se abre con doble clic. |
| 📚 **Snippets** (`/snip`) | Biblioteca de trozos reutilizables: tus prompts parciales, plantillas de función y cabeceras, con atajos cortos (`/snip fn`). Viven en tu navegador. |
| 📦 **Plantillas del Sandbox** (`/plantillas`) | Catálogo de los ZIPs de demo (web de una página, web modular): un clic y el Sandbox abre con el proyecto cargado. |
| 📊 **Wrapped semanal** (`/wrapped`) | Informe de tu actividad de los últimos 7 días (peticiones, éxito, latencia, ahorro por compresión, top modelos). Descargable como HTML autocontenido. |
| 🎞 **Modo presentación** (`/presentar`) | Convierte el HTML de la vista previa en diapositivas (por `<section>` o `<h2>`), a pantalla completa con flechas, teclado y mando por QR. |
| 🧩 **Skills por URL** | Instala skills desde cualquier .md/.json en raw.githubusercontent o un gist. |
| 🛡 **Permisos de las Skills** | Antes de instalar, Prism analiza el texto y te muestra qué declara hacer: generar código, cargar recursos de internet (y de qué dominios), pedir claves o enviar datos a servidores. Lo de riesgo no se instala sin aceptación expresa de dos pasos, el permiso queda visible en la lista para siempre y viaja al system prompt como techo: la skill no puede colar claves ni envíos de datos por encima del usuario. |
| 🧪 **Tests** | 1 076 tests unitarios (Vitest) y 131+ escenarios E2E con Playwright, **todos en CI en cada push** (`npm run test` / `npm run test:e2e`). |
| 🧠 **Mapa del proyecto** | Memoria compacta por sesión que se inyecta en el contexto: continúa proyectos gastando muchos menos tokens. |
| 🪪 **Ficha del proyecto** | La portada del mapa convertida en tarjeta de un vistazo: pila con nº de archivos, punto de entrada, archivo núcleo, notas y páginas huérfanas — calculada del código, nunca inventada. El agente la lee ANTES de trabajar: llega al proyecto con la pila y las decisiones ya dentro. |
| 🖼 **Imágenes multimodales** | Adjunta hasta 6 imágenes por mensaje (se redimensionan en local). |
| 📚 **Prompts y Skills** | Biblioteca de 12 prompts integrados y skills instalables que potencian el system prompt. |
| 📂 **Repo Studio** | Conecta un repo de GitHub y trabaja **directo, sin descargar**: edita en vivo, crea archivos y haz push en **1 solo commit** (Git Data API). Si prefieres tocar el disco, el modo clonado sigue ahí. Con IA para corregir código. |
| 📦 **Sandbox (estilo Spck)** | Carga un ZIP (o manda ahí un repo), **navega el proyecto por carpetas**, edítalo y **ejecútalo**: las webs estáticas corren en un marco aislado con consola integrada y los recursos locales se inlinean solos. Exporta el ZIP con tus cambios. |
| 🧩 **Módulos ES sin empaquetador** | El Sandbox ejecuta proyectos que reparten el código en módulos que se importan entre sí (`import { x } from "./util.js"`), a cualquier profundidad y con ciclos, reescribiendo los especificadores y sirviéndolos por un import map. Sin `npm install` y sin build. |
| 🛡 **Revisión antes de subir** | Analiza el proyecto entero y te dice qué rompería en GitHub: **claves de API olvidadas**, archivos privados (`.env`, `*.pem`, claves SSH), enlaces locales rotos, JSON/JS/CSS con sintaxis rota, HTML sin charset ni viewport, imágenes sin `alt`, colisiones de mayúsculas y archivos por encima del límite. Cada aviso te lleva al archivo y a la línea. |
| 🚦 **La revisión es una puerta, no un rincón** | **Los tres caminos que suben código a GitHub pasan por ella**: la subida de carpetas, el push de Repo Studio y la publicación como repo nuevo. Con una credencial detectada el botón no sube nada hasta que la corriges o asumes el riesgo a mano — y ese permiso vale **solo para los hallazgos que viste**: si aparece otro distinto, la puerta se cierra otra vez. |
| 🔁 **Del repo al Sandbox y de vuelta** | «Todo el repo al Sandbox» trae el proyecto entero (una sola petición) para revisarlo con todos sus archivos delante; «Subir» lo devuelve ya corregido a GitHub —con sus binarios— sin pasar por exportar y volver a subir. |
| 🔍 **Ves qué cambias, no cuántos archivos** | Pestaña **Cambios** en el Sandbox y botón «Ver cambios» en Repo Studio: diff real línea a línea, con contexto y numeración de los dos lados, antes de exportar o subir. |
| 📈 **Regresión visible** | Cada «Ejecutar» del Sandbox deja una instantánea medida (errores de consola, QA móvil, peso del HTML). Vuelve a ejecutar tras un cambio y la pestaña **Regresión** dice qué rompió, qué arregló y qué pasó con el QA móvil — un antes y un después medidos, no una opinión. Sin datos de un lado, lo dice; no compara con inventos. |
| 🕵 **También dentro de los binarios** | La revisión saca las cadenas de texto de un PDF o una imagen y les pasa las mismas reglas de credenciales: una clave escondida en un adjunto ya no viaja de tapadillo. |
| ⚡ **Revisión incremental** | Al editar solo se reanaliza el archivo tocado. En un repo de 1500 archivos, de ~250 ms por pausa al escribir a **menos de 2 ms**. |
| 📤 **Exportar chats** | Descarga cualquier conversación en **Markdown** o genera un **PDF** formateado (con imágenes) desde el botón de exportar. |
| 🎨 **Temas de acento** | 6 paletas premium + **color personalizado**: cualquier tono genera su degradado coordinado al instante. |
| 🎙 **Voz integrada** | Dicta mensajes con tu micrófono (español) y escucha las respuestas en voz alta, con lectura automática opcional. |
| 📲 **PWA instalable** | Instálala como app nativa en escritorio, Android e iOS. Funciona offline con su service worker. |
| ⬆ **Subida a GitHub** | Sube carpetas de cualquier tamaño desde la app, por lotes y sin el límite de 100 archivos de la web. |
| ⚙️ **CI incluida** | GitHub Actions lista para validar lint + build en cada push. |
| ✂️ **Edición quirúrgica (`edit_file`)** | El agente cambia solo el fragmento exacto que le pides, no reescribe el archivo entero: menos tokens y menos riesgo. Si el fragmento es ambiguo, se niega y pide uno único (o `all: true`). |
| ⚡ **REPL del agente (`run_js`)** | Prueba funciones y cálculos en un iframe aislado antes de escribir el archivo. Contrato simple: asigna la variable `resultado` o usa console.log. 5 s de techo y serializador propio. |
| 👁 **`read_console`** | El agente relee la consola del último `run_project` (con nivel y filtro) sin reejecutar el proyecto: autocorrección en la misma iteración. |
| 🔍 **Búsqueda web (`search_web`)** | Encuentra la página antes de leerla: HTML de DuckDuckGo por el proxy anti-SSRF, sin claves. Anuncios fuera y sin resultados inventados. |
| 🧲 **JSON a la carta (`fetch_api`)** | Pide APIs públicas y recibe solo los campos pedidos (rutas de puntos): menos tokens, cero alucinación. Lo que no existe dice «sin dato». |
| 🕰 **Puntos de restauración (`git_snapshot`)** | El agente guarda el estado del proyecto (create/list/restore) antes de cambios grandes: «vuelve al snapshot s1» y adiós al miedo de romper. |
| 🔁 **El bucle del agente ya no pierde su trabajo** | Antes un `write_file` de una iteración desaparecía en la siguiente y nada llegaba al Sandbox. Ahora el contexto es uno por bucle y lo editado se vuelca al Sandbox (con él abierto, lo decides tú). |
| 📊 **HUD de contexto** | Barra bajo el compositor con los tokens estimados de la conversación contra tu ventana de referencia (ajustable): aviso al 80 % y rojo al 95 % — ANTES de gastar el contexto, no después. |
| 🌌 **Fondo aurora** | Tres brillos lentos de marca (violeta, cian, rosa) que siempre estuvieron en el CSS sin renderizarse. Ahora sí, y se apagan con `prefers-reduced-motion`. |
| 🗂 **Pestañas de conversación** | Como en un navegador: cada conversación abierta es una pestaña bajo la cabecera. Cambias de proyecto sin pasar por la lista; cerrar la pestaña NO borra la conversación (clic central también cierra). Solo escritorio. |
| 🚀 **Bienvenida que trabaja** | La pantalla vacía te ofrece «Continuar «tu última conversación»» (la reabre con su contexto delante), «Modelos gratis de hoy» (abre el radar) y «Descifrar un error» (te planta la plantilla del stack trace en el compositor, sin enviar). Solo si hay algo real que retomar. |
| 🪟 **Aurora glass** | El `.glass` gana volumen y las burbujas estrenan cristal: la del asistente es translúcida y la tuya, un lavado violeta-cian de marca. Todo por CSS, el layout intacto. |

## 🔒 Si lo publicas en internet

Prism funciona en tu navegador, pero tiene tres rutas que corren en el servidor.
Al desplegarlo en Vercel o un VPS quedan expuestas, así que:

- **`/api/proxy`** solo acepta destinos públicos. Las direcciones privadas, el
  bucle local y los metadatos de la nube (`169.254.169.254`, que devuelven
  credenciales de la instancia) están bloqueados, y las redirecciones se
  revalidan salto a salto.
- **`/api/repos`** clona, lee y **escribe** en el disco del servidor. En
  producción queda **desactivada** salvo que definas `PRISM_ACCESS_CODE`.
- Ninguna ruta acepta peticiones desde otra web.

Define `PRISM_ACCESS_CODE` en tu proveedor y cópialo en **Ajustes → Chat**.
Mira [`.env.example`](.env.example) para el detalle.

## 🚀 Instalación en 3 pasos

> Requisito único: [Node.js 20.9+](https://nodejs.org) (incluye npm).

```bash
# 1) Clona el repositorio
git clone https://github.com/TU_USUARIO/prism-ai.git
cd prism-ai

# 2) Instalación automática (dependencias + entorno)
npm run setup

# 3) Arranca la app
npm run dev
```

Abre **http://localhost:3000** — el asistente de primera ejecución te guiará para conectar tu clave gratis en menos de un minuto. 🎉

### Instalador con doble clic

Si prefieres no usar la terminal, abre según tu sistema y sigue el asistente:

| Sistema | Archivo |
|---|---|
| Windows | `setup.bat` (doble clic) |
| macOS / Linux | `./setup.sh` |

El instalador (`npm run setup`) comprueba tu versión de Node, instala las dependencias, crea `.env.local` desde `.env.example` y te muestra los siguientes pasos.

### Producción local

```bash
npm run build
npm start        # sirve el build optimizado en http://localhost:3000
```

## 🔑 Claves gratis en 1 minuto

Prism AI funciona con **tu propia clave** (BYOK). Recomendados con capa gratuita:

| Proveedor | Consigue tu clave | Notas |
|---|---|---|
| **AiHubMix** ⭐ | [aihubmix.com/apikey](https://aihubmix.com/apikey) | Una clave → 27+ modelos `-free` (incluye **Kimi K3 gratis**, ctx 1M). Cuenta nueva sin recargar: 10 intentos; con una recarga pequeña quedan límites diarios generosos. |
| **Google Gemini** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Capa gratuita completa, sin recargar nada. |
| **Groq** | [console.groq.com/keys](https://console.groq.com/keys) | Inferencia ultrarrápida, gratis, incluye Kimi K2. |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | Decenas de modelos con sufijo `:free`. |
| **GLM · Z.ai** | [z.ai](https://z.ai/manage-apikey/apikey-list) | GLM-4.5-Flash gratis. |
| **Ollama (local)** | [ollama.com](https://ollama.com) | Modelos en tu equipo, cero coste, sin clave. |

Pega las claves en **Ajustes → Proveedores** (o deja que el asistente inicial haga el trabajo). El **Radar** de la barra lateral te avisa de nuevas ofertas gratis y activa modelos con 1 clic.

## 📲 Instalar como app (PWA)

- **Escritorio (Chrome/Edge):** icono «Instalar» en la barra de direcciones, o el botón «Instalar Prism AI» dentro de la app.
- **Android:** menú del navegador → «Instalar aplicación».
- **iOS (Safari):** Compartir → «Añadir a pantalla de inicio».
- **Desde el móvil en tu red local:** `npm run dev -- -H 0.0.0.0` y entra desde el móvil a `http://TU_IP_LOCAL:3000`.

## 🧭 Uso rápido

1. **Elige modelo** en el selector superior (badge GRATIS = verificado gratis).
2. **Pide una página** («crea una landing para una cafetería») y mira la **vista previa en vivo** a la derecha.
3. **Activa el agente** (botón de bucles en la caja de texto) para tareas largas con plan → ejecutar → revisar.
4. **Abre el Radar** para descubrir modelos gratis del momento.
5. **Repo Studio** (barra lateral): pega `usuario/repo` para clonarlo o reabrirlo, edita archivos y corrígelos con IA.
6. **Escribe `/`** en la caja de texto para los comandos rápidos, y adjunta un **CSV o Excel** para que el modelo lo analice (se lee en tu dispositivo).
7. **Resume** la conversación con el botón de la cabecera o **traduce** cualquier respuesta desde su burbuja.
8. **Exporta** cualquier chat a Markdown/PDF (botón de descarga en la cabecera) y **dicta** con el micrófono de la caja de texto.
9. **Exporta tu backup** desde la barra lateral antes de limpiar el navegador.

## 📁 Estructura del proyecto

```
prism-ai/
├── setup.sh / setup.bat        # instaladores con doble clic
├── scripts/
│   └── setup.mjs               # instalador multiplataforma (npm run setup)
├── src/
│   ├── app/                    # Next.js App Router (ruta única / + APIs)
│   │   ├── api/proxy/          # proxy anti-CORS transparente (no guarda nada)
│   │   ├── api/free-radar/     # lista EN VIVA de modelos :free (OpenRouter)
│   │   ├── api/repos/          # Repo Studio: abrir/clonar/listar/leer/guardar
│   │   └── api/mock-llm/       # mock para pruebas E2E
│   ├── components/prism/       # UI: chat, radar, onboarding, repos, ajustes, agente…
│   └── lib/prism/              # motor: store, proveedores, gratis, agente, voz, temas…
├── .github/workflows/          # CI (lint + build)
├── public/                     # PWA: manifest, service worker, iconos, logo
└── prisma/                     # esquema (opcional, SQLite local)
```

## 🛠 Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run setup` | instalación automática (Node, deps, `.env.local`) |
| `npm run dev` | desarrollo con recarga en caliente → `localhost:3000` |
| `npm run build` | build de producción (standalone) |
| `npm start` | sirve el build de producción |
| `npm run lint` | revisión de código con ESLint |

## ❗ Problemas frecuentes

| Síntoma | Solución |
|---|---|
| Puerto 3000 ocupado | `npm run dev -- -p 3001` |
| «Necesita tu API key» | Ajustes → proveedor → pega la clave (o reabre la **Guía inicial** en la barra lateral) |
| AiHubMix responde «10 times» | Cuenta sin recargar: recarga saldo mínimo o usa Gemini/Groq (gratis) — Prism hará failover solo |
| Repo privado no clona | Pega tu token de GitHub en Repo Studio (scope `repo`) |
| «Subir cambios» da 403 | El repo original no es tuyo: usa «Publicar como repo nuevo» |
| El dictado no funciona | Usa Chrome/Edge/Safari y permite el micrófono |
| La app no actualiza tras cambios | Es el service worker: recarga 2 veces (ya usa network-first) |
| Perder datos al limpiar el navegador | Botón «Exportar» en la barra lateral crea un backup JSON |

## 🔒 Privacidad

- Las claves API se guardan **solo en tu dispositivo** (localStorage) y viajan cifradas en HTTPS directo al proveedor, o por el proxy local que no almacena nada.
- Conversaciones, prompts, skills y ajustes nunca salen de tu navegador.
- Repo Studio descarga los repos en `workspace/repos/` de tu equipo; la edición y la subida a GitHub pasan por tu token local.
- El dictado y la lectura por voz usan las APIs nativas del navegador: el audio no se envía a ningún servidor de Prism.
- El Radar consulta el endpoint público de OpenRouter desde el servidor local de Next (sin clave) y cachea 10 minutos.

### Los Excel se abren en un hilo desechable

`npm audit` avisa de dos vulnerabilidades altas en `xlsx` (SheetJS):
contaminación de prototipos y ReDoS. **No tienen arreglo en npm**, así que la
decisión está tomada y escrita aquí en vez de dejar el aviso saltando en cada
auditoría:

- `xlsx` se carga **bajo demanda**, solo al adjuntar un `.xlsx/.xls`. Si nunca
  adjuntas uno, no se descarga. CSV y TSV usan un parser propio sin dependencias.
- El archivo se abre en un **Web Worker que se destruye al terminar**. Las dos
  vulnerabilidades se disparan al leer un archivo preparado, y en un Worker eso
  pasa en otro *realm*: lo que se contamine muere con el hilo y no toca al de la
  app, donde están tus claves. Del Worker solo salen cadenas de texto.
- Hay un tope de **15 MB** y un límite de **20 segundos**, tras el cual el hilo
  se mata. Un ReDoS cuelga ese hilo, no la interfaz.
- Si el navegador no deja crear el Worker, Prism **falla con un aviso** y te
  pide un CSV, en vez de leerlo por el camino inseguro «por comodidad».

Si prefieres no tener la dependencia, quita `xlsx` de `package.json` y borra
la rama `excel` de `src/lib/prism/sheets.ts`: CSV y TSV seguirán funcionando.

## 📄 Licencia

[MIT](LICENSE) — usa, modifica y comparte libremente.

## 🙌 Créditos

- **v3.12 — El piloto del Sandbox**: la mitad del «browser agent» que de verdad se puede construir desde una pestaña: el agente opera DENTRO de la vista previa que Prism sirve — pulsar por selector o por texto visible, escribir en campos (con las mayúsculas y acentos intactos), cambiar el ancho del viewport, leer la página (botones, enlaces, campos) y la consola paso a paso. Los pasos se escriben en un mini-lenguaje de una línea (`pulsa "Añadir"`, `escribe "Hola" en #nombre`, `ve a 320px`, `lee`, `qa`); cada uno deja un resultado honesto —ok, fallido y qué errores nuevos soltó— y el informe final se copia para pegárselo al agente del chat, que corrige y la prueba se vuelve a pasar. Runtime inyectado por `postMessage`, sin `eval`: tres operaciones fijas que no pueden hacer más que lo que haría un usuario.
- **v3.11 — Medir, declarar y recordar**: la ficha del proyecto (Project Passport) presenta la memoria como una tarjeta y el agente la lee antes de trabajar; las skills declaran permisos y la instalación de riesgo exige aceptación expresa (un permiso que nadie hace cumplir es una etiqueta, no una barrera); y el Sandbox compara ejecuciones: qué rompió o arregló tu último cambio, medido. Las tres ideas salieron del análisis del plan de evolución: presentación sobre datos que ya existían, una puerta donde antes había un campo de texto, y comparar lo que ya se medía.
- **v3.4 — Nada se pierde**: regenerar y editar pasan a bifurcar en vez de borrar, llegan los hilos dentro de una conversación, «Nueva conversación» deja de crear sesiones vacías y el agente ofrece continuar cuando se queda a medias. Ideas tomadas del diseño de [Chatbox](https://github.com/chatboxai/chatbox) (GPLv3) y **reimplementadas desde cero**: aquí no hay código suyo, solo lo aprendido de sus documentos técnicos.
- **v3.3 — Ver antes de subir**: el diff línea a línea entra en el Sandbox y en Repo Studio, la revisión mira también dentro de los binarios y pasa a ser incremental (de ~250 ms por pausa al escribir a menos de 2 ms en un repo grande). Los E2E dejan de ser manuales: vigilan cada push.
- **v3.2 — La revisión como puerta**: la revisión deja de vivir solo en el Sandbox y se pone delante de los tres caminos que suben código a GitHub; el repo entra y sale del Sandbox entero, y el Sandbox aprende a ejecutar módulos ES con un import map en vez de rendirse ante el primer `import`.
- **v3.1.1 — Sandbox revisor**: el Sandbox pasa de «abre un ZIP» a espacio de trabajo — árbol de carpetas, editor con números de línea, pestañas de Vista/Revisión/Consola y, sobre todo, una **revisión estática del proyecto entero** pensada para lo que de verdad duele: subir una clave de API a un repo público. Se ejecuta en tu navegador, sin mandar el proyecto a ningún sitio.
- **v3.1 — Edición Obsidian**: el grafo de relaciones del mapa (física de fuerzas, resaltado de vecinos, filtros por tipo y búsqueda), las notas de memoria, los backlinks/notas huérfanas y el historial de versiones están inspirados en [Obsidian](https://obsidian.md), adaptados a la memoria de proyectos que genera tu IA.
- **v3.0 — Repo directo + Sandbox**: Repo Studio trabaja ahora **sin descargar nada** (árbol + lectura + commit único por Git Data API desde el navegador, con sincronización automática del HEAD) y llega el **Sandbox** estilo [Spck Editor](https://spck.io): ZIP → explorar → editar → ejecutar con consola, en un iframe aislado y con exportación del proyecto modificado. Si el repo está conectado a Vercel/Netlify, cada push se despliega y publica solo.
- **v2.9 — Edición Orca**: el escudo PII (guardrails antes de enviar) y el «Copiar como cURL» de los request logs están inspirados en [OrcaRouter](https://www.orcarouter.ai/blog/openrouter-alternative), implementados 100% en local. Sobre las comisiones que motiva su artículo: Prism no cobra nada — modelos gratis y tus propias claves.
- **v2.8 — Router & compresión**: las ideas de salud de modelos (circuit breaker + cooldown con Retry-After), LKGP, el pseudo-modelo `Auto`, la compresión de contexto (RTK/Caveman) y el panel de uso están inspiradas en [OmniRoute](https://github.com/diegosouzapw/OmniRoute), adaptadas a un navegador sin backend.
- Prism AI mantiene su filosofía: **solo modelos gratis, cero cuentas, todo local**.
