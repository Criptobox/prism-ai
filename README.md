<div align="center">

<img src="public/logo.svg" alt="Prism AI" width="88" />

# Prism AI

**Un prisma, todos tus modelos.** Chat PWA premium con tus propias APIs · solo modelos gratis · vista previa web en vivo · sin cuentas, sin servidores, sin límites.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PWA](https://img.shields.io/badge/PWA-instalable-5A0FC8?logo=pwa)](https://developer.mozilla.org/es/docs/Web/Progressive_web_apps)
[![CI](https://img.shields.io/badge/CI-lint%20%2B%20build-emerald?logo=githubactions)](.github/workflows/ci.yml)
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
| 👁 **Vista previa en vivo** | Si la IA genera HTML, lo ves renderizarse mientras escribe, con pestañas Vista / Código / Mapa. |
| 🤖 **Modo agente con bucles** | Plan → ejecutar → revisar en iteraciones (estilo Claude Code), con línea de tiempo visible. |
| 🧠 **Mapa del proyecto** | Memoria compacta por sesión que se inyecta en el contexto: continúa proyectos gastando muchos menos tokens. |
| 🖼 **Imágenes multimodales** | Adjunta hasta 6 imágenes por mensaje (se redimensionan en local). |
| 📚 **Prompts y Skills** | Biblioteca de 12 prompts integrados y skills instalables que potencian el system prompt. |
| 📂 **Repo Studio** | Pega un repo de GitHub: si ya lo descargaste se abre, si no se clona solo. Edita sus archivos, **corrígelos con IA** y sube los cambios (commit directo o repo nuevo). |
| 📤 **Exportar chats** | Descarga cualquier conversación en **Markdown** o genera un **PDF** formateado (con imágenes) desde el botón de exportar. |
| 🎨 **Temas de acento** | 6 paletas premium + **color personalizado**: cualquier tono genera su degradado coordinado al instante. |
| 🎙 **Voz integrada** | Dicta mensajes con tu micrófono (español) y escucha las respuestas en voz alta, con lectura automática opcional. |
| 📲 **PWA instalable** | Instálala como app nativa en escritorio, Android e iOS. Funciona offline con su service worker. |
| ⬆ **Subida a GitHub** | Sube carpetas de cualquier tamaño desde la app, por lotes y sin el límite de 100 archivos de la web. |
| ⚙️ **CI incluida** | GitHub Actions lista para validar lint + build en cada push. |

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
6. **Exporta** cualquier chat a Markdown/PDF (botón de descarga en la cabecera) y **dicta** con el micrófono de la caja de texto.
7. **Exporta tu backup** desde la barra lateral antes de limpiar el navegador.

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

## 📄 Licencia

[MIT](LICENSE) — usa, modifica y comparte libremente.
