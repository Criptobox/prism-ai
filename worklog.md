---
Task ID: 2
Agent: Super Z (main agent)
Task: Prism AI v2 — solo modelos gratis, vista previa en vivo, biblioteca de prompts, adjuntar imágenes, skills instalables, fix de bucle degenerado y fix de SW con caché vieja.

Work Log:
- Verifiqué con la doc oficial que AiHubMix subsidia 27+ modelos gratis con sufijo «-free» (gpt-5.5-free, gpt-4.1-mini-free, gemini-3-flash-preview-free, glm-4.7-flash-free, deepseek-v3-free…). OpenRouter usa «:free»; Gemini/Groq/Ollama capa gratuita completa.
- Motor de gratis: src/lib/prism/free-models.ts (isFreeModel/filterFreeModels + CURATED_FREE). types.ts: settings.onlyFree (default true) + MAX_RENDER_CHARS=8000. providers.ts: defaultModels solo gratis + taglines actualizadas. store.ts: merge profundo para migraciones.
- model-picker.tsx: interruptor «Solo gratis», badges GRATIS, pie «N de M (filtro gratis)», buscador por texto.
- settings-dialog.tsx: switch «Solo modelos gratis» en Chat; al cargar modelos muestra «N gratis de M».
- Vista previa en vivo: lib/prism/preview.ts (extractPreviewHtml detecta ```html cerrado o en curso y doctype suelto), components/prism/preview-panel.tsx (iframe sandbox allow-scripts, debounce 400ms en streaming, badge EN VIVO, escritorio/móvil 390px, recargar, ver código, abrir pestaña, descargar .html), chat-app.tsx integra split ResizablePanelGroup (55/45) + Sheet en móvil + auto-apertura al detectar HTML.
- Adjuntos: lib/prism/attachments.ts (redimensiona a 1152px, JPEG/PNG, guarda GIF pequeños tal cual), chat-input.tsx (ImagePlus, pegar desde portapapeles, miniaturas size-16 con quitar), chat-client.ts multimodal para openai (image_url), anthropic (image base64) y gemini (inlineData); message.tsx miniaturas size-24 clicables.
- Biblioteca de prompts: lib/prism/prompts-data.ts (12 integrados en 5 categorías), prompt-library.tsx (buscar, filtrar, crear, eliminar, insertar en input), accesos en chat-input y sidebar.
- Skills: lib/prism/skills-data.ts (6 integradas, Desarrollador web experto activada por defecto), skills-dialog.tsx (activar/desinstalar/crear), chat-app compone systemPrompt + skills activas.
- Fix del error reportado (bucle "strapon"): message.tsx recorta render a 8000 chars con «Mostrar todo», detecta bucle degenerado por repetición y muestra aviso con sugerencia de regenerar; razonamiento limitado a 4000.
- FIX CRÍTICO: el SW v3 cache-first servía CSS/JS viejos tras actualizaciones (por eso el usuario veía la versión antigua). sw.js v4: todo network-first con fallback a caché, activate purga caches v3.
- E2E agent-browser: filtro gratis (2 de 4), vista previa EN VIO renderizando página generada y JS del sandbox funcional (contador=3), biblioteca inserta prompts, skills lista y switch, imagen adjunta via DataTransfer → proxy → mock multimodal responde (image_url). Lint y tsc limpios tras fixes (set-state-in-effect, regex s-flag, disables sobrantes).
- Empaquetado: download/prism-ai-v2-codigo-fuente.zip (src, public, prisma, scripts, examples).

Stage Summary:
- Prism AI v2 entregada y verificada E2E: solo modelos gratis por defecto, vista previa en tiempo real de páginas que genera la IA, biblioteca de prompts, skills instalables, imágenes multimodales, protección anti-bucle y SW que siempre entrega la versión nueva.
- Clave del bug reportado: bucle degenerado del modelo + render sin límite → resuelto con clamp/aviso; además SW v4 evita versiones viejas en caché.

---
Task ID: 3
Agent: Super Z (main agent)
Task: Prism AI v2.1 — modo agente con bucles (plan→ejecutar→revisar, método iterativo estilo Claude Code) + mapa del proyecto para ahorrar tokens.

Work Log:
- Modo agente: lib/prism/agent-loop.ts con agentPrompt(maxLoops) — instruye al modelo a estructurar la respuesta en <plan>, <step n title>, <review pass>, <answer> y <project-map>. parseAgentTrace() hace streaming-parse tolerante (etiqueta final sin cerrar = open:true) y agrupa step+review en iteraciones del bucle.
- UI del bucle: components/prism/agent-trace.tsx — tarjeta «PLAN DEL AGENTE» (lista violeta), tarjetas «ITERACIÓN n» plegables con el código ejecutado, chip «Repetir bucle:» (ámbar, pass=no) / «Revisión superada» (esmeralda, pass=yes), respuesta final AgentAnswer destacada. ClampText por bloque (6000/8000) hereda la protección anti-bucle.
- message.tsx: si parseAgentTrace(content).active, renderiza la línea de tiempo en vez del markdown crudo (las etiquetas XML nunca se muestran); si no hay estructura, render normal (regresión verificada).
- Toggle del agente: chat-input.tsx añade botón IterationCw (violeta cuando está activo, aria-pressed) y placeholder «Agente activo: planear → ejecutar → revisar en bucles…». settings.agentMode + settings.agentMaxLoops (1-8, default 3) persistidos y editables en Ajustes → Chat.
- Mapa del proyecto: lib/prism/project-map.ts — deriveProjectMap(extrae título/h1/nav/botones/tech del HTML), deriveMapFromMessages (acumula últimos 20 assistant), parseMapJson + mergeProjectMap (gana el modelo, une features y archivos por nombre), renderMapForPrompt (bloque compacto ≤1400 chars inyectado en el system prompt de cada turno → la IA «recuerda» el proyecto sin releer código, ahorra tokens).
- types.ts/store.ts: ProjectMap + Session.projectMap + acción setProjectMap; el mapa viaja en sessions (persist/export automático).
- Panel: preview-panel.tsx ahora con 3 pestañas (Vista/Código/Mapa) — nueva pestaña Mapa con project-map-view.tsx (nombre+descripción, archivos con badge de tipo, chips de funcionalidades, botón borrar mapa) y nota explicativa del ahorro de tokens.
- chat-app.tsx: composeSettings(sessionId) compone system prompt = base + skills + agentPrompt + mapa del proyecto; updateProjectMap tras cada respuesta (prioridad <project-map> del modelo > derivación local); props agent/onToggleAgent y map/onClearMap cableados a input y paneles (escritorio+móvil).
- Mock E2E movido a ruta interna: src/app/api/mock-llm/[...path]/route.ts (POST chat/completions con SSE + GET models; clave test-key-123; detecta «MODO AGENTE» y responde con bucle completo plan→2 iteraciones→project-map). El mock externo scripts/mock-llm-server.ts se mantiene pero los procesos de fondo mueren entre llamadas del sandbox, por eso la ruta interna es la vía fiable.
- E2E agent-browser (con custom provider baseUrl=/api/mock-llm, useProxy:false): bucle completo verificado (plan 3 items, ITERACIÓN 1 colapsable con «Repetir bucle: Falta animación…», ITERACIÓN 2 con código, «Revisión superada», respuesta final), vista previa EN VIVO renderizó la página del agente, projectMap persistido fusionado (2 archivos + 4 features), pestaña Mapa con chips, toggle agente on/off, regresión chat normal OK, sin errores de consola, lint+tsc limpios. Evidencia: download/evidencia-agente-mapa.png.

Stage Summary:
- Prism AI v2.1: el chat ahora puede trabajar como AGENTE por bucles (plan→ejecutar→revisar hasta pass=yes, máx 1-8 iteraciones configurable) y mantiene un MAPA DEL PROYECTO compacto por sesión que se inyecta en el contexto para revisar el proyecto gastando muchos menos tokens.
- El mapa se construye de doble fuente: derivación local del HTML (título/h1/botones/tech) y actualización explícita del modelo vía <project-map> JSON.
- Mock de pruebas convertido en ruta interna /api/mock-llm para E2E reproducible sin dependencias externas.

---
Task ID: 4
Agent: Super Z (main agent)
Task: Prism AI v2.2 — Radar de modelos gratis (notificaciones de ofertas free, fechas límite y fuentes rastreadas) + Kimi K3 gratis integrado.

Work Log:
- Investigación web: Kimi K3 de Moonshot AI (2.8T, multimodal, ctx 1.05M) tiene versión gratis «coding-kimi-k3-free» en AiHubMix (5 req/min · 500 req/día · 1M tokens/día, sin tarjeta). OpenRouter lista kimi-k3 solo de pago; Groq ofrece moonshotai/kimi-k2-instruct gratis. Fuentes de ofertas confirmadas: awesome-free-llm-apis (GitHub), blog OpenRouter «free-llm-apis-compared», Eden AI, woTai.
- lib/prism/free-radar.ts: RADAR_SOURCES (12 fuentes: AiHubMix, OpenRouter, Gemini, Groq, Z.ai, Cerebras, Mistral, GitHub Models, SambaNova, Cloudflare Workers AI, NVIDIA NIM, Ollama local), RADAR_OFFERS (4 ofertas con vigencia/límites), RADAR_PAGES (5 páginas rastreadas), RADAR_NOVEDAD_IDS + unseenRadarCount (motor de notificaciones) y fallback local de OpenRouter.
- app/api/free-radar/route.ts: GET trae EN VIVO los modelos :free del endpoint público de OpenRouter (sin clave, timeout 8s, caché en memoria 10 min, fallback a referencia local si no hay red). Probado: 18 modelos :free reales.
- store.ts: radarSeenIds persistido (partialize/export), markRadarSeen() y addModelToProvider() (añade sin duplicar).
- components/prism/free-radar.tsx: dialog con secciones «Ofertas del momento» (badge DESTACADA + CalendarClock con vigencia), «Siempre gratis» (cards con límites, chips de modelos clicables, clave/docs), «En vivo · OpenRouter» (badge EN VIVO/REFERENCIA LOCAL, contexto por modelo, botón + por fila) y «Páginas para estar al tanto». Botones de activación con 1 clic: con clave → añade modelo + habilita proveedor + toast; sin clave → toast con acción «Abrir» Ajustes; fuentes externas → configura proveedor Personalizado con su baseUrl.
- sidebar.tsx: botón «Radar» con badge verde de novedades no vistas (desaparece al abrir). chat-app.tsx: toast de notificación al abrir la app («Radar de gratis: N novedades» + acción «Ver radar»), FreeRadarDialog cableado con focusProvider de Ajustes.
- providers.ts: coding-kimi-k3-free añadido como primer modelo de AiHubMix; tagline actualizada.
- E2E agent-browser: badge «Radar 7» visible → toast de bienvenida con «Ver radar» → dialog completo (Kimi K3 DESTACADA, 12 fuentes, EN VIVO con 18 :free reales) → «Activar coding-kimi-k3-free» sin clave (añade, no habilita, avisa) y con clave (enabled:true + toast éxito) → modelo visible en picker con badge GRATIS → badge de novedades se limpia al ver. Sin errores de consola. Lint y tsc limpios.
- Empaquetado: download/prism-ai-v2.2-codigo-fuente.zip (157 archivos).

Stage Summary:
- Prism AI v2.2: nuevo RADAR DE MODELOS GRATIS con notificaciones (badge + toast al abrir la app), ofertas con vigencia/límites, catálogo permanente de 12 fuentes, lista EN VIVO de OpenRouter :free y páginas que rastrean ofertas — todo con activación de modelos en 1 clic.
- Kimi K3 gratis integrado de punta a punta: coding-kimi-k3-free en AiHubMix (verificado en la página oficial: $0, ctx 1.05M, 5 rpm/500 rpd) + vía trial de Moonshot configurable como Personalizado.

---
Task ID: 5
Agent: Super Z (main agent)
Task: Prism AI v2.3 — failover automático entre proveedores gratis (fix del error «10 intentos» de AiHubMix) + subida a GitHub integrada (sin límite de 100 archivos) + guía de ejecución.

Work Log:
- Captura del usuario analizada: AiHubMix respondió «accounts that have not been recharged can only try 10 times» → documentado en el Radar (oferta Kimi K3, fuente AiHubMix: límites y descripción) y resuelto en la app con failover.
- Failover: free-models.ts añade isQuotaError() (regex de cuota/saldo/429/402) + pickFailoverCandidate() (orden de preferencia gemini→groq→openrouter→zai→aihubmix→ollama→…, solo proveedores con clave y modelos gratis, excluye el proveedor que falló). chat-app.tsx: attemptFailover() con toast warning, borrado del mensaje de error, cambio persistido de modelo (sesión+global) y reintento con depth guard (máx 1). resolveModel() ahora acepta clave fresca del store (fix de stale closure detectado en E2E) y runGeneration lee la clave del modelo desde getState().
- Mock E2E ampliado: /api/mock-llm responde 429 con el texto real de AiHubMix cuando el modelo contiene «kimi-k3».
- E2E failover: aihubmix::coding-kimi-k3-free (mock) → 429 → toast «Cuota gratis agotada» → reintento automático con custom::mock-mini-free → respuesta sin error; segundo mensaje directo sin 429; defaultModelKey persistido. tsc+lint limpios.
- GitHub integrado: lib/prism/github-upload.ts (ghEnsureRepo con auto_init, ghGetHead, ghCommitBatch por lotes de ~60 archivos/12MB — texto embebido en tree, binarios vía blobs base64 con paralelismo 6 —, commit + PATCH ref main; shouldIgnore con .gitignore básico: node_modules/.next/.env/logs/zip; prepareFiles + relPathFrom con webkitRelativePath; token en localStorage). components/prism/github-dialog.tsx: token con enlace «Crear token» pre-rellenado (scope repo), nombre de repo, switch privado, carpeta con webkitdirectory, resumen N archivos/tamaño/ignorados, barra de progreso por lotes y enlace al repo final. Sidebar: botón «Subir a GitHub» (escritorio+móvil).
- E2E GitHub: diálogo renderiza; con 5 archivos sintéticos ignora .env y .log (queda 3); token inválido contra la API real de GitHub → «GitHub 401: Bad credentials — el token no es válido o expiró» (CORS y parse de errores verificados en vivo). Evidencia: download/evidencia-github-dialog.png.
- download/COMO-EJECUTAR.md: requisitos, npm install/dev/build/start, configuración de claves gratis, PWA, subida a GitHub (opción app y opción git CLI), problemas frecuentes y scripts.
- Empaquetado: download/prism-ai-v2.3-codigo-fuente.zip (159 archivos).

Stage Summary:
- Prism AI v2.3: si un proveedor se queda sin cuota gratis (ej. AiHubMix 10 intentos sin recargar), la app avisa y reintenta sola con otro modelo gratis conectado, cambiando el modelo de forma persistente. 
- Nueva función «Subir a GitHub» dentro de la app: carpetas de cualquier tamaño/cantidad de archivos en lotes con commits automáticos, sin el límite de 100 archivos de la web.

---
Task ID: 6
Agent: Super Z (main agent)
Task: Prism AI v2.4 — instalación premium con el proyecto en GitHub (README raíz, instalador multiplataforma, asistente de primera ejecución in-app).

Work Log:
- README.md raíz creado (no existía): logo, badges, 12 características, instalación en 3 pasos (git clone → npm run setup → npm run dev), tabla de claves gratis (AiHubMix/Gemini/Groq/OpenRouter/Z.ai/Ollama), PWA por plataforma, uso rápido, estructura, scripts, problemas frecuentes, privacidad y licencia.
- Instalador multiplataforma scripts/setup.mjs (npm run setup): valida Node ≥20.9 (requisito de Next 16), npm install, crea .env.local desde .env.example y muestra banner con siguientes pasos; wrappers setup.sh (macOS/Linux, chmod +x) y setup.bat (Windows con pausa). Sintaxis verificada con node --check.
- .env.example documentado (DATABASE_URL opcional; la app no necesita claves de servidor). LICENSE MIT (bilingüe ES+resumen EN). package.json: name prism-ai, version 2.4.0, description, script "setup". .gitignore ampliado (download/, workspace/, upload/, tool-results/, .zscripts/, db/custom.db, zips; ¡!.env.example re-incluido).
- Onboarding in-app components/prism/onboarding.tsx: wizard de 3 pasos con identidad prism (logo glow, dots de progreso). Paso 1 bienvenida + 4 features; Paso 2 clave AiHubMix con mostrar/ocultar, enlace a aihubmix.com/apikey, nota de los 10 intentos, «Probar conexión» (reutiliza fetchModels vía proxy; muestra N modelos y N gratis) y «Guardar y continuar» (setProviderConfig enabled + defaultModelKey coding-kimi-k3-free + toast) con salida «Todavía no tengo clave»; Paso 3 instrucciones PWA (escritorio/Android/iOS) + tip del Radar → «Empezar a chatear».
- store.ts: onboardingDone persistido (estado + setOnboardingDone + partialize). chat-app.tsx: auto-apertura a los 600ms si hydrated && !onboardingDone; el toast del radar se suprime en la primera visita (lo sustituye la guía); OnboardingDialog renderizado y reabrible. sidebar.tsx: nueva prop onOpenGuide + botón «Guía inicial» (GraduationCap) compartiendo fila con «Subir a GitHub» (escritorio y móvil).
- E2E agent-browser con storage limpio: auto-apertura confirmada → paso 1 → paso 2 → «Probar conexión» contra la API real de AiHubMix devolvió 408 modelos (53 -free) → «Guardar y continuar» toast «AiHubMix conectado · coding-kimi-k3-free» y picker con «coding-kimi-k3-free GRATIS · AiHubMix» → paso 3 → cerrar → tras reload NO reaparece (onboardingDone:true en localStorage) → «Guía inicial» de la sidebar lo reabre (role=dialog verificado). Sin errores de página ni en dev.log. Evidencias: download/evidencia-guia-paso1-bienvenida.png, -paso2-conexion.png, -paso3-pwa.png.
- Empaquetado: download/prism-ai-v2.4-codigo-fuente.zip (141 archivos, limpio para GitHub: incluye README, LICENSE, .env.example, setup.sh/.bat, .gitignore; excluye capturas E2E). COMO-EJECUTAR.md actualizado con flujo git clone + npm run setup.

Stage Summary:
- Prism AI v2.4: instalar desde GitHub ahora es «git clone → npm run setup → npm run dev» con instalador que valida Node, instala dependencias y prepara el entorno; README raíz profesional; y la propia app estrena un asistente de primera ejecución que conecta la clave gratis (con prueba de conexión real) y enseña a instalarla como PWA.

---
Task ID: 7
Agent: Super Z (main agent)
Task: Prism AI v2.5 — mejoras elegidas por el usuario (2 exportar chats, 3 temas de acento, 6 voz STT/TTS, 9 CI) + Repo Studio (dar un repo: abrir si ya está descargado, clonar si no, corregir con IA).

Work Log:
- Exportar chats (lib/prism/export-chat.ts): sessionToMarkdown (título, fecha, modelo, mensajes, adjuntos) + downloadSessionMarkdown (blob .md) + printSessionPdf (HTML formateado en iframe oculto → diálogo de impresión «Guardar como PDF», con mini-markdown propio y thumbs de imágenes). Botón de descarga en la cabecera del chat (solo con mensajes) con menú Markdown/PDF y toasts.
- Temas de acento (lib/prism/accent.ts + globals.css): ACCENTS con 6 presets (violeta, esmeralda, ámbar, rosa, cian, naranja) vía html[data-accent] que sobreescribe --prism-violet/cyan/pink + --primary/--ring/sidebar; modo «personalizado» con triada coordinada calculada por HSL (+38°/-42°) aplicada como variables inline; normalizeHex/customTriad/applyAccent. settings.accent + accentCustom + autoSpeak añadidos a AppSettings (DEFAULT_SETTINGS + partialize automático). Nueva pestaña «Apariencia» en Ajustes (grid de presets con swatch, selector de color nativo + hex input con aplicar al escribir). Efecto en chat-app aplica el tema al hidratar/cambiar.
- Voz (lib/prism/speech.ts): STT con SpeechRecognition tipado a mano (es-ES, continuous+interim, tabla de errores en español, acumulación base+finals en chat-input con botón Mic/MicOff y cleanup en unmount); TTS con speechSynthesis (stripForSpeech quita código/markdown/URLs, voz es-ES preferida, límite 6000 chars), botón Volume2/VolumeX en cada respuesta del asistente (speechState.msgId global), interruptor «Leer respuestas en voz alta» en Ajustes → Chat y lectura automática al terminar cada respuesta; stop() del chat también detiene la voz.
- CI (.github/workflows/ci.yml): push/PR a main → Node 20 → npm install → prisma generate → lint → build con DATABASE_URL de prueba. Badge CI añadida al README.
- Repo Studio: API src/app/api/repos/route.ts (runtime nodejs) con acciones open (parsea URLs https/ssh/owner-repo; si existe workspace/repos/owner---repo → status:exists; si no clona con git clone --depth 1 y sin dejar token en .git/config, fallback tarball oficial de la API de GitHub + tar), list (walk con SKIP_DIRS, máx 800), read (rechaza binarios por extensión, máx 400KB) y write; safeJoin bloquea path traversal (verificado). UI components/prism/repo-dialog.tsx: input URL + token opcional (prefill de ghGetToken), banner esmeralda «Ya lo tenías descargado»/violeta «Clonado», lista filtrable con puntos de cambios, editor monoespaciado con Guardar/Revertir, «Corregir» con instrucción opcional que llama a streamChat con el modelo activo (system: devuelve solo el archivo completo sin fences, stripOuterFence), pie con «Subir cambios a GitHub» (pushFilesToRepo: Contents API con sha previo, 1 commit por archivo) y «Publicar como repo nuevo» (publishAsNewRepo reutiliza uploadToGithub con Files sintéticos). Botón «Repos» (FolderGit2) en sidebar escritorio y móvil junto a Guía y GitHub.
- E2E agent-browser: preset esmeralda → --prism-violet #10b981; personalizado #ff6600 → triada #f8ff29/#ff2969; persiste tras recarga. Chat con mock → toast «Conversación exportada a Markdown» + iframe PDF con título correcto. TTS toggle sin crash; micrófono presente y error de permiso manejado con toast. Repo Studio con octocat/Hello-World real: clonado desde UI → README 13 B → leído → editado + guardado (verificado en disco) → 2ª apertura «Ya lo tenías descargado → abierto para editar» → Corregir con IA reemplazó el contenido + toast. Curl previo: open/list/read/write/exists OK y path traversal rechazado. Sin errores de página ni en dev.log; tsc y lint limpios a la primera.
- Empaquetado: download/prism-ai-v2.5-codigo-fuente.zip (153 archivos, 565 KB, integridad verificada) con .github/workflows/ci.yml, sin .env/logs/node_modules/workspace. package.json 2.5.0. README (Repo Studio, exportar, temas, voz, CI, estructura, FAQ, privacidad) y COMO-EJECUTAR.md (secciones 5b Repo Studio y 5c novedades v2.5) actualizados. Evidencias: download/evidencia-tema-personalizado.png, download/evidencia-repo-studio.png.

Stage Summary:
- Prism AI v2.5: exportar chats a Markdown/PDF, 6 temas de acento + color personalizado con tríada automática, dictado por voz y lectura en alto (con auto-lectura opcional), CI de GitHub Actions lista, y Repo Studio completo: abrir repo si ya está descargado / clonarlo si no / editar archivos / corregirlos con IA / subir cambios (commit directo o repo nuevo).
- Todo verificado E2E en navegador con repo real de GitHub y empaquetado en el zip oficial v2.5 listo para subir al repositorio.

---
Task ID: 8
Agent: Super Z (main agent)
Task: Arreglos post-v3.4.0 — auditoría: versión visible, persistencia de prompts/skills, bóveda y token de GitHub, borrado total, failover sin pisar streaming y build sin Google Fonts.

Work Log:
- Base verificada: lint 0, tsc 0, 413 tests OK. Build/E2E de navegador inviables en este sandbox (binaries.prisma.sh y CDN de Playwright bloqueados), así que la verificación fue estática + smoke real de las rutas del servidor.
- v3.4.0 no mostraba la versión: `VersionLine` (sidebar.tsx) estaba definido pero nunca renderizado. Ahora se pinta en el pie de la sidebar («v3.4.0 · al día / hay vN» vía /api/version). Ajustes además tenía «Prism AI v3.1» hardcodeado → ahora usa APP_VERSION.
- Prompts y skills NO persistían: partialize del store omitía `prompts` y `skills`, así que al recargar se perdían las personalizadas y el estado enabled de las skills. Ahora se guardan y se fusionan al rehidratar con lib/prism/persist-merge.ts (integradas frescas del código + personalizadas del disco); importData usa la misma fusión. 6 tests unitarios nuevos.
- Bóveda y GitHub desincronizados: vault.ts cifraba/restauraba la clave legacy `gh_token`, pero el token real vive en `prism-github-token` (github-upload.ts). El PIN dejaba el token real en texto plano y no lo restauraba al desbloquear. Ahora vault usa ghGetAccount/ghSetAccount (token + metadatos cifrados, migración de la clave legacy) y la sesión de GitHub se restaura/limpia de verdad (evento prism-github-account incluido).
- «Borrar todo» no borraba todo: resetAll dejaba prompts, skills, radar, onboarding, bóveda, token de GitHub, salud y métricas. Nuevo lib/prism/reset-all.ts (hardReset) limpia todos los localStorage/sessionStorage de la app + stores de vault/health/usage; botón de Ajustes → Datos lo usa.
- Failover pisaba el streaming: el reintento automático tras cuota (attemptFailover) se lanzaba dentro de la generación fallida, cuyo finally hacía setStreamingMsgId(null) y abortRef=null DESPUÉS → el reintento generaba sin indicador EN VIVO, sin botón Detener y sin auto-scroll. Ahora el reintento va en setTimeout(0) tras salir la generación original.
- Build reproducible: layout.tsx usaba next/font/google (descarga Geist en compilación) → el build fallaba entero sin acceso a fonts.googleapis.com. Cambiado al paquete `geist` (fuentes locales, misma tipografía); `next build` verificado OK en sandbox sin red de Google.
- next-env.d.ts fuera del índice: ya estaba en .gitignore pero seguía rastreada; Next 16 la regenera con ruta distinta en dev/build y ensuciaba el árbol con diffs fantasma.
- Smoke del servidor con la app en dev: /api/version → 3.4.0, /api/mock-llm (models + chat con HTML) OK con test-key-123, /api/repos exige repo abierto, /api/github/oauth/device→409 usePopup sin credenciales, /api/github/oauth/start → formulario de manifiesto de GitHub App, proxy rechaza localhost (SSRF). Lint/tsc/419 tests limpios.

Stage Summary:
- v3.4.0 saneada: la versión se ve (sidebar + Ajustes), los prompts/skills personalizados sobreviven a la recarga, la bóveda cifra de verdad el token de GitHub, «Borrar todo» borra todo, el failover mantiene el streaming y el build ya no depende de Google Fonts.

---
Task ID: 8b
Agent: Super Z (main agent)
Task: Segunda tanda de recomendaciones — versión vía API de GitHub, tsc en CI, E2E de los arreglos, README con OAuth, repo-chip, OAuth puede crear repos, bóveda bloqueada y build sin Prisma.

Work Log:
- /api/version cambia de raw.githubusercontent.com a la API de GitHub (contents/package.json + fallback releases/latest): raw está bloqueado en muchas redes (aquí daba timeout) y api.github.com responde con CORS abierto y UA propio. packageVersion() pura y testeada (3 tests).
- Tipos en CI: prebuild = tsc --noEmit (next.config tiene ignoreBuildErrors:true, así que el build solo no cazaba errores de TypeScript; y el workflow no se tocó porque la App de GitHub del entorno no tiene permiso workflows). Script `typecheck` también disponible.
- E2E nuevos (tests/e2e/fixes.spec.ts, 7 tests): versión visible en la sidebar (stub de /api/version), prompt personalizado tras recarga, estado de skills tras recarga, «Borrar todo» limpia token/bóveda/salud/métricas (y el diálogo de PIN no se dispara sembrando la bóveda después del mount), failover mantiene el botón Detener (429 de kimi-k3 → reintento con custom, respuesta grande para asegurar la ventana de streaming), enlace con pregunta no abre Repo Studio y muestra chip «Abrir octocat/Hello-World en Repo Studio» en la burbuja, enlace suelto abre Repo Studio sin llamar al modelo.
- Repo-chip: ChatMessage.repo (RepoLink en types.ts); send() solo abre Repo Studio si el mensaje es CASI solo el enlace (isMostlyRepoLink); si hay pregunta, el repo viaja al modelo y la burbuja del usuario muestra un acceso para abrirlo. message.tsx + chat-app.tsx cableados; pie del input actualizado.
- OAuth crea repos: manifiesto de la GitHub App pide administration:write (sin él el token no puede hacer POST /user/repos y «Publicar como repo nuevo» fallaba 403); ghEnsureRepo devuelve error accionable (crear el repo en github.com/new y volver a subir) en 403/404. Test de manifiesto ampliado.
- Bóveda bloqueada: vaultWriteBlocked() veta guardar el token de GitHub (OAuth o PAT) con la bóveda activa y bloqueada — antes quedaba en texto plano — y syncVaultNow() re-cifra al instante al conectar/desconectar con la bóveda abierta (el subscribe solo corría al cambiar el store). github-connect.tsx usa ambas.
- Build sin Prisma: la app no usa la BD en runtime (src/lib/db.ts no se importa de ningún sitio), pero `prisma generate` en el build exigía descargar engines de binaries.prisma.sh y rompía despliegues sin esa red. Sacado del script build; siguen db:push/db:generate/etc. para quien use la BD.
- README: vía normal = Conectar GitHub (OAuth), token clásico como opción; FAQ repo privado, privacidad (token cifrado con PIN), filas de features y changelog v3.4 actualizados.
- Verificación: lint 0, tsc 0, 422 tests OK (3 nuevos), npm run build OK sin Prisma ni Google Fonts. En este sandbox Node no verifica la firma TLS de api.github.com (MITM del entorno; curl sí llega), pero la ruta degrada a «solo versión local» sin romper, y en GitHub Actions/Vercel el TLS es normal.

Stage Summary:
- Cierro las 8 recomendaciones: versión robusta por API de GitHub + fallback, tipos en CI, 7 E2E nuevos que vigilan los arreglos, README coherente con OAuth, enlaces de GitHub que no secuestran el chat (chip en la burbuja), token OAuth con permiso para crear repos y error accionable, bóveda que nunca deja el token sin cifrar, y build sin dependencia de Prisma ni Google Fonts.
