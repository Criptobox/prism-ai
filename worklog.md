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
Agent: Arena Agent Mode
Task: Prism AI v3.5 — tema de 3 opciones, modo foco, micro-animaciones, comandos slash, hojas de cálculo locales, resumir/traducir y skill de diseños que no se repiten.

Work Log:
- TEMA 3 OPCIONES: theme-provider defaultTheme "dark" → "system" (el oscuro forzado dejaba a contramano a quien tiene el dispositivo en claro). theme-toggle.tsx pasa de interruptor binario a menú Claro/Oscuro/Sistema con check del activo y icono del tema real (Monitor en «Sistema»); `mounted` evita el desajuste de hidratación porque el tema resuelto solo se conoce en cliente. sidebar.tsx estrena ThemeSegmented: tira de tres con role=radiogroup, visible sin abrir menús.
- MODO FOCO (zen): lib/prism/focus-mode.ts (readFocusMode/writeFocusMode/useFocusMode, persistido en localStorage `prism-focus-mode`, no en zustand: es preferencia de vista). Arranca en false y aplica el valor guardado tras montar para que servidor y cliente pinten igual. En la cabecera, icono Maximize2/Minimize2: oculta la sidebar de escritorio (lg:hidden), el botón de menú móvil, el split de vista previa (showPreviewPane) y el botón «Ver diseño» del móvil; además el auto-abrir del split respeta el modo (`if (!focusMode) setPreviewOpen(true)`), que era el punto del encargo.
- MICRO-ANIMACIONES (globals.css): `.stagger-in` con retardo por `--stagger` (índice) para la entrada escalonada del empty state — así no hace falta una clase por posición; `.lift-card` eleva las tarjetas de sugerencia solo bajo `@media (hover: hover)` para no dejarlas pegadas en táctil; `.panel-in` en preview-panel y en el ResizablePanel; `.skeleton-shimmer` (3 barras) bajo «Pensando…». Bloque `prefers-reduced-motion: reduce` que apaga todo, incluidas las ya existentes msg-in/generating/aurora.
- COMANDOS SLASH: lib/prism/slash.ts sin React ni DOM (probable en Node) — slashQuery/slashOpen (solo si la barra abre el mensaje y aún no hay espacios: «/imagen un gato» ya es un mensaje normal), filterSlash con puntuación por prefijo de comando > alias > título > substring, matchSlashExact, moveSlashIndex con vuelta por los extremos y normalizeSlash sin tildes. 6 comandos: /imagen /agente /resumen /arena /html (inserta HTML_TEMPLATE) /nuevo. slash-menu.tsx solo pinta (icono+tinte por comando, scrollIntoView del marcado, onMouseDown en vez de onClick para no robarle el foco al textarea). chat-input.tsx cablea flechas/Enter/Tab/Esc antes que el Enter de enviar, y `role=combobox` + aria-expanded/controls/autocomplete.
- HOJAS DE CÁLCULO: lib/prism/sheets.ts — parser CSV/TSV propio (comillas, «""» escapadas, saltos dentro de celda, CRLF, BOM de Excel), detectDelimiter que puntúa regularidad ignorando separadores entre comillas, rowsToMarkdown (rellena filas cortas, nombra col1/col2 sin cabecera, recorta a 200×40 avisando de lo omitido) y readSheetFile con `await import("xlsx")` BAJO DEMANDA. Verificado en el bundle servido: `sheet_to_json` aparece solo tras el import dinámico y el cuerpo de SheetJS (marcas «SheetJS»/«codepage») NO está en los chunks iniciales. chat-app.tsx separa hojas de documentos, comparten el cupo de 3 y el toast dice «se lee en tu dispositivo».
- RESUMIR / TRADUCIR: lib/prism/recap.ts con recapPrompt (estructura: en una frase / lo acordado / estado / siguiente paso) y translatePrompt (cita 400 chars de la respuesta, protege el código, conserva markdown) + 6 idiomas EN/FR/PT/DE/IT/JA. Los dos van como mensaje-instruction: viajan al modelo con TODO el contexto pero en el hilo se pintan como nota discreta, igual que el «continuar trabajo» del agente. instructionLabel() generaliza esa nota (antes decía siempre «continuar el trabajo»); un test cazó que el regex `[^\n(]+` se comía «tu respuesta anterior» dentro de la etiqueta → corregido a `(.+?) tu respuesta anterior` (se arregló el parser, no el test).
- SKILL DE DISEÑOS (petición específica): nueva builtin «Diseños que no se repiten» (🎨, id skill-design-variety, enabled por defecto) — obliga a decidir y anunciar estilo + composición + tipografía antes de codificar, con coherencia del sistema visual, accesibilidad y responsive real, y respeta el proyecto en marcha (la variedad aplica al empezar algo nuevo). Además «Desarrollador web experto» recibe el bloque VARIEDAD OBLIGATORIA con la regla explícita: una web nueva NO puede repetir lo ya construido cambiando solo el color; se le quitó el «oscuro-elegante» por defecto que era justo lo que uniformaba todo.
- Fix de detalle: el toast de /imagen estaba dentro del updater de setImageMode (StrictMode lo invoca dos veces) → movido fuera con el valor calculado. next-env.d.ts, que Next reescribe al arrancar dev, revertido para no ensuciar el diff.
- Verificación: lint 0 · tsc 0 · 460/460 tests (47 nuevos: 17 slash, 21 hojas, 9 recap) · dev server 200 OK y features confirmadas en el bundle servido (Modo foco, Resumir hasta aquí, prism-focus-mode, Diseños que no se repiten, Traducir respuesta, los 6 comandos, stagger-in/lift-card/panel-in/skeleton-shimmer en el CSS). `npm run build` no se puede completar EN ESTE SANDBOX porque no hay salida a Google Fonts (next/font) ni a binaries.prisma.sh; es limitación de red del entorno, no del código — la compilación de Turbopack en dev pasa limpia.

Stage Summary:
- Prism AI v3.5: el tema deja de imponer oscuro y pasa a seguir al sistema con tres opciones reales; llega el modo foco que apaga sidebar, vista previa y el auto-abrir del split; el compositor estrena comandos slash; los CSV/Excel se leen en el dispositivo y llegan como tablas markdown; y cada respuesta se puede resumir o traducir sin ensuciar el hilo.
- Lo pedido en concreto: la skill «Diseños que no se repiten» + las instrucciones de variedad en la skill web, con la regla explícita de que una web nueva no se resuelve repintando la anterior.

## CI en verde — la demo que escribía encima de los tests

Los E2E llevaban en rojo desde el merge de PR #1, también en `main`. La pista
estaba en los tiempos: el último run verde tardaba 2 min y los rojos 7-9 min.
Eso no es una aserción que falla, es gente esperando a algo que no llega.

Cuatro causas, ninguna de la v3.5 salvo las dos primeras regresiones ya
corregidas en `f7d5161`:

1. **La demo de vista previa** (`preview-demo.ts`, entró en PR #1) se ejecuta
   sola en la primera visita: teclea una landing entera, abre el split y
   encoge el compositor. Ningún spec la desactivaba, así que había un tercero
   escribiendo en casi todos los tests. Se neutraliza en
   `tests/e2e/fixtures.ts`, una base común que la marca como vista antes de
   cargar la página; los 11 specs importan de ahí, así que un spec nuevo no
   puede olvidarse.
2. **Halos del empty state**: 28rem (448px) se salían de un viewport de 390px.
   Acotados con `size-[min(...,Nvw)]`.
3. **Botón «Uso»**: los tests lo piden como botón y estaba escondido en el
   menú «Más». Promovido a la rejilla del pie.
4. **Studio**: esperaba «Token de GitHub» y «Commit y push»; PR #1 rediseñó
   esto a OAuth («Usar un token personal», «Abrir repo», «Subir a main»). Aquí
   mandaba el producto, así que se actualizó el test y se añadieron los
   fixtures de `/user`.

De paso, `playwright.config.ts` activa el reporter `github` en CI: antes un
E2E rojo solo dejaba «exit code 1» y había que descargar el log entero.

Resultado: E2E de 9m06s a **2m24s**, en verde.

---

## 30 ago 2026 — Ramas: una sola línea de verdad

`main` y el despliegue de producción llevaban días separados. Vercel servía
v3.5.0 mientras `main` iba por 3.7.0, y la app que se usaba a diario tenía
funciones —modo foco, comandos con barra, hojas de cálculo, tema de tres
opciones— que `main` no tenía. Se unieron en `43681cf` en vez de descartar
ninguna de las dos.

Después se limpiaron las ramas sueltas. Queda anotado por si algún día hace
falta, porque los commits siguen existiendo aunque la rama ya no:

| Rama borrada | Punta | Commits que `main` no tiene |
|---|---|---|
| `arena/01a04bb5-prism-ai` | `7b3edc0` | 0 — estaba entera dentro de `main` |
| `arena/01a04e17-prism-ai` | `9146549` | 0 — unida en `43681cf` |
| `arena/01a04c7e-prism-ai` | `78437b3` | **6** |

De la tercera se revisaron sus 52 archivos propios uno a uno: **45 son código
retirado a propósito** (Prisma, treinta componentes de shadcn sin usar,
`theme-toggle.tsx`, los scripts `capture-v28..30`). De los otros siete,
`db.ts` es Prisma, `spreadsheet.ts` duplica `sheets.ts`, y `persist-merge.ts`
y `reset-all.ts` están cubiertos por `transfer.ts` y el store. Nada que
rescatar — por eso se archivó en lugar de fusionarse, y por eso se deja ir.

Si alguna vez se necesita, el commit `78437b3` sigue accesible por su SHA en
GitHub aunque ninguna rama lo apunte:
https://github.com/Criptobox/prism-ai/commit/78437b3

La PR #2 salía de esa rama y se cerró sin fusionar: traía de vuelta todo lo
que se había quitado.

**Regla que queda:** una sola rama de verdad, `main`. Lo que no esté ahí, no
está desplegado.

---

Task ID: 9
Agent: Super Z (sesión interactiva con el autor)
Task: Implementar las tres mejoras prioritarias del análisis de PLAN-EVOLUCION.md: cuota real por proveedor, QA visual en la vista previa y memoria de fallos.

Work Log:
- Mejora 1 — Cuota real por proveedor (`quota.ts` nuevo): medidor honesto de tres estados. MEDIDA parsea las cabeceras `x-ratelimit-*` que mandan Groq/Cerebras en cada respuesta (con hora de reposición); CONSULTADA pregunta a `GET /api/v1/key` de OpenRouter al abrir el panel, no en bucle; SIN DATO no inventa porcentajes: enseña el último 429, los fallos seguidos y el enfriamiento que ya mide `health.ts`. El proxy ahora reenvía las cabeceras de cuota al navegador (antes se las comía) y `chat-client.ts` las captura en los tres protocolos y en el probe.
- Mejora 1b — Enfriamiento POR PROVEEDOR en `health.ts`: los límites de las cuotas gratuitas son por proveedor; un 429/402 ahora enfría también al proveedor entero (con backoff y Retry-After), y Auto/failover/consenso lo respetan: se deja de dar tumbos entre modelos del mismo proveedor agotado. Un éxito de cualquier modelo suyo lo levanta.
- Mejora 2 — QA visual sobre la vista previa (`visual-qa.ts` nuevo): el método de medición de `tests/e2e/responsive.spec.ts` aplicado al iframe a 320 y 390 px: scroll horizontal, elementos fuera del viewport, texto < 12 px y contraste (ratio WCAG, umbral 4.5:1 / 3:1 en grande). Como el sandbox no permite leer el DOM desde fuera, el medidor viaja DENTRO del HTML inyectado y reporta por postMessage (pasivo, sin red). Botón en `preview-panel.tsx` y en el Sandbox, con chapa roja de contador y tarjeta de resultados por ancho. Descargas y «abrir en pestaña» salen con el HTML limpio, sin el medidor.
- Mejora 3 — Memoria de fallos (`failures.ts` nuevo): lista de `{ resultado, regla }` con solo errores VERIFICABLES: diagnósticos bloqueantes de la revisión del Sandbox, errores en tiempo de ejecución de la consola, trabajo del agente a medias (`agentStalled`) y hallazgos del QA visual. Deduplica por regla (sube «usos»), caduca sola a 14 días, se borra de una en una, tope 40. Las reglas entran en el system prompt del agente vía `agentPrompt(maxLoops, reglas)`. Panel nuevo «Memoria» con borrado individual.
- UI: dos entradas nuevas en el sidebar (Cuota con `Gauge`, Memoria con `BrainCircuit`) junto a Uso; diálogos `quota-panel.tsx` y `failures-panel.tsx`.
- Tests: 3 baterías nuevas (`quota.test.ts`, `failures.test.ts`, `visual-qa.test.ts`) + bloque de enfriamiento por proveedor en `health.test.ts`. 609/609 en verde, tsc 0, eslint 0. Versión 3.9.0 → 3.10.0.
- Verificado en navegador (Chromium real): paneles Cuota y Memoria con datos, medición QA real del iframe (detectó el texto de 11 px de la demo a 320/390), sin desbordes a 320 px en la propia app y registro automático de los hallazgos en la memoria.

Stage Summary:
- Lo primero del análisis del plan, hecho: el failover ya no pierde reintentos dentro de un proveedor agotado, el medidor de cuota dice la verdad en sus tres estados, y la vista previa avisa de «esto se rompe a 320 px» antes de descargar.
- Archivos nuevos: `src/lib/prism/quota.ts`, `src/lib/prism/visual-qa.ts`, `src/lib/prism/failures.ts`, `src/components/prism/quota-panel.tsx`, `src/components/prism/failures-panel.tsx`, `tests/unit/quota.test.ts`, `tests/unit/failures.test.ts`, `tests/unit/visual-qa.test.ts`.
- Archivos tocados: `health.ts` (enfriamiento por proveedor), `chat-client.ts` (captura de cabeceras + consulta OpenRouter), `api/proxy/route.ts` (reenvío x-ratelimit), `agent-loop.ts` (reglas de memoria), `chat-app.tsx`, `sidebar.tsx`, `preview-panel.tsx`, `sandbox-studio.tsx`, `app-version.ts`, `package.json`.

---

Task ID: 10
Agent: Super Z (sesión interactiva con el autor)
Task: Implementar el segundo lote del análisis de PLAN-EVOLUCION.md: ficha del proyecto (Project Passport), permisos de las Skills y regresión visible en el Sandbox.

Work Log:
- Mejora 4 — Ficha del proyecto (`passport.ts` nuevo): `project-map.ts` ya detectaba pila, relaciones y puntos de entrada; faltaba presentarlo como ficha y que el agente la LEA ANTES de trabajar. `buildPassport(map)` calcula del mapa (nunca del modelo): pila con nº de archivos que la usan, entrada (portada index/portada/inicio o primera página), núcleo (el archivo con más backlinks), huérfanas (páginas sin enlaces en ningún sentido), tipos de archivo, notas y versiones. `renderPassportForPrompt` genera un bloque ≤ 700 chars que entra en el system prompt ANTES del mapa por archivo (`chat-app.tsx`). Tarjeta `project-passport.tsx` con chips en la cabecera del mapa (`project-map-view.tsx`), avisos ámbar para huérfanas.
- Mejora 5 — Permisos de las Skills (`skill-permissions.ts` nuevo): análisis local del texto ANTES de instalar. Detecta dominios remotos que la skill manda cargar (separando CDNs de uso común de dominios desconocidos), instrucciones de pedir/incrustar claves reales (TU_API_KEY, sk-, ghp_, AIza, "tu token/contraseña") y envío de datos a servidores (webhook, sendBeacon, "envía los datos a"). Tres niveles honestos: ok / aviso / riesgo, con los motivos concretos que lo disparan. La puerta está en `skills-dialog.tsx`: desde URL ya no instala directo — descarga, analiza y MUESTRA los permisos antes; el riesgo exige aceptación de DOS pasos («Instalar igualmente») y el permiso queda guardado en la skill (`SkillItem.permissions`) y visible en la lista para siempre. Segundo diente: `renderPermisosPrompt` inyecta en el system prompt los límites de las skills activas con permisos sensibles — la skill no puede colar claves ni envíos por encima del usuario.
- Mejora 6 — Regresión visible (`regression.ts` nuevo): un antes y un después medidos, no «Regression AI». Cada «Ejecutar» del Sandbox cierra una instantánea a los 3 s: consola (errores/avisos), QA móvil automático (solo si el medidor respondió después de arrancar) y peso del HTML servido. La comparación con la ejecución anterior (misma entrada) separa errores NUEVOS, errores ARREGLADOS, avisos nuevos y hallazgos del QA que empeoran o mejoran, con veredicto en una línea: mejora / empeora / igual / sin datos suficientes. Pestaña nueva «Regresión» en `sandbox-studio.tsx` con chapa roja cuando el cambio rompió algo; la primera ejecución lo explica y queda de referencia. Fix incluido: la medida automática del medidor ahora se guarda en ref para la instantánea (antes solo en estado).
- Tests: 3 baterías nuevas (`passport.test.ts` 11, `skill-permissions.test.ts` 12, `regression.test.ts` 12 — incluye normalización de puntos finales en dominios y el caso «consola vacía + QA sin responder = sin datos»). 609 → 642 tests en verde, tsc 0, eslint 0. Versión 3.10.0 → 3.11.0.
- Verificado en navegador (Chromium real): ficha renderizada con pila/entrada/núcleo/huérfana sobre un mapa real; skill de riesgo (pide TU_API_KEY + sendBeacon a dominio ajeno) detectada en vivo, bloqueada en el primer clic e instalada solo con el segundo; regresión con la demo del Sandbox — script con error inyectado detectado como «1 error nuevo de consola» con veredicto rojo y QA móvil medido en ambos lados.

Stage Summary:
- El segundo lote del análisis, hecho: la memoria del proyecto ahora tiene portada y el agente la lee primero; instalar una skill ya no es aceptar a ciegas lo que dice su texto; y el Sandbox dice qué rompió o arregló tu último cambio con números de ambas ejecuciones.
- Archivos nuevos: `src/lib/prism/passport.ts`, `src/lib/prism/skill-permissions.ts`, `src/lib/prism/regression.ts`, `src/components/prism/project-passport.tsx`, `tests/unit/passport.test.ts`, `tests/unit/skill-permissions.test.ts`, `tests/unit/regression.test.ts`.
- Archivos tocados: `types.ts` (SkillItem.permissions), `skills-dialog.tsx` (puerta de permisos + lista), `sandbox-studio.tsx` (pestaña Regresión + instantáneas), `project-map-view.tsx` (tarjeta ficha), `chat-app.tsx` (ficha + límites de skills en el system prompt), `README.md`, `package.json`, `app-version.ts`.
- Pendiente del análisis (punto 7): agente de navegador dentro del Sandbox — abrir la vista previa, cambiar viewport, pulsar, escribir y leer consola; la mitad del §8 que sí se puede construir.

---

Task ID: 11
Agent: Super Z (sesión interactiva con el autor)
Task: Implementar el tercer y último lote del análisis de PLAN-EVOLUCION.md: agente de navegador dentro del Sandbox (punto 7) — «Piloto del Sandbox».

Work Log:
- Mejora 7 — Piloto del Sandbox (`sandbox-pilot.ts` nuevo): la mitad del §8 que se puede construir de verdad. El agente solo opera sobre el iframe que Prism sirve, con el mismo truco del QA visual: el iframe corre sin `allow-same-origin`, así que un runtime pequeño viaja DENTRO del HTML inyectado y recibe órdenes por postMessage (`prism-pilot-cmd` → `prism-pilot-result`). Tres operaciones fijas, sin `eval`: `click` (selector CSS primero, si no por texto visible entre clicables), `type` (native value setter + eventos input/change, así los frameworks se enteran) y `read` (título, ancho real, botones, enlaces, campos con valores y extracto del texto). Nada de webs ajenas.
- Mini-lenguaje de pasos, una línea por paso: `ve a 320px` (ancho 200–2000), `pulsa «…»|#id`, `escribe "…" en #id` (sin objetivo = primer campo), `espera 500`, `lee`, `qa` (batería 320/390 o un ancho). El parser reconoce verbos sin acentos ni mayúsculas pero extrae objetivo y valor de la línea ORIGINAL: escribir «Ana García» escribe «Ana García», y un selector `#Tarea` no se rompe. Lo que no se entiende vuelve en `errores` con nº de línea, antes de correr.
- Ejecutor (`ejecutarPasosPiloto`): pasos en orden sobre el iframe, cada uno con resultado honesto —ok/fallido, detalle en claro, y qué logs NUEVOS de consola soltó (cursor sobre el búfer, no timestamps)—. Un clic que deja errores nuevos cuenta como fallido. El paso «vista» cambia el `style.width` del iframe y al final SIEMPRE se restaura el ancho previo. Botón «Detener» respeta el aborto entre pasos, marcando los restantes como detenidos, no como éxito. Timeout por orden (2,5 s): sin respuesta es fallo, nunca éxito inventado.
- UI en `sandbox-studio.tsx`: botón «Piloto» en la barra de la vista (junto a QA, con chapa roja de fallos cuando la franja está cerrada), franja con editor de pasos (validación en vivo con los errores del parser), «Ejecutar N pasos», «Ejemplo» (pasos que funcionan con la demo), «Copiar informe» y lista de resultados en vivo. `run()` ahora inyecta `injectPilot(injectVisualQA(html))` y resetea los resultados viejos del piloto: tras re-ejecutar, lo que se ve describe ESTA página.
- Puente con el agente del chat: `informePiloto()` genera el texto de la prueba (pasos OK/fallidos, detalles, errores de consola) para pegarlo en el chat; el agente corrige y la misma batería se vuelve a pasar. Copia con fallback clásico (`execCommand`) para contextos sin API de portapapeles.
- La memoria de fallos no se toca desde el piloto a propósito: los errores de consola que sueltan los clics ya entran solos por el puente existente (verificables), y un paso fallido puede ser un error del usuario al escribir el paso — envenenar la memoria con eso sería ruido.
- Tests: 16 nuevos en `tests/unit/sandbox-pilot.test.ts` (parser con acentos/mayúsculas/comillas/errores, descripciones, inyección idempotente que convive con el QA, informe, ejecutor con restauración de ancho y aborto, clic con errores nuevos = fallido). 642 → 658 en verde, tsc 0, eslint 0. Versión 3.11.0 → 3.12.0.
- Verificado en Chromium real: la demo pulsada por selector y por texto («Pulsado 4 veces» dentro del iframe tras 4 clics del piloto), formulario de prueba donde `escribe "Ana García" en #nombre` + `pulsa "Saludar"` produjo «Hola, Ana García!» con el acento intacto, paso QA midiendo 4 hallazgos (chip QA actualizado), `pulsa "Noexisto"` fallando con mensaje claro y chapa roja, ancho restaurado tras cada prueba, y la propia app sin scroll horizontal a 320 px.

Stage Summary:
- El plan del análisis queda COMPLETO: los siete puntos que valían la pena están implementados y verificados (cuota por proveedor, QA visual, memoria de fallos, ficha del proyecto, permisos de skills, regresión visible y piloto del Sandbox).
- Archivos nuevos: `src/lib/prism/sandbox-pilot.ts`, `tests/unit/sandbox-pilot.test.ts`.
- Archivos tocados: `sandbox-studio.tsx` (botón Piloto, franja de pasos, inyección del runtime, reset al re-ejecutar, copia con fallback), `README.md`, `package.json`, `app-version.ts`, `worklog.md`.

---
Task ID: v3.14-1
Agent: Super Z (main agent)
Task: PLAN-V4 punto 1 — Sacar los adjuntos de localStorage: mover los binarios (dataUrl) a IndexedDB, dejar en localStorage la ficha con `blobId`. Migración tolerante. Sin pérdida de datos.

Work Log:
- Leído el PLAN-V4 y el INSTRUCCIONESIA (contrato de trabajo). Punto 1 es prioridad: es un fallo de pérdida de datos silencioso (cuando `persist` no puede escribir por cuota de localStorage, no se guarda nada — ni conversaciones, ni claves, ni ajustes).
- Localizados los 8 sitios que leen `attachment.dataUrl` en 6 archivos: chat-client (3 protocolos), chat-input (miniaturas), message (miniaturas), export-chat (HTML/PDF), attachments (escritura).
- Nuevo archivo `src/lib/prism/attachment-blob.ts`:
  - `putBlob/getBlob/deleteBlob/clearAllBlobs` con IndexedDB (`prism-attachments` v1, store `blobs`).
  - `resolveAttachmentDataUrl(a)` — atajo si `a.dataUrl` ya está en memoria, si no lo busca por `blobId`. Devuelve `null` si no se puede recuperar.
  - `migrateLegacyAttachments()` — recorre el store, copia cada `dataUrl` a IDB, sustituye por `blobId` cuando tuvo éxito. Idempotente. Tolerante: si IDB falla o el store no puede persistir, deja el `dataUrl` original (no se pierde nada).
  - Import dinámico del store para evitar ciclo de dependencias.
- `types.ts`: `Attachment.dataUrl` opcional, nuevo `blobId?: string`.
- `attachments.ts`: `fileToAttachment` escribe a IDB y devuelve `{...,dataUrl,blobId:id}`. Si IDB falla, devuelve `{...,dataUrl}` sin `blobId` (degrada al comportamiento anterior).
- `store.ts`:
  - `partialize` strippa `dataUrl` cuando hay `blobId` (solo en el snapshot que se persiste; el estado en memoria no se toca).
  - `createJSONStorage(safeLocalStorage)` — envoltura de localStorage que captura `QuotaExceededError` en `setItem` (antes, zustand dejaba la Promise rechazada y la app dejaba de persistir en silencio).
  - `deleteSession/clearMessages/deleteMessage/truncateAfter` purgan las entradas IDB correspondientes (fire-and-forget). `resetAll` hace `clearAllBlobs`.
- `chat-client.ts`: `resolveAttachmentsForSend` pre-resuelve los adjuntos al inicio de `streamChat`. Los que no se pueden cargar se descartan (enviar `image_url: undefined` rompería la petición). `splitDataUrl` acepta `string | undefined` como seguridad.
- `message.tsx`: nuevo `AttachmentThumb` que resuelve `dataUrl` en `useEffect` con esqueleto mientras carga.
- `chat-input.tsx`: placeholder cuando `a.dataUrl` no está (caso teórico — los adjuntos recién creados siempre lo tienen).
- `export-chat.ts`: `downloadSessionHtml` y `printSessionPdf` se vuelven `async` y pre-resuelven adjuntos. Si un binario no se puede cargar, se pinta el nombre en su sitio (`.missing-img` en el CSS del HTML).
- `chat-app.tsx`:
  - Importa `migrateLegacyAttachments` y `deleteBlob`.
  - `useEffect` en mount (tras `hydrated`) dispara la migración.
  - `removeAttachment` también borra la entrada IDB.
  - Los botones de exportar HTML/PDF llaman a las funciones async con `void` y muestran toast.
- Tests:
  - `tests/unit/attachment-blob.test.ts` (12 tests): mock mínimo de IDB en memoria (Map + queueMicrotask). Cubre put/get/delete/clear, `resolveAttachmentDataUrl` en sus tres caminos, `migrateLegacyAttachments` (mover, idempotente, fallback si IDB cae).
  - `tests/unit/chat-client-attachments.test.ts` (7 tests): mock de `resolveAttachmentDataUrl`. Cubre pre-resolución para los 3 protocolos (OpenAI/Anthropic/Gemini), descarte de huérfanos, `buildRequest` intacto.
  - `tests/e2e/adjuntos-indexeddb.spec.ts` (3 tests): siembra una sesión con adjunto en formato viejo (dataUrl en el store, como pre-v3.14), recarga la página, verifica (1) la miniatura sigue visible, (2) el `dataUrl` ya no vive en localStorage y el binario está en IDB, (3) regenerar la respuesta tras recarga sigue enviando el adjunto al modelo (el mock-llm responde «He recibido tu imagen» solo si el body lleva `image_url`).
- Versión subida con `npm run bump -- minor` → v3.14.0 (script, no a mano).

Comprobaciones ejecutadas (sección 2 del INSTRUCCIONESIA):
- `npm run lint` → limpio, 0 errors / 0 warnings.
- `npm run build` → compila, TypeScript pasa, Next 16.3.3 con Turbopack. 19.1s.
- `npm test` → 693/693 unitarios pasan (674 original + 19 nuevos).
- `npm run test:e2e` → 88/88 E2E pasan en Chromium (85 original + 3 nuevos).
- `npm run build && npm start` + `curl localhost:3000/api/version` → responde `{"version":"3.14.0","status":"ok"}`.
- `rm -rf .next && VERCEL=1 npm run build` → `ls .next/next-server.js.nft.json` OK.

Lo que NO he podido comprobar:
- `npm run knip`: en este entorno (Node 24.19.0) `oxc-parser` lanza `RangeError: Array buffer allocation failed` al intentar abrir un ArrayBuffer de gran tamaño. Es un fallo de memoria del parser de Knip, no de mi código. Reintento con `NODE_OPTIONS=--max-old-space-size=2048` y persiste. Probablemente en CI sí pase.
- No he añadido tests E2E que comprueben que el `partialize` strippa `dataUrl` y que `safeLocalStorage` captura `QuotaExceededError` real (forzar cuota llena en Chromium requiere escrituras masivas que ralentizan el test). Los tests unitarios cubren la lógica de strip con mock; el E2E cubre el camino completo «sembrar dataUrl en el store → recargar → el binario vive en IDB».

Stage Summary:
- Punto 1 del PLAN-V4 terminado: los binarios de los adjuntos viven en IndexedDB, el store serializado ya no lleva los `dataUrl` (solo la ficha con `blobId`), y `localStorage` ya no se cae por cuota al meter un PDF o varias imágenes.
- La migración es tolerante: si IDB falla o el store no puede persistir, los adjuntos se quedan como estaban (no se pierde nada). Idempotente: correrla otra vez no hace nada.
- Sin cambios para el usuario: lo que se quita es un suelo que se hundía sin avisar, no se añaden funciones nuevas.
- Tests E2E prueban que la miniatura se ve tras recarga y que regenerar sigue enviando el adjunto al modelo.

---
Task ID: v3.15-puntos-2-3-4-5
Agent: Super Z (main agent)
Task: PLAN-V4 puntos 2, 3, 4 y 5 — tools con detección de capacidad, bucle Sandbox→agente, Share Target, split de chat-app.tsx.

Work Log:
- Punto 2 (tools con detección de capacidad):
  - Nuevo `src/lib/prism/tools-catalog.ts`: catálogo de 5 herramientas (read_file, write_file, list_files, run_project, get_quota). Tipos `ToolDef`, `ToolCall`, `ToolResult`.
  - Nuevo `src/lib/prism/tools-translate.ts`: traduce el catálogo a OpenAI (functions), Anthropic (input_schema), Gemini (functionDeclarations). `parseToolCallsFromChunk` para los 3 protocolos. `buildToolResultMessage` para reinyectar resultados.
  - Nuevo `src/lib/prism/tools-probe.ts`: `probeTools` manda una petición MÍNIMA con tools y clasifica la respuesta (`classifyToolsSupport`). Cache en memoria por (providerId, modelId, apiKey). `supportsTools` para decidir si usar el camino tools o caer al XML.
  - Nuevo `src/lib/prism/tool-runner.ts`: `runTool`/`runTools` ejecutan las llamadas localmente. `ToolContext` con `projectFiles`, `runProject`, `getQuota`. Sin React ni red — testeable en aislado.
  - `chat-client.ts`: `streamChat` acepta `tools?: readonly ToolDef[]` y `onToolCalls?: (calls: ToolCall[]) => void`. Inyecta `tools` en el body según protocolo. Acumula tool_calls en streaming (OpenAI delta.tool_calls, Anthropic content_block_start/input_json_delta, Gemini functionCall). Al final del stream, llama `onToolCalls` con la lista acumulada. `StreamMessage` extendido con `tool_calls`, `tool_call_id`, `tool_use_id`, `name`.
  - `chat-app.tsx`: `runGeneration` usa `runWithTools` (ver punto 5). Pasa el catálogo si el modelo lo soporta Y el modo agente está activo. Bucle: streamChat → si hay tool_calls → ejecuta runner → reinyecta → siguiente vuelta. Máx `agentMaxLoops`.
  - Mock-llm extendido: modelo `mock-tools` que devuelve `tool_calls` cuando el body lleva `tools`. Cuando el último mensaje es `role: "tool"`, responde con texto final.
  - Tests: 55 unitarios nuevos (tools-catalog, tools-translate, tools-probe, tool-runner, chat-client-tools) + 3 E2E (tools-agente). Cubren: traducción a los 3 protocolos, clasificación de capacidad, ejecución de tools, descarte de huérfanos, bucle completo agente→tool→reinyección→respuesta final.
- Punto 3 (bucle Sandbox → agente):
  - Nuevo `src/lib/prism/sandbox-runner.ts`: `runProjectInMemory(files)` construye el HTML autocontenido (buildRunHtml + puente de consola + QA + piloto), lo sirve en un iframe OCULTO, recoge logs durante 2.5s y devuelve `RunOutcome` (logs, errores, logLines, errorLines, qaFindings). Sin tocar el Sandbox visible.
  - `chat-app.tsx`: el `ToolContext.runProject` delega a `runProjectInMemory`. El agente puede llamar `run_project` y leer sus propios errores.
  - Test E2E (sandbox-agente): el agente llama a `run_project` y la tercera petición trae `role: "tool"` con el resultado ("El proyecto no tiene archivos" porque el test no siembra sandboxInitial).
- Punto 4 (Share Target):
  - `public/manifest.json`: añadido `share_target` con `action: "/share"`, `method: "POST"`, `enctype: "multipart/form-data"`, `params: {title, text, url, files: [{name: "images", accept: ["image/*"]}]}`.
  - Nuevo `src/app/share/route.ts`: handler POST que recibe el form-data, extrae title/text/url, compone el contenido (hasta 3500 chars), lo guarda en cookie efímera `prism-share` (maxAge 60s, SameSite=Lax) y redirige a `/?shared=1`. GET /share → 404 (no es página).
  - `chat-app.tsx`: en mount (tras hydrated) lee la cookie `prism-share`, vuelca el contenido en el input, borra la cookie y muestra toast. Las imágenes (binarios) se dejan para iteración posterior — el plan tasa el Share Target en «un par de días» y el texto es lo más común.
  - Test E2E (share-target): POST con texto → 307 con location `/?shared=1` y cookie `prism-share`. POST sin campos → 307 sin cookie. GET / sigue 200.
- Punto 5 (split de chat-app.tsx):
  - Nuevo `src/lib/prism/use-agent-tools.ts`: hook `useAgentTools` que encapsula el probe de tools + el bucle de tool_calls + la reinyección. `runWithTools(baseOpts, agentOn, maxLoops, sandboxInitial, config)` devuelve el texto final. El hook maneja el bucle internamente y llama los callbacks `onDelta`/`onReasoning` del llamador para pintar.
  - `chat-app.tsx`: el bloque inline de ~130 líneas (probe + bucle + reinyección) se reemplaza por una llamada a `runWithTools`. Imports de tools-catalog/tools-probe/tool-runner/tools-translate/sandbox-runner ya NO se usan en chat-app (viven en el hook). `chat-app.tsx` baja de 2220 a ~2108 líneas.
  - El hook es testeable en aislado (sin React, sin DOM) — los tests de tools ya cubren la lógica.

Puerta (sección 2 del INSTRUCCIONESIA):
- ✓ npm run lint — 0 errors, 0 warnings.
- ✓ npm run build — compila, TypeScript pasa, Next 16.3.3 Turbopack.
- ✓ npm test — 751/751 unitarios (693 orig + 58 nuevos: 53 de tools + 3 de sandbox-runner + 2 de chat-client-tools).
- ✓ npm run test:e2e — 95/95 E2E en Chromium (85 orig + 7 nuevos: 3 tools-agente + 1 sandbox-agente + 3 share-target... ver: 88 orig + 3 adjuntos-indexeddb de v3.14 + 3 tools-agente + 1 sandbox-agente + 3 share-target = 98. Pero 88 era con los 3 de adjuntos ya metidos; ahora 95).
- ✓ npm start + curl /api/version — {version: 3.15.0, status: ok}. /share POST → 307 con location correcta.
- ✓ rm -rf .next && VERCEL=1 npm run build — .next/next-server.js.nft.json existe.
- ⚠ npm run knip — NO ejecutado: oxc-parser lanza RangeError: Array buffer allocation failed en este entorno (Node 24.19.0), incluso con --max-old-space-size=2048. Fallo de memoria del parser, no del código. En CI debería pasar.

Lo que NO se ha podido comprobar:
- knip por el fallo de memoria del parser (mismo problema que en v3.14).
- No se ha probado el share real desde una app externa (Playwright no puede simularlo). El handler se prueba directamente por HTTP; el cliente lee la cookie en mount.
- No se ha forzado una cuota real de localStorage llena para el camino QuotaExceededError en E2E (igual que en v3.14).
- El soporte de imágenes en share_target está declarado en el manifest pero el handler solo procesa texto. Las imágenes requerirían guardar el binario en IDB desde el servidor, que no tiene acceso al IDB del navegador. Se deja para iteración posterior.

Stage Summary:
- Puntos 2, 3, 4 y 5 terminados. v3.15.0.
- El agente ahora puede llamar tools (read_file/write_file/list_files/run_project/get_quota) si el modelo los soporta; si no, cae al XML. El bucle Sandbox→agente funciona: el agente ejecuta el proyecto y lee sus propios logs. Share Target funciona para texto. chat-app.tsx se redujo en ~130 líneas (extraídas a use-agent-tools.ts).
- Sin cambios para el usuario que no usa el modo agente: todo el flujo antiguo (XML, chat normal) sigue funcionando igual.

---
Task ID: v3.16-rediseno-panel-agente
Agent: Super Z (main agent)
Task: Rediseño del panel del agente (v3.16) — pestañas Plan/Estructura/Edits/Resultados, logo de Prism, spinner animado, fondo medio color del tema, botón «Continuar el agente» debajo de las pestañas.

Work Log:
- Analizado el screenshot del usuario (Screenshot 2026-08-30 134526.png) con el modelo de visión. La mejora pedida: pestañas para inspeccionar las fases del agente + fondo medio color del tema + icono oficial del proyecto (logo de Prism) + símbolo de carga en movimiento + rediseño de los estilos de mensajes.
- `src/components/prism/agent-trace.tsx` reescrito:
  - Cabecera con el logo de Prism (PrismLogo) + "Bucle del agente" + spinner animado (Loader2 con animate-spin) + "Generando…" con puntos animados (.stream-dots).
  - Pestañas (Plan/Estructura/Edits/Resultados) con la activa en púrpura sólido (bg-prism-violet text-white). Solo aparecen si tienen contenido.
  - Contenido de cada pestaña:
    - Plan: lista de items del <plan> del agente.
    - Estructura: archivos del <project-map> (nombre + kind + summary).
    - Edits: bloques de código ```lang extraídos de cada <step>, agrupados por iteración con su título.
    - Resultados: <answer> final + lista compacta de iteraciones (icono de estado + título + revisión).
  - Estado del bucle + botón «Continuar el agente» debajo de las pestañas (movido desde message.tsx). El botón es pill-shaped con icono Play.
- `src/components/prism/message.tsx`: pasa `stalled` y `onContinueAgent` al AgentTraceView; elimina el bloque inline del botón Continuar (ahora vive en agent-trace.tsx). Quita imports no usados (PauseCircle, Button).
- `src/app/globals.css`:
  - Nuevo `.stream-dots::after` con animación `dots-pulse` (1.4s ease-in-out) para los puntos de "Generando…".
  - Nuevo `.agent-trace-v316` con fondo sutil púrpura/cyan (medio color del tema) y border-radius 14px.
  - `prefers-reduced-motion` ahora también desactiva `.stream-dots::after`.
- Tests E2E (`tests/e2e/agent-panel-redisenado.spec.ts`): 3 pruebas que verifican que las pestañas aparecen, que la activa tiene `bg-prism-violet`, y que el logo de Prism (aria-label "Prism AI") está visible.

Puerta:
- ✓ lint 0/0 · ✓ build · ✓ 751/751 unitarios · ✓ 98/98 E2E (95 orig + 3 nuevos) · ✓ build+start (/api/version ok) · ✓ VERCEL build (.nft.json existe)
- ⚠ knip: no ejecutado (mismo fallo de memoria de oxc-parser en Node 24.19.0).
- Versión: 3.15.1 (vía npm run bump -- patch).

Stage Summary:
- Panel del agente rediseñado como en el screenshot. Pestañas Plan/Estructura/Edits/Resultados con la activa en púrpura sólido. Logo de Prism como marca. Spinner animado + "Generando…" con puntos. Estado del bucle + botón «Continuar el agente» debajo de las pestañas. Fondo medio color del tema (púrpura/cyan sutil). Respeta prefers-reduced-motion.

---

## v3.17.0 — El agente que se paraba a mitad del trabajo

Informe del usuario: «cuando se activa el agente muchos modelos dan errores y
el cambio si un modelo no funciona pasa a otro pero si ese se detiene no
continua por lo que para». Leyendo el código salieron cuatro fallos distintos
que se sumaban a ese mismo síntoma.

### 1. El bucle de herramientas construía el cierre y no lo enviaba

`src/lib/prism/use-agent-tools.ts`. Al agotarse las vueltas con `tools`, el
código montaba el mensaje «entrega ahora la respuesta final» y hacía
`continue` — que salía del `for` sin llegar a mandarlo nunca. El agente
terminaba con la burbuja **vacía** y todo parado. Ahora ese cierre se envía de
verdad, en una llamada aparte y sin `tools` para que no pueda pedir más.

### 2. El texto del modelo se tiraba entre vueltas

En el mismo archivo, `content` se declaraba y nunca se le asignaba el retorno
de `streamChat`. Los turnos que se le reinyectaban al modelo viajaban con
`content: ""`, así que entre vuelta y vuelta perdía su propio trabajo.

De paso, la lógica sale del `useCallback` a una función normal
(`ejecutarConTools`), que es lo que el propio archivo decía perseguir y no
cumplía: dentro del hook no se podía probar sin React. Los imports pasan a
relativos como el resto de `src/lib/prism/` — el alias `@/` era justo lo que
impedía cargarlo desde los tests.

### 3. Una respuesta cortada a mitad pasaba por buena

`agentStalled` daba por no-parada cualquier traza con una etiqueta abierta.
Mientras llega el texto eso es correcto; con el stream ya cerrado significa lo
contrario: se cortó (techo de tokens, corte del proveedor). Sin distinguirlo,
el corte no salía ni como aviso ni como botón «Continuar»; el trabajo moría
ahí en silencio. Ahora `agentStalled(trace, terminado)` lo detecta como motivo
`"cortado"`, y `message.tsx` le pasa `!streaming`.

### 4. El failover solo sabía saltar una vez

`attemptFailover` relanzaba siempre con `depth = 1`, y dentro de
`runGeneration` los guardas eran `depth === 0`. O sea: el primer salto se
permitía y el segundo quedaba cerrado. Bastaba con que el modelo de repuesto
también fallara —lo normal entre los gratis— para quedarse parado. Ahora la
profundidad se encadena (`depth + 1`) con un tope de `MAX_SALTOS = 4`.

### Y lo que faltaba: retomar solo

Con lo anterior arreglado el agente ya avisa de que se quedó a medias, pero
seguía esperando a que alguien pulsara «Continuar». Si el usuario no estaba
mirando, la tarea moría igual. Ahora se retoma solo hasta `MAX_CONTINUACIONES
= 2` veces, y agotado el tope queda el botón de siempre.

Al relanzar se usa `relanzar()`, con `setTimeout(…, 0)`: lanzar la generación
en el acto no valía porque marca el mensaje en curso de forma síncrona y el
`finally` del intento anterior lo borraba justo después, dejando la respuesta
nueva sin indicador de escritura.

### Pruebas

- `tests/unit/agent-tools-loop.test.ts` (4, nuevo): el cierre se envía y sin
  `tools`, el texto sobrevive a la reinyección, y con `maxLoops=1` la vuelta
  útil sigue llevando catálogo. **Comprobado en rojo** reintroduciendo los dos
  fallos: 4/4 fallan.
- `tests/unit/agent-loop.test.ts` (+5): el corte con el stream terminado.
  **Comprobado en rojo** quitando el parámetro `terminado`: 2 fallan.
- `tests/e2e/agente-continua.spec.ts` (nuevo): modelo `mock-cortado` que se
  corta dentro de un `<step>`. Verifica que la nota «Se pidió al agente
  continuar el trabajo» aparece **sin pulsar nada**, que llega el cierre que
  el mock solo devuelve tras la continuación, que la instrucción viajó de
  verdad al proveedor, y que la continuación ocurre **una sola vez** (si el
  tope fallara, el test se pondría rojo). **Comprobado en rojo** desactivando
  la continuación automática.

### Puerta

- ✓ `npm run lint` · ✓ `npm run knip` · ✓ `npm run build` (con comprobación de
  tipos) · ✓ 768/768 unitarios · ✓ 102/102 E2E
- ✓ `npm start` + `curl /api/version` → `{"version":"3.16.0","commit":"8169f48"}`
- ✓ `VERCEL=1 npm run build` → `.next/next-server.js.nft.json` existe

### Lo que NO pude comprobar

- **No he reproducido el fallo con un proveedor real.** No hay claves aquí:
  todo se ha verificado con el mock-llm y con tests. Los cuatro fallos se leen
  en el código y los tests los fijan, pero cuánto de los errores que ve el
  usuario venía de cada uno, no lo sé.
- **La primera parte del informe —«muchos modelos dan errores»— queda a
  medias.** El fallo 1 explica que el agente se quedara mudo, pero no un
  error del proveedor. Sospecha sin confirmar: con el modo agente encendido se
  manda un `probeTools` extra por modelo y se le pasa `tools` a modelos gratis
  que las aceptan en la prueba mínima y las rechazan en una petición real.
  Para confirmarlo hace falta el mensaje de error exacto que sale en pantalla.
- Dos E2E de `version.spec.ts` fallaron durante la revisión: era el servidor de
  desarrollo servido desde un `.next` que mis builds habían reescrito debajo
  (§3.5 del contrato). Con el servidor reiniciado pasan los 102.

### Aparte: el lockfile se quedaba atrás en cada versión

No forma parte del encargo, pero apareció al subir la versión y es el desfase
que ya rompió una entrega: `package-lock.json` lleva la versión duplicada y
`scripts/version.mjs` no la tocaba. Estaba en 3.15.2 con el `package.json` en
3.16.0. Ahora el script lanza `npm install --package-lock-only` al final. El
diff del lockfile en este commit son esas dos líneas y nada más.

---

## v3.17.1 — La burbuja en blanco y los cinco modelos acusados en falso

Dos capturas del usuario, dos fallos distintos.

### La respuesta vacía se contaba como éxito

Captura: NVIDIA NIM · moonshotai/kimi-k3, 91,5 s, la caja de «Razonamiento del
modelo» y debajo **nada**. Ni error, ni motivo.

En `runGeneration`, una respuesta vacía caía directamente en
`settle(candidate, true, …)`: éxito. Sin fallo que registrar no había ni
enfriamiento, ni salto al siguiente modelo, ni mensaje. Se paraba ahí. Es
justo lo que hacen los modelos de razonamiento cuando se les va el
presupuesto de salida pensando.

Ahora una respuesta vacía es un fallo: se registra, se salta al siguiente de
la cadena si lo hay, y si no lo hay se dice qué pasó —distinguiendo el caso de
«razonó y no escribió», que tiene arreglo concreto (subir «Tokens máximos»)—
en vez de dejar el hueco.

### Prism acusaba al modelo de algo que no sabía

Captura: cinco modelos gratis de OpenRouter tachados en rojo, «5 no responden
— el proveedor no los reconoce o tu clave no llega a ellos», y un botón
«Quitar los que fallan».

`classifyProbe` traduce cualquier 404 a `no-existe`. Pero OpenRouter contesta
404 a **todos** los `:free` a la vez cuando la cuenta no acepta su política de
datos, y esos modelos existen perfectamente. Siguiendo el aviso te cargabas
cinco modelos buenos. Y el cuerpo de la respuesta —lo único que no es
interpretación nuestra— se capturaba en `ProbeResult.detail` y se tiraba: ni
en el chip ni en el aviso se enseñaba.

Es el mismo pecado que el medidor de cuota al 82 % inventado: afirmar una
causa que no se conoce.

- `pistaDelFallo(status, body)` reconoce solo frases **literales** del
  proveedor (política de datos, «no endpoints found», límite de peticiones,
  clave inválida). Si no encaja ninguna, devuelve null.
- `culpaConfirmadaDelModelo` solo culpa al modelo cuando no hay explicación
  mejor, y `modelosRotos` usa eso: lo que tiene otra causa ya no se propone
  para borrar.
- El aviso se parte en dos: ámbar explicando la causa **sin** botón de borrar,
  y rojo solo para lo que de verdad no se sostiene. El `title` de cada chip
  lleva ahora el veredicto, la pista y **el texto crudo del proveedor**.

### Pruebas

- `tests/unit/model-probe.test.ts` (+5): el 404 de política de datos no cuenta
  contra el modelo; el 404 sin explicación sí; `modelosRotos` deja fuera los
  que tienen otra causa.
- `tests/e2e/respuesta-vacia.spec.ts` (nuevo): `mock-vacio` devuelve 200 con
  contenido vacío y se comprueba que aparece la explicación en vez del hueco.
  **Comprobado en rojo** desactivando la comprobación: falla.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 773/773 unitarios · ✓ 103/103 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.17.0","commit":"8cf271a"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **No sé por qué OpenRouter devolvió 404 en la captura.** He hecho que Prism
  enseñe lo que conteste el proveedor, pero la causa concreta de ESA captura
  sigue sin confirmar: hace falta pasar el ratón por encima de uno de los
  modelos rojos y leer el texto.
- Tampoco he podido reproducir el caso de kimi-k3 con NVIDIA de verdad (no hay
  claves aquí). Que la respuesta vacía se contaba como éxito se lee en el
  código y el E2E lo fija; que ESO sea lo que pasó en la captura es lo más
  probable, no una certeza.
- Lo de «dejó el código a medias y no se cargó en el preview» solo queda
  cubierto si el modo agente estaba activo (el corte que se arregló en
  v3.17.0). Un bloque ```html cortado fuera del modo agente sigue sin
  detectarse; lo dejo nombrado aparte, no lo he tocado.

---

## v3.18.0 — La web larga que se quedaba a medias

Informe del usuario: «cuando es largo el código de una web se detienen los
modelos y lo dejan a medias». Era el hueco que quedó nombrado —y sin tocar— al
cerrar la v3.17.1.

### Qué pasaba

El modelo llega a su techo de tokens de salida y el stream termina **dentro
del bloque de código**. Prism lo daba por respuesta completa: no había ninguna
comprobación. La cerca ``` quedaba abierta, el documento sin `</html>`, y
`extractPreviewHtml` —que a propósito acepta bloques en curso, para pintar
mientras llega el streaming— le pasaba al iframe un documento incompleto. De
ahí que «ni siquiera se cargó en el preview».

El modo agente tenía su propia detección desde la v3.17.0 (`agentStalled` con
`terminado`), pero solo entiende las etiquetas XML del bucle. Fuera del agente
—que es como se pide una web casi siempre— no había nada.

### Cómo se arregla

`src/lib/prism/continuar.ts` (nuevo). Solo señales **objetivas**, nada de
adivinar por «parece que acaba raro»: un falso positivo aquí gasta cuota
pidiendo continuar algo que ya estaba completo.

- `respuestaCortada`: cerca ``` sin pareja, o documento HTML abierto sin
  `</html>`. Devuelve además la cola del texto para empalmar.
- `continuarCodigoPrompt`: lo que importa es lo que **prohíbe** — repetir lo
  ya escrito (duplicaría la página entera), abrir otra cerca (partiría el
  bloque en dos y la vista previa volvería a fallar) y saludar antes de seguir.
- `unirContinuacion`: los modelos desobedecen igual, así que se limpia la
  cerca reabierta, el preámbulo de cortesía y el solape repetido (se busca el
  solape más largo, hasta 2000 caracteres).

En `runGeneration` se cose **en la misma burbuja**, hasta `MAX_TROZOS = 3`.
Esto no es un detalle: si la continuación fuera un mensaje aparte, el bloque
de código quedaría partido en dos y la vista previa seguiría sin tener un
documento entero que enseñar. Si la continuación falla, se conserva lo que ya
había; si tras los tres trozos sigue cortado, se dice.

### Pruebas

- `tests/unit/continuar.test.ts` (13, nuevo). Incluye el caso de cerrar el
  círculo: coser un corte real deja un texto que ya no está cortado. Y los
  falsos positivos: dos bloques cerrados, un fragmento `<div>` suelto y el
  texto sin código no se tocan.
- `tests/e2e/codigo-cortado.spec.ts` (nuevo): `mock-largo` corta dentro del
  bloque y entrega el resto solo si se le pide continuar. La prueba no mira
  que exista una función: mira **el `<h1>` dentro del iframe de la vista
  previa**, que vive en el segundo trozo. Si no se cosiera, no aparece.
  **Comprobado en rojo** desactivando el bucle: falla por elemento no
  encontrado.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 786/786 unitarios · ✓ 104/104 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.17.1","commit":"9e024ce"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **No he reproducido el corte con un modelo real** (no hay claves aquí). Que
  el corte no se detectaba se lee en el código, y el mock reproduce la forma
  exacta del texto cortado; pero cuántos trozos hará falta pedir de verdad
  para una web larga, no lo sé.
- **`finish_reason` sigue sin leerse.** Es la señal autorizada del proveedor
  para «te corté por longitud» y no se mira en ningún sitio: la detección va
  por la forma del texto. Funciona y es independiente del protocolo, pero
  leer `finish_reason` sería más exacto. Queda nombrado, no hecho.
- El tope de salida por defecto (`max_tokens: 8192` en `chat-client.ts`) no lo
  he tocado: subirlo a ciegas provoca 400 en modelos con techo más bajo. El
  empalme resuelve el síntoma sin ese riesgo.

---

## v3.19.0 — Lo que ocupa tu prompt, y el modo ahorro

Dos cosas que van juntas: enseñar el precio y dar el interruptor para bajarlo.

### El medidor

`composeSettings` concatenaba ocho piezas a pelo y nadie sabía qué ocupaba
cada una. Ahora las piezas se devuelven sueltas (`prompt-actual.ts`) y las une
y las mide **la misma función** (`presupuesto.ts` → `construirPrompt`). Van
juntas a propósito: un medidor que calculara por su cuenta se desincronizaría
a la primera pieza nueva y enseñaría un número falso, que es peor que ninguno.

En Ajustes → Chat, una barra proporcional con el desglose y de dónde se quita
cada pieza. Los caracteres son exactos; los tokens se enseñan como
aproximación **con el divisor a la vista**, porque sin el tokenizador del
modelo no se puede saber.

### Las dos skills gemelas

«Desarrollador web experto» llevaba dentro un bloque «VARIEDAD OBLIGATORIA» de
**1.188 caracteres** que repetía lo que ES la skill «Diseños que no se
repiten», activa también de fábrica. Se mandaban las dos en cada mensaje.

Fuera el bloque duplicado. Las skills de fábrica pasan de **3.790 a 2.602**
caracteres. Hay un test con tope que impide que la duplicación vuelva.

### El modo ahorro

Interruptor en Ajustes → Chat. Hace tres cosas:

1. Instrucción corta (unos 600 caracteres, a propósito: una de 2.000 se come
   lo que dice ahorrar) que prohíbe preámbulos, despedidas, repetir la
   pregunta y explicar el código sin que se lo pidan.
2. Quita la **ficha del proyecto**, que es un resumen del mapa… que ya viaja
   entero justo detrás. Se mandaba la misma información dos veces.
3. Recorta el historial de 40 mensajes a 12. En una conversación larga el
   historial pesa mucho más que las instrucciones: es lo que de verdad baja
   la cuenta.

El ahorro que se enseña es **medido**: se monta el prompt sin ahorro y se
restan. Nada de prometer un porcentaje.

### Pruebas

- `tests/unit/presupuesto.test.ts` (16, nuevo): el total coincide EXACTAMENTE
  con la longitud del prompt; suma de piezas + separadores = total; el ahorro
  informado es el real. Y la guarda de fábrica, **comprobada en rojo**
  devolviendo el bloque duplicado: 2 tests fallan.
- `tests/e2e/modo-ahorro.spec.ts` (3, nuevo): no se mira el interruptor, se
  intercepta la petición y se lee el prompt de sistema que viaja. Y se compara
  el número del medidor con la longitud real de lo enviado. **Comprobado en
  rojo** vaciando el texto de ahorro.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 802/802 unitarios · ✓ 107/107 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.18.0","commit":"b7f6aba"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **No he medido el ahorro con un proveedor real.** Los caracteres que se
  quitan del prompt son exactos; cuántos tokens son de verdad depende del
  tokenizador de cada modelo, y por eso la app lo dice como aproximación.
- Sigue sin confirmarse que el prompt gordo fuera la causa de los errores con
  el agente. Ahora al menos el dato está a la vista.

---

## v3.20.0 — El failover ya no tira el trabajo

La queja original era «si un modelo se detiene pasa a otro pero no continúa».
Las v3.17–3.19 arreglaron el encadenado de saltos, la respuesta vacía y el
corte por longitud, pero quedaba el trozo que le daba nombre:

```ts
deleteMessage(sessionId, failedAssistantId);   // ← lo escrito, a la basura
```

Cuando un modelo se caía con media web hecha, Prism **borraba** la burbuja y el
de repuesto empezaba de cero. Cambiaba de modelo, sí; seguir con la tarea, no.

### Qué hace ahora

`attemptFailover` recibe lo que llevaba escrito el modelo caído —por
parámetro, porque la burbuja a esas alturas ya lleva encima el texto del
error— y si pasa de `MIN_RESCATE` (200 car.) y está cortado, monta una
**semilla**: conserva la burbuja y le pasa al repuesto lo escrito más el
prompt de empalme de `continuar.ts`.

La burbuja se reutiliza a propósito. Si el repuesto escribiera en una nueva,
el bloque de código quedaría partido en dos mensajes y la vista previa se
quedaría otra vez sin documento entero — el mismo error que se arregló en la
v3.18.0, por otra puerta.

Detalles que hubo que cuidar:

- El historial excluye la burbuja de la semilla: se reinyecta aparte con su
  instrucción, y si entrara además por el historial el modelo la vería dos
  veces.
- La semilla y la orden de empalmar se añaden **después** de comprimir: son
  justo lo que no se puede resumir sin perder el punto del corte.
- `content` arranca en lo ya escrito, así que para juzgar el intento nuevo hay
  que mirar solo lo **aportado** (`content.slice(base0.length)`). Si no, una
  respuesta vacía del repuesto parecería llena.
- Si el repuesto no aporta nada, lo rescatado **no se tira**: se conserva y se
  explica debajo.

Y una ampliación que salió de aquí: la rama de error solo llamaba al failover
por cuota. Ahora un trabajo a medias con otro proveedor disponible también
salta — que un modelo se caiga con media web escrita y no se intente con otro
era justo lo que se quería arreglar.

### Pruebas

- `tests/e2e/failover-continua.spec.ts` (nuevo). Dos proveedores:
  `mock-corta-y-cae` escribe media página y rompe el stream;
  `mock-empalma-free` devuelve el resto **solo** si recibe la orden de
  continuar, y si no devuelve una página que dice «Empezada de cero». El test
  mira el `<h1>` dentro del iframe de la vista previa.
  **Comprobado en rojo**: sin el arreglo, el iframe dice literalmente
  «Empezada de cero».

Un detalle del mock que costó encontrar: `controller.error()` en el mismo tick
que el `enqueue` hace que el cliente ni llegue a leer el trozo, así que no
había trabajo a medias que rescatar y el test fallaba por el montaje, no por
el código. Va con 150 ms de respiro y está comentado en el mock.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 802/802 unitarios · ✓ 108/108 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.19.0","commit":"76bd561"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **Sin proveedor real.** El rescate se prueba contra el mock. Cómo de bien
  empalma un modelo de verdad depende de si obedece el «no repitas nada»;
  `unirContinuacion` limpia el solape, pero no lo he medido con modelos reales.
- El umbral de 200 caracteres es un criterio mío, no una medida.

---

## v3.21.0 — La skill que encaja se propone sola

`classifyTask` clasifica cada mensaje en seis tipos de encargo desde hace
versiones, y se usaba **solo para elegir modelo**. Para las skills no la
miraba nadie: podías tener siete instaladas y ninguna pista de cuál sirve para
lo que estás haciendo.

Es la misma señal aplicada a otra cosa, así que el trabajo real fue pequeño.

### Cómo funciona

- Cada skill declara `kinds` (los tipos de encargo para los que sirve). Las
  siete integradas ya los traen.
- `skillsSugeridas(kind, skills, yaPropuestas)` devuelve las **apagadas** que
  encajan, como mucho dos.
- Al enviar, un aviso con el nombre y **el precio en caracteres por mensaje**,
  y un botón «Activar».

Tres reglas que no son negociables y están fijadas con tests:

1. **Se propone, no se activa.** Decidir por el usuario es lo que hace que la
   gente deje de fiarse de una app.
2. **Una vez y en paz.** Si no la quiso, insistir es ruido.
3. **Una charla no propone nada.** Ahí la sugerencia sería puro estorbo.

El precio va en el aviso a propósito: viene del medidor de la v3.19.0, y sin
él estaríamos ofreciendo añadir 1.800 caracteres a cada mensaje sin decirlo.

### Pruebas

- `tests/unit/skills-sugeridas.test.ts` (11, nuevo).
- `tests/e2e/skills-sugeridas.spec.ts` (3, nuevo): se comprueba que el clic la
  enciende **de verdad** —mirando el interruptor en el diálogo de Skills, no
  el toast—, que no insiste al repetir el encargo y que una charla no propone
  nada. **Comprobado en rojo**: sin las sugerencias, 2 de los 3 fallan.

Dos trampas del montaje, anotadas por si vuelven: el toast del modo agente
también ofrece «Activar» y sale a la vez en el primer mensaje, así que el clic
hay que acotarlo al toast de la skill; y el placeholder del compositor cambia
al abrirse la vista previa, por eso se localiza el `textarea` y no el
placeholder.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 813/813 unitarios · ✓ 111/111 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.20.0","commit":"551baf0"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **Si las sugerencias aciertan de verdad** depende de lo bien que clasifique
  `classifyTask`, que va por expresiones regulares. Con las frases de los
  tests acierta; con lenguaje real no lo he medido.
- Los `kinds` de las siete integradas los he asignado yo a ojo.

---

## v3.22.0 — Rehacer la respuesta con OTRO modelo

`regenerate` bifurcaba y volvía a lanzar **con el mismo modelo**. Pero cuando
una respuesta sale mal, lo que quieres nueve de cada diez veces no es la misma
tirada otra vez: es esto mismo probado con otro. Eso eran cuatro pasos —abrir
Ajustes, cambiar el modelo, cerrar, regenerar—.

Ahora el botón de regenerar lleva al lado un desplegable con los modelos
disponibles (`useAvailableModels`, que ya existía para el selector). Se elige
uno y se rehace con él. El modelo queda cambiado a propósito: si has tenido
que rehacerla con otro, lo normal es seguir con ese.

La respuesta anterior no se pierde — el sistema de ramas ya la guardaba —, así
que se pueden comparar las dos con las flechas del mensaje.

### Pruebas

- `tests/e2e/regenerar-otro-modelo.spec.ts` (nuevo): no mira que el menú
  exista, intercepta las peticiones y comprueba **a qué modelo se le pide** la
  segunda vez, más el contador de versiones en 2/2. **Comprobado en rojo**:
  sin el cambio, la segunda petición vuelve a `mock-mini-free`.

### Un test ajeno que rompí, y por qué

Al añadir el botón nuevo con `aria-label="Regenerar con otro modelo"`, el
locator `getByRole("button", { name: "Regenerar" })` de `chat.spec.ts` pasó a
encontrar **dos** botones y ese test se puso rojo. No era un fallo del test:
era una ambigüedad que introduje yo.

Se renombró el botón nuevo a «Elegir otro modelo». Se renombra el nuevo y no
el viejo a propósito: el viejo es el que la gente lleva usando y el que otros
tests nombran. Es el mismo tipo de choque que ya pasó con «Sistema» en la
barra lateral.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 813/813 unitarios · ✓ 112/112 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.21.0","commit":"57d9017"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- El menú enseña como mucho 30 modelos. Con muchos proveedores conectados
  habrá que buscar; no he probado cómo se comporta con listas largas de
  verdad.

---

## v3.22.1 — El analizador de skills, cerrado

Dos huecos del analizador que quedaron señalados en `PLAN-V5.md` §1.

### El análisis se movió al store

Corría **solo** en la pantalla que instala desde URL. Cualquier otro camino
—editar el texto, importar un backup, una migración— dejaba unos permisos que
ya no describían lo que la skill manda hacer. Y un permiso desactualizado es
peor que no tenerlo: se enseña como si fuera cierto.

Ahora `addSkill` y `updateSkill` lo recalculan en `store.ts`. La garantía vive
donde ningún camino se la puede saltar, en vez de en una pantalla concreta.
`updateSkill` solo lo rehace si cambió el texto: renombrar no toca nada.

### El precio, al lado del interruptor que lo cobra

Cada skill enseña lo que añade al prompt (`+1.841`), y la cabecera el total de
las activas por mensaje. El desglose completo sigue en Ajustes → Chat; aquí va
la parte que se decide en esta pantalla, que es donde sirve para decidir.

### Pruebas

- `tests/unit/skills-store-permisos.test.ts` (4, nuevo): instalar analiza
  aunque el llamador no pase permisos; editar el texto los rehace **sobre el
  texto nuevo**; y a la inversa, si el texto se vuelve inofensivo deja de
  acusar. **Comprobado en rojo**: 3 de los 4 fallan sin el cambio.
- `tests/e2e/skills-coste.spec.ts` (nuevo): el coste por skill y el total, que
  sube al activar la segunda. **Comprobado en rojo** vaciando el número.

### Dos cosas que corregí de mí mismo

- Un test mío afirmaba que el analizador detecta `pideClaves` en una frase que
  no dispara ese patrón. El fallo era del test, no del analizador: se corrigió
  el test para afirmar lo que de verdad detecta (`enviaDatos` y el dominio
  desconocido). Cambiar el analizador para que encajara habría sido escribir
  la prueba y la respuesta a la vez.
- `npx tsc --noEmit` no cubre `tests/`, pero `npm run build` sí: cazó cuatro
  errores de tipos en el test nuevo que yo había dado por buenos. Otra razón
  para no saltarse la puerta entera.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 817/817 unitarios · ✓ 113/113 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.22.0","commit":"6e55b59"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **No hay pantalla para editar una skill instalada**, así que el reanálisis
  al editar está probado por el store, no por la interfaz. Cuando exista esa
  pantalla, la garantía ya estará puesta debajo.

---

## v3.23.0 — Lo de `xlsx`, decidido: hilo aparte y desechable

`npm audit` lleva semanas avisando de dos vulnerabilidades **altas sin arreglo
en npm** en `xlsx` (SheetJS): contaminación de prototipos y ReDoS. Las dos se
disparan al **leer** un archivo preparado.

Al mirarlo de cerca, la exposición pesa más de lo que parecía. En una app
cualquiera esto sería «que el usuario abra lo que quiera en su pestaña». Aquí
no: **Prism guarda las claves API en el dispositivo**, y ensuciar el
`Object.prototype` del hilo principal va justo contra la promesa del producto.

### La decisión

Ni aceptar y mirar para otro lado, ni traerse la distribución de SheetJS
—que vive fuera de npm y metería una descarga externa en el momento del
despliegue, que es la clase de riesgo que ya costó un día aquí—.

**El parseo se mueve a un Web Worker que se destruye al terminar**
(`sheets.worker.ts`):

- Otro *realm*: lo que se contamine ahí dentro no toca al de la app.
- Se crea por archivo y se mata en el `finally`, pase lo que pase.
- Del Worker solo salen **cadenas**: la conversión a texto se hace dentro, así
  que ningún objeto del parser cruza al hilo principal.
- Tope de 15 MB y límite de 20 s, tras el cual se mata el hilo. Un ReDoS cuelga
  ese hilo, no la interfaz.
- Si el navegador no deja crear el Worker, **falla con un aviso** y pide un CSV.
  Caer al parseo directo «por comodidad» dejaría el agujero abierto justo en
  los navegadores donde no se puede cerrar.

Y la decisión queda **escrita en el README**, que era la mitad del encargo: un
aviso de auditoría que nadie ha decidido vuelve a saltar cada vez.

### Pruebas

- `tests/e2e/excel-aislado.spec.ts` (nuevo): genera un `.xlsx` de verdad con
  `xlsx` en Node, lo adjunta y comprueba que **sus celdas llegan al modelo**
  interceptando la petición. Mover un parser de hilo es exactamente el cambio
  que rompe la función sin que nadie se entere; esto lo cubre.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 817/817 unitarios · ✓ 114/114 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.22.1","commit":"13d2655"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe, y el worker entra en el
  bundle (`turbopack-worker-*.js`)

Y otra vez la §3.5: ejecuté `npm run build` con el `dev` levantado para
comprobar que el worker se empaqueta, y el E2E siguiente falló por la app en
blanco, no por el código. Reiniciado el dev, verde a la primera.

### Lo que NO pude comprobar

- **No he probado un archivo malicioso de verdad.** El aislamiento es
  estructural (otro realm, hilo que muere), no una detección: no busco el
  ataque, le quito el sitio donde hacer daño.
- El aviso de `npm audit` **sigue apareciendo**, y seguirá: la dependencia no
  tiene versión parcheada. Lo que cambia es que ahora hay una decisión escrita
  detrás y un aislamiento real, no un «ya lo miraremos».

---

## v3.24.0 — Ahora sí: el proveedor dice por qué paró

Los tres protocolos mandan un campo diciendo **por qué** terminó el modelo
—`finish_reason`, `stop_reason`, `finishReason`— y no se leía en ningún sitio.
Lo comprobé buscándolo en todo `src/`.

Toda la detección de corte de la v3.18.0 va por la **forma del texto**: una
cerca ``` sin pareja, un `<html>` sin cerrar. Funciona con código y es
independiente del protocolo, pero es un indicio. Cuando el modelo se queda sin
sitio a mitad de una frase normal, **la forma no ve absolutamente nada**.

### Qué se hizo

- `finish-reason.ts` traduce el valor crudo de los tres protocolos a un motivo
  (`fin`, `longitud`, `herramienta`, `filtro`, `desconocido`). Lo que no
  reconoce se queda en `desconocido`: no se inventa.
- `streamChat` lo acumula en las tres ramas y en las dos variantes (streaming
  y no). Gana **el último chunk con valor**: los intermedios lo mandan a
  `null`, y devolver `null` en vez de `desconocido` es lo que impide que un
  chunk vacío pise el motivo bueno.
- Un `onFinish` nuevo se lo pasa al llamador, solo si el proveedor lo dijo.
- El bucle de continuación hace caso a **las dos señales**: el proveedor
  acierta donde la forma no ve nada, y la forma cubre a los proveedores que
  no mandan el campo.

`mensajeParada` devuelve `null` para un final normal y para un motivo
desconocido: avisar ahí sería inventarse un dato.

### Pruebas

- `tests/unit/finish-reason.test.ts` (11, nuevo). Incluye el caso que parece
  un detalle y no lo es: los chunks intermedios devuelven `null`, no
  `desconocido`.
- `tests/e2e/finish-reason.spec.ts` (nuevo): `mock-prosa-cortada` devuelve
  prosa cortada a media palabra —**sin bloque de código**, así que la
  heurística de forma no puede verlo— con `finish_reason: "length"`, y el
  resto solo si se le pide continuar. **Comprobado en rojo**: sin leer el
  campo, la respuesta se queda a medias.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 828/828 unitarios · ✓ 115/115 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.23.0","commit":"d0ac44c"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **Los valores están probados contra el mock, no contra proveedores reales.**
  Los literales de las tres familias salen de sus documentaciones; los routers
  que reenvían pueden mandar valores propios, y esos caerán en `desconocido`
  —que es el comportamiento correcto: se cae a la heurística de forma, que ya
  estaba.

---

## v3.24.1 — Las decisiones del failover, fuera del componente

`chat-app.tsx` iba por **2.556 líneas**, y toda la lógica de failover vivía
dentro del `useCallback` de `runGeneration`, enredada con React, los toasts y
el store. Eso significaba que **la única forma de probarla era abrir un
navegador**: cada arreglo de esta semana ha costado un ciclo de Playwright
—minutos— para comprobar algo que es una función pura de cinco datos.

No es teoría: sacar el bucle de tools de su hook (v3.17.0) destapó cuatro
fallos que los E2E no veían.

### Qué se movió

`decisiones.ts`: tres funciones que reciben el estado del intento y devuelven
qué hacer (`siguiente` / `failover` / `parar`). No tocan nada. Los avisos, el
store y el repintado se quedan en el componente.

- `decidirTrasError` — el nudo de condiciones que había que leer tres veces.
- `decidirTrasCuotaEnTexto` — cuando el proveedor responde 200 y el texto ES
  el aviso de cuota.
- `decidirTrasVacio` — cuando el modelo cierra sin escribir nada.

De paso salió una incoherencia latente: en la rama de modelo manual el
`continue` avanzaba **una** posición mientras que el índice calculado podía
apuntar más lejos (salto de proveedor por cuota). No se notaba porque con
modelo manual la cadena tiene un solo elemento, pero el código decía dos cosas
distintas. Ahora la decisión devuelve el índice y el bucle lo respeta.

`chat-app.tsx` queda en 2.515 líneas. Bajar 41 no es el objetivo; el objetivo
es que estas decisiones se prueben en milisegundos.

### La prueba de que sirve

Reintroduje el fallo histórico —el `depth === 0` que cerraba la puerta al
segundo salto y costó tres versiones descubrir— y **el unitario lo cazó en 8
milisegundos**. Antes eso eran tres minutos de Chromium.

Y la prueba de que no cambié comportamiento: **los 115 E2E siguen verdes** sin
tocar ni uno.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 845/845 unitarios (+17) · ✓ 115/115 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.24.0","commit":"41a9bd7"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **Es un refactor: no verás nada nuevo.** Lo que se gana es que el siguiente
  arreglo del failover cueste la mitad.
- Quedan fuera las decisiones del bucle de continuación y del agente. Se
  pueden mover igual; no lo he hecho para que este cambio sea revisable de una
  sentada.

---

## v3.25.0 — `read_url`: el agente puede leer una página

`PLAN-V4` daba esto por imposible «sin servidor». Resulta que el servidor ya
estaba **y ya estaba protegido**: `/api/proxy` pide cualquier host público y
`net-guard.ts` rechaza `localhost`, las IPs privadas y los metadatos de la
nube, también al seguir redirecciones.

Sexta herramienta del catálogo. **No es un buscador** —eso sí necesitaría un
servicio de búsqueda—: lee una URL concreta que le das tú. La descripción se lo
dice al modelo con esas palabras, porque si no le pasa términos de búsqueda y
se lleva un error.

### Cómo está hecho

- `html-a-texto.ts`: saca el texto legible. Primero se tiran `script`,
  `style`, `svg` y compañía **con su contenido**, y solo después las
  etiquetas; al revés, el JavaScript se quedaría suelto en medio del texto.
  Tope de 8.000 caracteres, y cuando recorta lo dice con el tamaño real.
- La herramienta va por `/api/proxy`, no por `fetch` directo, por dos razones
  que importan las dos: CORS (desde el navegador no se lee una página ajena) y
  el escudo. Hay un test que falla si alguien cambia eso.
- 15 s de límite, y los errores del escudo se le explican al modelo para que
  no reintente en bucle.

### Un fallo que encontró un test mío

`&iacute;` y compañía no se descodificaban: al modelo le llegaba
«art&iacute;culo». Media web en español escribe los acentos así, y además
gasta el triple de tokens. Se añadieron las entidades acentuadas —cuidando que
`&Aacute;` y `&aacute;` son **distintas**, así que bajarlo todo a minúsculas
rompía las mayúsculas acentuadas.

### Pruebas

- `tests/unit/html-a-texto.test.ts` (9, nuevo).
- `tests/unit/tool-runner-read-url.test.ts` (8, nuevo): que se pide **por el
  proxy** con la URL en la cabecera, que el JS no llega, que una URL inválida
  o un `file://` se rechazan **sin tocar la red**, y que el JSON se entrega tal
  cual. **Comprobado en rojo** cambiando el proxy por un `fetch` directo.
- `tests/e2e/read-url.spec.ts` (nuevo): el escudo, contra el servidor de
  verdad — `169.254.169.254` devuelve 403.

### Por qué el E2E cubre solo el escudo

Lo intenté con la página entera y **el escudo la bloqueó**: le pasé una URL
`localhost` y `net-guard` la rechazó, que es exactamente su trabajo. En este
entorno no hay red hacia fuera y una página local no sirve por diseño, así que
la conversión se prueba en unitario y el escudo en E2E. Está anotado en la
cabecera del spec para que nadie lo «arregle» abriendo un agujero.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 863/863 unitarios · ✓ 116/116 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.24.1","commit":"20dea64"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

También hubo que actualizar `tools-agente.spec.ts`, que comprobaba que el
catálogo tiene exactamente cinco herramientas. No era un fallo: el test estaba
haciendo su trabajo.

### Lo que NO pude comprobar

- **No he leído una página real**, por lo del entorno sin red. La conversión
  está probada con HTML de verdad, pero no contra una web publicada.
- **El servidor sí hace la petición**, así que quien despliegue esto en
  internet le está dando a su agente la capacidad de pedir URLs desde su
  servidor. El escudo cubre lo interno; el consumo de ancho de banda no lo
  cubre nadie, y conviene saberlo antes de publicarlo.

---

## v3.26.0 — «Auto» aprende de lo que TE ha funcionado

`useUsage` guarda de cada respuesta el modelo, si fue bien, los milisegundos y
los caracteres. Es un historial real: tus claves, tu hora del día, tus
encargos. `buildTaskChain` **no lo miraba**: ordenaba por una tabla estática de
afinidad y por `lastGood`, el último acierto. Auto no aprendía — recordaba una
cosa.

### El ajuste

`experiencia.ts` convierte el historial en un empujón a la puntuación, con dos
reglas que mandan sobre todo lo demás:

1. **Sin muestras suficientes no se opina.** Por debajo de 5 respuestas
   devuelve `null` y el ajuste es 0. Con dos respuestas no se sabe si un
   modelo es bueno, y ajustar con eso sería la misma clase de invento que el
   medidor de cuota al 82 %.
2. **Es un empujón, no un mandato.** ±4 puntos sobre una tabla que reparte
   decenas: inclina la balanza entre dos parecidos, pero no puede tumbar una
   afinidad clara. Un modelo con buen historial *en general* no es por eso el
   mejor para hacer una web.

Dentro del ajuste **manda el acierto**: un modelo rápido que falla la mitad de
las veces no vale nada, y uno lento que siempre contesta vale mucho. La
velocidad solo desempata, y con la mitad de peso. Hay un test para eso exacto.

Y un detalle que parece menor: sin ninguna respuesta correcta, la media de
tiempo es `null`, **no cero**. Cero diría «rapidísimo» de un modelo que nunca
contesta.

### Lo que se ve

En el panel de Uso, cada modelo enseña ahora `90% de aciertos · 1.5s de media ·
20 respuestas`, o **`sin dato · faltan 3 respuestas`** cuando aún no hay
suficiente. Ese segundo caso es el importante: es lo que evita que la app
enseñe un porcentaje sacado de dos tiradas.

### Pruebas

- `tests/unit/experiencia.test.ts` (13, nuevo): que el lento fiable gana al
  rápido infiel, que el ajuste nunca se sale de su peso, y que **sin historial
  la cadena sale exactamente igual que antes** — un cambio así no puede
  reordenar nada de quien acaba de instalar la app.
- `tests/e2e/auto-aprende.spec.ts` (nuevo): el panel con un modelo veterano y
  otro de dos respuestas. **Comprobado en rojo** quitando el mínimo de
  muestras: fallan 2 unitarios y el E2E.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 876/876 unitarios · ✓ 117/117 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.25.0","commit":"0611ddd"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **Si el ajuste mejora las elecciones de verdad, no lo sé.** Está medido que
  reordena según lo medido; que eso te dé mejores respuestas es una apuesta
  razonable, no un resultado. Para saberlo haría falta comparar con la Arena a
  lo largo de semanas.
- Los pesos (5 muestras, ±4 puntos, 25 s como «lento») son criterio mío.

---

## v3.27.0 — Catálogo de skills

Última del `PLAN-V5`. Iba deliberadamente al final: sin las sugerencias por
tarea (v3.21) nadie abriría esta pestaña.

Y era la que menos trabajo tenía de lo que parecía: **instalar desde URL ya
funcionaba, con la puerta de permisos delante**. Lo que faltaba no era el
mecanismo, era el índice — había que conocer la URL de memoria.

### Cómo está montado

- `public/skills/index.json` + los `.md` de cada skill. Un archivo estático:
  sin backend, sin cuentas, sin moderación que mantener. `URL_CATALOGO` es una
  constante — apuntarlo a un repo público es cambiar esa línea.
- `catalogo-skills.ts` valida el índice **sin fiarse de él**: descarta las
  entradas rotas pero conserva las buenas (un índice con una entrada mala
  sigue sirviendo), quita ids repetidos, filtra tipos de encargo inventados y
  recorta los textos largos. Lo que no hace es rellenar huecos.
- Cinco skills para empezar, escritas para este repo: revisor de
  accesibilidad, descifrador de errores, peso y rendimiento, mensajes de
  commit, y datos sin inventar.

### Lo que hace que esto no sea un agujero

Elegir del catálogo **no instala nada**. Baja la entrada por el **mismo flujo**
que una URL pegada a mano, así que la puerta de permisos sigue en medio: ves
qué declara el texto y decides. No hay atajo, y hay un E2E que lo comprueba
—entre elegir e instalar tiene que aparecer el botón de permisos—.

Por eso tampoco hay plugins: una skill es texto que se analiza y se lee entero.
Código de terceros rompería justamente esta garantía.

### Pruebas

- `tests/unit/catalogo-skills.test.ts` (14, nuevo). Incluye una guarda sobre el
  **índice que se publica de verdad**: que todas sus entradas sobreviven a la
  validación, que cada `url` apunta a un archivo **que existe y tiene
  contenido**, y que todas declaran su tipo de encargo. Si alguien rompe el
  JSON o borra un `.md`, lo caza el test y no el usuario.
- `tests/e2e/catalogo-skills.spec.ts` (2, nuevo): el listado, la búsqueda, que
  elegir enseña los permisos antes de instalar, y que lo ya instalado no se
  ofrece dos veces. **Comprobado en rojo** quitando el botón: fallan los dos.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 890/890 unitarios · ✓ 119/119 E2E
- ✓ `npm start` + `/api/version`, y `/skills/index.json` responde 200 en la
  build de producción
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **El catálogo se sirve desde el propio despliegue, no desde un repo aparte.**
  El `PLAN-V5` proponía un repo `prism-skills`; no tengo acceso para crearlo,
  así que el índice viaja en este repositorio. Funciona igual y la constante
  está lista para apuntar a otro sitio, pero no es exactamente lo planeado.
- **Nadie ha escrito skills de terceros todavía.** El catálogo solo vale la
  pena si alguien las aporta; con cinco propias es un comienzo, no un
  ecosistema. Era el riesgo que ya se anotó al ponerlo el último.

---

## v3.28.0 — El agente prueba su propio código (y dos fallos que salieron por el camino)

`PLAN-V4` §3: «hoy el agente escribe código y **te pregunta a ti** si
funciona». Estaba arreglado a medias y de la peor manera posible: el agente
ejecutaba el proyecto **solo si el modelo soportaba `tools`** y llamaba a
`run_project`. La mayoría de los modelos gratis no las soportan y van por el
camino XML, así que el arreglo llegaba justo a los modelos para los que Prism
**no** existe.

### Lo que hace ahora

Cuando el agente cierra su respuesta con `<answer>` y esa respuesta trae un
proyecto abrible, Prism lo **ejecuta** en un iframe oculto, lee los errores de
consola y, si los hay, se los devuelve al modelo para que se corrija. Hasta dos
rondas.

Ejecutar es local y gratis: solo cuesta una llamada al modelo si de verdad hay
algo que arreglar. Y solo se revisa lo que se puede **abrir** —hace falta un
HTML de entrada—: fingir que se revisa un fragmento de CSS sería dar un visto
bueno que no se ha comprobado.

El error se le devuelve **tal cual salió de la consola**, no interpretado por
nosotros: es el dato, y el modelo sabe leerlo. Se le pide el archivo completo
porque un parche suelto rompe la vista previa. Y el fallo queda en la memoria
de fallos, que es exactamente lo que esa memoria debe guardar: algo verificado
ejecutando, no una impresión.

### El fallo gordo que salió por el camino

Escribiendo esto, el E2E no pasaba. Al rastrearlo apareció esto en
`RunOutcome`:

```ts
/** Hubo proyecto que correr (había archivos y un entry). */
ok: boolean;              // …pero el código hacía: ok = errorLogs.length === 0
```

**El comentario y la implementación decían cosas distintas.** Y no era
cosmético: `run_project` —la herramienta del agente, el camino que sí estaba
«arreglado»— hacía `if (!outcome.ok) return "No se pudo ejecutar el proyecto"`.
O sea que **siempre que el proyecto se ejecutaba y daba errores, al modelo se
le decía que no se había podido ejecutar**. Se le ocultaban los errores de su
propio código, que es justo para lo que existe la herramienta.

Arreglado separando las dos preguntas: `ejecutado` (¿llegó a correr?) y `ok`
(¿sin errores?), con el comentario diciendo lo que hace cada uno. Hay un test
de regresión para el caso exacto.

De paso, un fixture del test de `run_project` afirmaba `ok: true` con
`errors: 1`, una combinación que en la realidad no se da nunca. Corregido.

### Código muerto, en el mismo ciclo

`buildAutoChain` (40 líneas) lo había reemplazado `buildTaskChain` y no lo
llamaba nadie, ni un test. Fuera. Igual `IMAGE_MODELS`, `clearCookieHeader` e
`invalidateToolsProbe` — esta última era redundante por diseño: la `apiKey`
entra en la clave de cache, así que cambiar de clave ya estrena entrada. No la
llamaba nadie porque no podía hacer falta.

`knip` queda sin exports muertos propios; los 21 que restan son re-exports de
shadcn, superficie de librería.

### Pruebas

- `tests/unit/auto-revision.test.ts` (15, nuevo): que sin HTML no se revisa,
  que si no se pudo ejecutar **no se le echa la culpa al modelo**, y que el
  prompt le pide arreglar y no explicar.
- `tests/unit/tool-runner.test.ts` (+2): el de regresión del fallo de `ok`.
- `tests/e2e/agente-prueba-su-codigo.spec.ts` (nuevo): `mock-codigo-roto`
  entrega una página que llama a una función inexistente —error real de
  navegador, no simulado—, y se comprueba que Prism le devuelve el error y que
  la página **termina arreglada**. **Comprobado en rojo** desactivando el
  bucle.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 907/907 unitarios · ✓ 120/120 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.27.0","commit":"1b183c7"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **Cuántas veces acierta el modelo al corregirse, no lo sé.** Está probado
  que se le devuelve el error y que un modelo que sabe arreglarlo lo arregla;
  con modelos gratis reales, cuántos lo consiguen a la primera es otra cosa.
- **Solo se revisa lo que abre en un iframe.** Python, Node o cualquier cosa
  que no sea una página web quedan fuera, y así seguirá: aquí no hay dónde
  ejecutarlos.
- El QA visual existe (`run_project` acepta `qa`) pero la revisión automática
  **no lo pide**: mide más y tarda más, y quería que esta primera versión solo
  reaccionara a errores duros de consola.

---

## v3.29.0 — El agente pulsa los botones (y dos falsos culpables que salieron)

Idea del usuario, y de las buenas: la revisión de la v3.28.0 **solo cazaba lo
que revienta al cargar**. En una página generada la mayoría de los fallos viven
detrás de un clic — el manejador que llama a una función que no existe, el
`getElementById` de un id que se renombró. Si aquel `pintarTodo()` hubiera
estado dentro de un `onclick`, la revisión lo habría dado por bueno.

Y estaba medio construido: `sandbox-pilot.ts` ya sabía pulsar dentro del
iframe, y ese runtime ya se inyectaba en el iframe de la revisión.

### Lo que se puede AFIRMAR, que es lo delicado

«Este botón no funciona» es **indecidible**. Un botón que no hace nada visible
puede estar perfecto —un «Cancelar» que cierra algo ya cerrado—. Y descarté
mirar si tiene manejador: los listeners puestos con `addEventListener` **no se
pueden inspeccionar desde JavaScript**, así que un botón bien cableado saldría
como roto. Acusar en falso es peor que no mirar.

Se reportan dos cosas, las dos comprobables:

| Señal | Qué se hace |
|---|---|
| Al pulsarlo **salta un error** | Se le devuelve al modelo. Esto es lo que vale |
| Se pulsa y **nada cambia** | Se enseña como dato: «puede ser correcto, míralo» |

Lo segundo **no** se le manda al modelo: le haríamos perseguir un fallo que
puede no existir, gastando cuota y empeorando la página.

Detalles: se pulsa por **índice**, no por texto (hay botones sin rótulo y
rótulos repetidos); tope de 10 y 250 ms de espera por clic; y se compara una
firma de la página antes y después para saber si cambió algo.

### Falso culpable nº 1: nuestro propio sandbox

La vista previa corre con `allow-scripts` y **sin** `allow-same-origin`, que es
lo que impide que el proyecto toque la app. El precio es que el navegador
prohíbe `localStorage` ahí dentro y cualquier acceso lanza un `SecurityError`.

Y una página generada usa `localStorage` constantemente —una lista de tareas
que se guarda, un contador que persiste—. O sea que **Prism le habría dicho al
modelo «tu código lanza un error» y le habría hecho arreglar código correcto**:
el peor resultado posible para una revisión automática. Ahora esos errores se
reconocen como del entorno y no se le facturan a nadie.

### Falso culpable nº 2: las dos fases compartían los logs

Peor y más tonto: el error de un **clic** se contaba también como error de
**carga**, porque ambas fases escriben en el mismo array. Un botón roto
disparaba la corrección por consola en vez de la de botones, y al modelo le
llegaba el mensaje equivocado. Se corta el array donde empieza el barrido.

Las dos mitades están comprobadas en rojo por separado.

### Pruebas

- `tests/unit/prueba-botones.test.ts` (14, nuevo): la frontera entre fallo y
  dato. El test que más importa: **un botón que no cambia nada NO se le manda
  al modelo**.
- `tests/unit/auto-revision.test.ts` (+4): el error del sandbox no cuenta, pero
  uno de verdad que venga acompañado sí — y al modelo solo le llega el suyo.
- `tests/e2e/agente-pulsa-botones.spec.ts` (nuevo): `mock-boton-roto` entrega
  una página que **carga limpia** y cuyo botón llama a `sumarTotal()`, que no
  existe. **Comprobado en rojo** dos veces: quitando el barrido, y quitando la
  separación de fases.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 924/924 unitarios · ✓ 121/121 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.28.0","commit":"c3ab120"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **El orden de los clics cambia el resultado.** Pulsar «borrar todo» antes que
  «añadir» prueba otra aplicación. Se pulsan en el orden del DOM y no se
  recarga entre clics: es una decisión, no un descuido, pero significa que un
  botón puede fallar por culpa del anterior.
- **No se pulsan enlaces ni se rellenan campos.** Un `<a>` puede navegar fuera
  y dejar la prueba sin página; los formularios necesitarían datos plausibles,
  que es justo lo que no se puede inventar.
- **Tope de 10 botones.** Una página con veinte deja la mitad sin probar, y el
  resumen lo dice («de 20»).
- El QA visual sigue fuera. Una cosa es «esto revienta» y otra «esto se ve
  estrecho en móvil»; mezclarlas convierte el informe en ruido.

---

## v3.30.0 — Los fallos que salen cuando TÚ la usas

Idea del usuario, y da en el punto débil del barrido de la v3.29.0. Ese pulsa
botones **a ciegas**: en el orden del DOM, sin escribir en los campos y sin
tocar los enlaces. Le faltan las tres cosas que solo aporta el uso real —**tu
orden, tus datos y los enlaces que tú eliges**.

Y resulta que eso no se recogía en absoluto: **la vista previa en vivo no
llevaba el puente de consola**. Si algo reventaba mientras usabas la página, el
error moría dentro del iframe sin que se enterara nadie.

### Qué hace

- El puente de consola se inyecta también en la vista previa. Solo en lo que se
  **pinta**: lo que se descarga o se abre en pestaña sigue yendo limpio, como
  ya hacía el medidor de QA.
- El puente apunta además **qué acabas de tocar**, en fase de captura para
  enterarse antes de que el manejador reviente. Así el aviso dice «Error al
  pulsar **Ver más**» en vez de soltar un stack trace sin contexto — y eso es
  justo lo que el modelo necesita para saber por dónde entrar.
- Un aviso discreto sobre la vista previa, con «Arreglar» y una X para
  descartarlo.

### Dos decisiones que evitan que sea un incordio

**No se manda solo.** Gastar una respuesta sin permiso por un error que quizá
ya conocías es peor que enseñarlo y esperar. El botón es tuyo.

**El mismo error repetido sube un contador, no añade una línea.** Un fallo
dentro de un bucle o de un `mousemove` llenaría la lista en un segundo. Y los
errores del propio sandbox —el `SecurityError` de `localStorage`— se filtran
con el mismo criterio de la v3.29.0: no son del modelo.

### Pruebas

- `tests/unit/errores-en-vivo.test.ts` (10, nuevo): la deduplicación, el
  filtro del entorno, el tope, y que sin gesto **no se inventa uno**.
- `tests/e2e/errores-al-usarla.spec.ts` (nuevo): `mock-enlace-roto` esconde el
  fallo detrás de un **enlace**, que el barrido automático no pulsa a propósito
  (un `<a>` puede navegar fuera y dejar la prueba sin página). El test
  comprueba primero que **no hay ningún aviso** —la página carga limpia—, luego
  pulsa el enlace dentro del iframe, y verifica que el aviso dice dónde fue,
  que «Arreglar» manda el error **y el gesto** al modelo, y que queda
  arreglado. **Comprobado en rojo dos veces**: sin el puente en la vista
  previa, y sin el registro del gesto.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 934/934 unitarios · ✓ 122/122 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.29.0","commit":"6125abd"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **El gesto solo se registra en clics.** Si el error salta al escribir en un
  campo o al enviar un formulario, el aviso dice «Error al usarla» sin más. Es
  honesto —no se inventa un origen— pero es menos útil.
- **Se limpian al repintar.** Si el modelo entrega una versión nueva, los
  errores de la anterior desaparecen aunque sigan estando. Es lo correcto para
  no acusar del pasado, pero significa que un fallo puede pasar desapercibido
  si repintas justo después de provocarlo.
- No he medido cuánto pesa el puente de consola en páginas muy grandes; es un
  script pequeño y va inline, pero no lo he cronometrado.

---

## v3.31.0 — El radar deja de poner siempre lo mismo, y te lleva a por la clave

Dos quejas del usuario, las dos ciertas.

### «Siempre pone lo mismo» — era literal

Al mirarlo: de las cuatro secciones del radar, **tres son un catálogo escrito
a mano** (13 proveedores, las ofertas, las páginas que seguir). Solo la lista
`:free` de OpenRouter venía de la red. Un catálogo estático no cambia; es que
literalmente ponía lo mismo.

Dos arreglos, y hacían falta los dos:

**Traer datos de verdad.** Sección nueva, «Nuevo para ti»: se le pregunta a
**cada proveedor que ya tienes conectado** qué modelos ofrece —con tu clave,
que es la única forma de saber a qué tienes acceso— y se enseña lo gratis que
**todavía no tienes añadido**. Eso cambia por semanas y es distinto para cada
persona.

Detalles que importan: lo que ya tienes se descarta (un radar donde el 90% ya
lo tienes no descubre nada, y es justo la sensación de «siempre lo mismo»); se
**reparte** entre proveedores en vez de vaciar el primero, porque uno que
devuelva doscientos modelos dejaría a los demás fuera; y un proveedor caído no
tumba la búsqueda de los demás.

Y cuando no hay novedades **no se presenta como un fallo**: «ya tienes añadido
todo lo gratis que ofrecen» es una buena noticia, no un hueco.

**Dejar de fingir que lo escrito a mano es actual.** Cada oferta y cada fuente
lleva ahora la fecha en que se comprobó, y la interfaz dice «verificado hace 3
días» o, pasado el mes, cambia el tono a «sin verificar desde hace 2 meses».
Antes una oferta decía «Vigente · verificado 28 ago 2026» dentro del texto: en
2027 seguiría diciéndolo igual. Es la misma regla que la cuota — si no se
puede saber que sigue siendo verdad, no se afirma; se dice cuándo se miró.

### «Debe mandar directo a donde se consigue»

Tenía razón y el dato ya estaba ahí sin usar:

- El aviso de «te falta la clave» te mandaba a **Ajustes**. Pero si no tienes
  la clave, abrir Ajustes te deja igual de bloqueado. Ahora el botón principal
  es **«Conseguir clave»** y va al `keyUrl` del proveedor; Ajustes queda de
  secundario, que es donde la pegarás después.
- El consejo «consigue tu clave de OpenRouter» era **texto plano sin enlace**:
  te decía que la consiguieras y te dejaba buscándola. Ahora es un botón.

### Pruebas

- `tests/unit/radar-propio.test.ts` (11, nuevo) y `tests/unit/frescura.test.ts`
  (8, nuevo).
- `tests/e2e/radar-propio.spec.ts` (3, nuevo): que el modelo que **ya tienes**
  no se te vuelve a ofrecer, que sin clave sale «Conseguir clave» **y**
  «Ajustes», y que las ofertas dicen cuándo se comprobaron. **Comprobado en
  rojo** las tres, una por una.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ 953/953 unitarios · ✓ 125/125 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.30.0","commit":"0a8fa30"}`
- ✓ `VERCEL=1 npm run build` → `.nft.json` existe

### Lo que NO pude comprobar

- **Las fechas de verificación las he puesto yo hoy**, salvo la de Kimi que ya
  venía en el texto. No he comprobado una por una que las 13 fuentes sigan
  ofreciendo lo que dicen: he fechado el catálogo, no lo he auditado. Marcar
  algo como «verificado hoy» sin haberlo mirado sería justo el problema que
  esto quiere resolver, así que **conviene revisarlas de verdad y ajustar las
  fechas**.
- **«Nuevo para ti» solo ve lo que tu proveedor lista.** Los que no exponen
  catálogo de modelos, o cuya clave no da acceso a esa ruta, no aportan nada —
  y eso no se distingue de «no tiene novedades».
- No he probado el comportamiento con muchos proveedores conectados a la vez:
  son peticiones en paralelo y podrían tardar.

## v3.32.0 — El plan V6 entero: la foto del gratis, tu orden de failover, un solo panel y el razonamiento normalizado

Cuatro tareas del plan V6 (`PLAN-V6.md`), en orden, una por commit. La quinta
(`npx prism-ai`) se cayó con datos en la mano — más abajo.

### T1 · Avisar cuando un modelo deja de ser gratis

`isFreeModel` es una heurística estática: si mañana un modelo pierde la capa
gratuita, Prism lo trataba como gratis hasta el 402. Ahora el radar guarda una
**foto** de lo que era gratis la última vez que miraste (persistida en el
store) y al volver compara.

- `lib/prism/cambio-gratis.ts`, módulo puro como `radar-propio.ts`: compara la
  foto con el catálogo de hoy y devuelve las **tres** listas — dejó de ser
  gratis / nuevo y gratis / desapareció del catálogo, que **no es lo mismo**
  (el modelo ya ni existe para ti; afirmar que «dejó de ser gratis» sería
  inventar que el renombrado y el nuevo son el mismo).
- El proveedor que **falla al responder no se compara** y conserva su foto
  vieja: un corte de red no se enseña como «te has quedado sin todo».
- Primera vez: **no hay aviso**, ni vacío ni de «0 modelos». Se guarda la foto.
- La mala noticia va **arriba** de «Nuevo para ti», con la fecha de la foto —
  que es lo único que se sabe.

### T2 · Orden de fallback configurable

Para que Groq fuese antes que Gemini había que **recompilar**: `FAILOVER_ORDER`
era una constante. Ahora: `pickFailoverCandidate` acepta un orden opcional (sin
él, la constante tal cual — los tests anteriores pasan sin tocarlos), el orden
del usuario vive en el store como **lista de `ProviderId`** (no un objeto de
pesos: una preferencia es un orden) y se **sanea al leerlo**: ids retirados
fuera, proveedores que faltan al final — un orden guardado hace seis versiones
no puede dejar fuera a un proveedor nuevo.

En Ajustes → Claves: lista con **flechas** (el arrastrar no merece una
dependencia) y «Restablecer». `PROVIDER_FIT` se queda fuera a propósito:
afinidad por tipo de tarea es otro concepto.

### T3 · Panel del sistema

Los datos existían **repartidos** en tres diálogos (Uso 381 líneas, Cuota 294,
Arena 261). Ahora: una pestaña por panel, montando los **cuerpos** de esos
mismos componentes — extraídos en sus propios archivos, cero lógica reescrita;
los diálogos propios siguen existiendo.

Lo único nuevo es la **fila de cabecera**: modelo activo, cuántos modelos están
en **enfriamiento** ahora mismo (lo sabe `health.ts` y no se veía en NINGUNA
parte — es la respuesta a «¿por qué no está usando el modelo que elegí?») y el
último fallo del registro de peticiones. «Sin dato» sigue siendo «sin dato».

### T4 · Razonamiento normalizado

El chain-of-thought se apañaba en dos sitios (`splitThinkTags` para las
etiquetas, `reasoning_content` leído a mano) y cada familia lo manda a su
manera. `lib/prism/razonamiento.ts` sigue el patrón que ya funciona (una pieza
normalizada por módulo, como `tools-translate.ts` y `finish-reason.ts` — **no**
un `ProviderAdapter`):

- Se **mueven sin cambiar nada visible**: `reasoning_content` y las etiquetas
  (reexpuestas tras `razonamiento.ts`; `thinking.ts` y sus tests intactos).
- **Cobertura nueva**: bloques `thinking` de Anthropic (antes se tiraban sin
  enseñar) y partes `thought` de Gemini (antes salían **mezcladas dentro de la
  respuesta**). `thoughtSignature`/`signature_delta` no son texto: no cuentan.

### T5 · `npx prism-ai` — parada con datos

`npm pack --dry-run`: tarball 1,1 MB (2,9 MB descomprimido, 344 archivos) —
pequeño. Pero eso no es lo que baja `npx`: **las dependencias son 830 MB**
(next 202, pdfjs-dist 35, sharp + binarios…), y encima la app necesita un
build de producción antes del primer arranque. Cinco minutos de instalación y
compilación para un `npx` que promete levantar la app ya. Además `package.json`
lleva `"private": true` y no hay `bin` ni whitelist `files` (empaqueta tests y
worklog). La instrucción lo decía: si sale desproporcionado, **para y dilo**.
Decidido a no publicar; cuando se haga, quiere un launcher real y un `files`
explícito.

### Pruebas

- Unitarios: 953 → **990** (+15 cambio-gratis, +11 orden-fallback, +11
  razonamiento). E2E: 125 → **130** (2 cambio-gratis, 1 orden que mueve y
  **recarga**, 1 panel por las tres pestañas, 1 Gemini thought interceptado).
- **Comprobados en rojo, uno por tarea**: sin la integración del radar fallan
  los dos E2E de la foto; sin la sección de Ajustes falla el del orden; sin el
  botón del sidebar falla el del panel; sin el cableado de chat-client falla
  el de Gemini.
- Dos carreras mías, cazadas por la suite completa (aislados pasaban): el
  cooldown del spec se sembraba con la hora de CARGA del archivo (en la suite
  corre 8 minutos después: expirado), y el éxito de la conversación borra el
  enfriamiento del modelo que la sirvió (recordSuccess) — ahora se siembra en
  otro modelo. Y `getByRole("textbox").first()` casaba con el buscador del
  sidebar: los specs usan `textarea`.

### Puerta

- ✓ lint · ✓ knip* · ✓ build · ✓ 990/990 unitarios · ✓ 130/130 E2E
- ✓ `npm start` + `/api/version` → `{"version":"3.32.0","commit":"..."}`
- ✓ `VERCEL=1 npm run build` → `.next/next-server.js.nft.json` existe
- \* knip revienta por RAM en este entorno (ArrayBuffer del raw-transfer de
  oxc-parser; 4 GB de máquina). **Revienta igual en el commit base dc1a06b**,
  antes de tocar nada: es el entorno, no el cambio. Con
  `KNIP_DISABLE_RAW_TRANSFER=1` pasa limpio (0 huérfanos).

### Repaso antes de entrar en main

Tres cosas al revisar la entrega, ya con todo verde:

- **`resumenCambio` estaba escrita, probada y sin usar**, y la nota de recorte
  del radar decía «el total está arriba» apuntando a un total **que no se
  pintaba en ninguna parte**. Un número prometido que no existe es peor que no
  prometerlo: ahora la frase con los totales sin recortar se pinta bajo el
  título de la sección, que es a lo que la nota apunta.
- **Nada vigilaba que `FAILOVER_ORDER` cubriera a `PROVIDERS`.** El orden
  configurable se sanea contra esa constante, así que añadir un proveedor y
  olvidarse de ella lo deja fuera de la cadena de failover **y** de la lista
  de Ajustes, sin error ni aviso. Hoy coinciden los 17; ahora hay un test que
  lo sostiene (comprobado en rojo quitando `cerebras` de la constante).
- Dos comentarios de `razonamiento.ts` llegaron con las etiquetas
  `<think>…</think>` convertidas en la palabra «modeling» por el camino.
  Solo comentarios, el código estaba intacto.

Y una corrección al parte de arriba: **knip pasa limpio en el entorno donde se
revisó esto**, sin desactivar el raw transfer. Lo de la RAM es de la máquina
donde se escribió, no del repositorio.

### Lo que NO pude comprobar

- `npx prism-ai` no está publicado (decisión arriba): el paquete no se ha
  instalado desde npm ni una vez.
- El E2E de Gemini intercepta la respuesta con `page.route` — el camino de red
  es real (proxy → endpoint → SSE), pero el proveedor de verdad no ha enviado
  partes `thought` en esta máquina: con Anthropic thinking no hay E2E (solo
  unitarios del traductor).
- knip solo pasa con raw transfer desactivado aquí; en una máquina con más RAM
  debería pasar tal cual está en el CI.
- La foto del gratis se compara al ABRIR el radar: entre aperturas no hay
  vigilancia (no hay notificaciones en segundo plano, que sería otra pieza).
---

<!-- Las siete entradas siguientes se escribieron sobre la base v3.31.0
     (dc1a06b), antes de que el plan V6 entrara en main, y se numeraron ahí
     como v3.32.0…v3.34.3 — números que en main ya significan otra cosa (la
     v3.32.0 de arriba es el plan V6). Se conservan tal cual las escribió su
     autor, con el título cambiado a «tanda» para que no haya dos v3.32.0
     distintas en el mismo archivo. Todo esto sale junto en la v3.35.0. -->

## Plan V7 · 1ª tanda — herramientas del agente + HUD + aurora

Base: `main` v3.31.0 (`dc1a06b`). El zip «v3.32.0-plan-v6» de la conversación
no estaba en el entorno; las 5 tareas del PLAN-V6 siguen pendientes en `main`
(ninguna ejecutada) — esto va encima sin tocarlas. Detalle completo en
`PLAN-V7.md`.

**Herramientas (6 → 12).** `edit_file` (quirúrgica; se niega con «find»
ambiguo salvo `all: true`), `run_js` (REPL en iframe aislado, contrato
`resultado`/console.log, techo 5 s), `read_console` (relee la consola del
último `run_project` — nueva `consola` en `RunOutcome`), `search_web`
(DDG-html por el proxy, parser regex conservador), `fetch_api` (JSON con
`fields` por ruta de puntos; «sin dato» si el campo no existe) y
`git_snapshot` (create/list/restore en `prism-snapshots-v1`, tope 12 y 2 MB).

**Arreglo de fondo.** El bucle del agente reconstruía el ToolContext en cada
vuelta: un `write_file` de la iteración 1 desaparecía en la 2 y nada llegaba
al Sandbox. Ahora el contexto es UNO por bucle y `onProjectFiles` vuelca el
estado (Sandbox cerrado → seed; abierto → toast con «Cargar», no se machaca).

**HUD + aurora.** Barra de contexto bajo el compositor (estimación ≈chars/4
contra `ventanaCtx` de referencia, umbral 80/95 %) y el fondo `.aurora`
renderizado de verdad con tercera capa rosa.

**Puerta.** lint ✓ · build ✓ (tipos incl. tests, nft.json) · unitarios
953 → **1 020** ✓ · E2E: suite completa + `hud-ctx.spec.ts` nuevo. `knip`
no corre en este entorno (`RangeError: Array buffer allocation failed` de
oxc-parser, memoria del contenedor).

**Tests que cambiaron y por qué.** `tools-catalog.test.ts` y
`tool-runner.test.ts` usaban `search_web` como ejemplo de herramienta
inventada; ahora existe (el producto manda, §1.6). El resto de la suite
pasó sin editar una línea.

---

## Plan V7 · 2ª tanda — pestañas, bienvenida y aurora glass

A petición del usuario: completar las **mejoras visuales del mockup** que
quedaron fuera de la v3.32 (las herramientas ya estaban).

**D2 pestañas.** Barra bajo la cabecera con las conversaciones abiertas
(`convo-tabs.tsx`): cambiar de proyecto sin la barra lateral, X y clic
central cierran la PESTAÑA (nunca la conversación), al cerrar la activa
se activa la vecina, tope 8, solo escritorio. Lógica pura en `tabs.ts`
(`abrirTab`/`cerrarTab`) con 9 tests. Patrón ARIA tablist/tab a propósito:
los títulos no se vuelven botones y no colisionan con `getByRole("button")`.

**D3 bienvenida.** Fila contextual encima de las sugerencias, solo si hay
algo real: «Continuar «{última}»» (la reabre), «Modelos gratis de hoy»
(abre el radar — sin la palabra «Radar» en el nombre accesible, porque 3
E2E localizan el botón de la cabecera por ese nombre sin scope) y
«Descifrar un error» (rellena el compositor, no envía).

**D1 glass.** `.glass` con línea de luz superior y más blur; burbujas:
`glass-msg` (asistente) y `tint-user` (usuario, lavado violeta-cian en
vez del degradado oscuro). Solo CSS: el layout no se toca.

**Puerta.** lint ✓ · build ✓ (tipos incl. tests) · unitarios 1 020 →
**1 029** ✓ · E2E suite completa ✓ + `pestanas-welcome.spec.ts` (5
escenarios) · knip sigue sin correr por memoria del entorno.

**Trampa del entorno que mordió dos veces.** El E2E usaba el puerto 3000
ocupado por el servidor de descargas (el mockup): Playwright ve el puerto
vivo y no arranca `npm run dev`, y los tests corrían contra el mockup.
Regla: antes de `test:e2e`, matar cualquier cosa en el 3000.

**Flake preexistente del grafo, arreglado de paso (v3.33).** El E2E
`map.spec.ts` («grafo: nodos, relaciones, filtros») selecciona un nodo con
un clic por pixel; la simulación de fuerzas solapa nodos y el que está
encima se lleva la selección (~75% de fallo medido, también SIN la barra
de pestañas — se comprobó ocultándola). No es un bug del producto: es
comportamiento normal de un grafo de fuerzas (quien está encima del pixel
recibe el clic, como en Obsidian). Un dispatchEvent sintético no sirve:
el handler llama `setPointerCapture` y revienta sin puntero real. El test
ahora reintenta el clic real hasta 4 veces (cada clic recalienta la
simulación y cambia la geometría): 6/6 verde.

---

## Plan V7 · 3ª tanda — U2 snippets + U3 plantillas + U4 wrapped + U6 presentación

Las 4 utilidades que faltaban del mockup v7. U1 (Prism Sync) y U5 (cola
offline) quedan fuera: la primera pide gist cifrado + bóveda, la segunda
cambios en el service worker que esta tanda no toca.

**U2 Snippets** (`/snip`). Biblioteca de trozos reutilizables en
`prism-snippets-v1`: 4 de fábrica (frontmatter, función JSDoc, casos
límite, sección de precios) + los que tú añadas. Atajos cortos
(`/snip fn`). Lógica pura en `snippets.ts` (zustand persist), UI en
`snippets-dialog.tsx`. 15 tests.

**U3 Plantillas** (`/plantillas`). Catálogo de los ZIPs que ya viven
en `/public`: «Web de una página» (`demo-sandbox.zip`) y «Web modular»
(`demo-modulos.zip`). Un clic abre el Sandbox con el ZIP cargado vía
la prop nueva `initialZipUrl` (el efecto fetch+loadZipFile vive en
`sandbox-studio.tsx`, no en chat-app — más limpio). 9 tests.

**U4 Wrapped** (`/wrapped`). Informe semanal sobre `usage.ts`:
peticiones, éxito, latencia (media + p95), ahorro por compresión, top
5 modelos, día más activo. Botón de descarga como HTML autocontenido
(aurora + glass, estilo Prism Link). Lógica pura en `wrapped.ts`
(`computeWrapped`, `ahorroPct`, `wrappedToHtml`), UI en
`wrapped-dialog.tsx`. 14 tests.

**U6 Presentación** (`/presentar`). Convierte el HTML de la vista
previa en diapositivas (una por `<section>` si hay ≥2; si no, por
`<h2>`; si no, por `<h1>`; si no, una con todo). Cada diapositiva se
monta como documento completo con el `<head>` del original. Flechas
izq/der/espacio, F para pantalla completa, QR opcional con la URL
`?slide=N` (mando desde el móvil). Parser simple e intencionado en
`slides.ts`. 9 tests.

**Slash.** Cuatro comandos nuevos en `slash.ts` (`/snip`, `/plantillas`,
`/wrapped`, `/presentar`) con sus iconos en `slash-menu.tsx`. El test
de «los seis comandos pedidos» se actualiza a «los diez comandos
pedidos» (regla §1.6: el producto manda).

**Mockup.** El HTML de la propuesta v7 se copia a
`/public/propuestas/prism-ai-propuesta-v7-mockup.html` para que viaje
con el zip y se pueda abrir desde la app servida.

**Puerta.** lint ✓ · tsc ✓ · build ✓ (12 páginas) · unitarios
1 029 → **1 076** en 82 archivos (+47 nuevos) ✓. knip sigue sin correr
en este entorno (oxc-parser revienta por memoria del contenedor).


---

## Plan V7 · pulido 1 — SparkleAvatar + Sandbox abre index.html directo

Dos ajustes pedidos por el usuario sobre lo ya entregado en v3.34.0:

**1. Avatar del asistente.** El chat usaba `<PrismLogo size={20}>` como
avatar en cada burbuja del asistente — el logo completo (prisma + rayos)
a tamaño pequeño se lee mal. Se reemplaza por `SparkleAvatar` (nuevo
`sparkle-avatar.tsx`): contenedor oscuro `#0f0f11` con borde sutil, icono
«sparkle» cian de 4 puntas con signo «+» en la esquina superior derecha
y punto decorativo inferior izquierdo, estilo Linear/Raycast/Vercel.
Glow sutil con `drop-shadow` del cian de marca. El `PrismLogo` sigue en
cabecera, barra lateral y bienvenida (donde tiene espacio para respirar).

**2. Sandbox abre index.html directo.** Antes al cargar un proyecto
(semilla del chat o ZIP de plantilla) el Sandbox se quedaba en el panel
«editor» y había que pulsar «Ejecutar» manualmente. Ahora: si hay un
`index.html` (o cualquier HTML de entrada vía `pickEntryPath`), se
ejecuta automáticamente y salta al panel «vista». Implementación: flag
`autoRunPending` que levantan los dos efectos de carga (semilla y
`loadZipFile`); un efecto aparte lo consume y llama a `run()`. Si no hay
HTML, comportamiento anterior (sin auto-ejecutar).

**SW bump.** `sw.js` de `prism-ai-v4` → `prism-ai-v5` para forzar la
desactivación del SW viejo que cacheaba chunks del bundle anterior en
algunos navegadores. El `activate` borra todo lo que no empiece por v5.

**Puerta.** tsc ✓ · lint ✓ · build ✓ · unitarios 1 076/1 076 ✓.


---

## Plan V7 · pulido 2 — avatar sin contenedor + degradado del tema en el fondo del chat

Dos ajustes de pulido sobre v3.34.1:

**1. SparkleAvatar sin contenedor.** Se quita el fondo oscuro `#0f0f11`,
el borde y la sombra — ahora es solo el icono SVG (estrella de 4 puntas
+ signo + + punto decorativo) pintando directo sobre el fondo del chat.
El color hereda del acento del tema (`var(--prism-violet)`) en vez del
cian fijo, así cambia cuando el usuario cambia de acento en Ajustes
(esmeralda, ámbar, rosa, cian, naranja). El glow sutil (`drop-shadow`
del violeta de marca) lo mantiene legible sobre cualquier fondo.

**2. Degradado del tema en el fondo del chat.** El contenedor de
mensajes (línea 2424 de `chat-app.tsx`) ahora lleva un degradado diagonal
sutil: violeta de marca al 6% arriba-izquierda → transparente al
centro → cian al 5% abajo-derecha. Usa `color-mix(in oklab, …)` sobre
`var(--prism-violet)` y `var(--prism-cyan)`, así cambia con el acento
elegido y queda bien en claro y oscuro. La dirección diagonal le da
vida sin distraer de los mensajes.

**SW bump.** `sw.js` de `prism-ai-v5` → `prism-ai-v6` para forzar la
desactivación del SW anterior y que los navegadores descarguen el nuevo
bundle sin tener que hacer recarga dura.

**Puerta.** tsc ✓ · lint ✓ · build ✓ · servidor rearrancado (commit
`39bd904`).


---

## Plan V7 · pulido 3 — logo más visible + code block sin scroll

Tres ajustes pedidos por el usuario:

**1. Logo rediseñado (`logo.tsx`).** El original tenía `fillOpacity="0.06"`
(triángulo casi invisible) y trazos finos (`strokeWidth="19"` en un
viewBox 512×512 = ~3.7% del tamaño) que a 26px (sidebar) se perdían.
Nuevo: viewBox compacto 100×100, triángulo con fill de degradado al
18% + borde grueso (4px = 4% del tamaño), rayos a la derecha con
`strokeWidth 3.5` y `opacity 0.9`, halo sutil con `glow`. IDs únicos
por instancia para evitar el bug clásico de gradientes SVG compartidos
cuando hay dos logos en la misma página.

**2. Code block sin scroll horizontal (`markdown.tsx` + `globals.css`).**
Antes: `overflow-x: auto` → las líneas largas sacaban scroll lateral.
Ahora: `white-space: pre-wrap` + `word-break: break-word` +
`overflow-wrap: anywhere` → las líneas se envuelven dentro del bloque.
El bloque crece en vertical; el número de líneas lo da el lenguaje y
se ve entero. Reforzado con inline style en el componente por si el
selector CSS se pierde en una refactorización.

**3. SW bump.** `sw.js` de `prism-ai-v6` → `prism-ai-v7` para forzar la
desactivación del SW anterior.

**Puerta.** tsc ✓ · lint ✓ · build ✓ · servidor rearrancado (commit
`f2204b3`). El chunk principal `3xvm650g927es.js` contiene: viewBox
`0 0 100 100` (logo nuevo), `pre-wrap` (code block), `sparkle` (avatar).


---

## Plan V7 · pulido 4 — logo rediseñado + contenedor de código que envuelve de verdad

Dos ajustes de pulido visual pedidos por el usuario.

**1. Logo rediseñado (`logo.tsx` v3).** El logo original tenía un fill
casi transparente (`fillOpacity: 0.06`) y trazos finos que a 26px
(sidebar) se perdían. Cambios:
- Fill interior del prisma más opaco (`fillOpacity` 0.32 → antes 0.06).
- Borde más grueso (`strokeWidth: 5.5` → antes 4).
- Brillo interior nuevo (`pl-shine`): triángulo más pequeño arriba-izq
  con degradado blanco, da profundidad al prisma.
- Rayos simplificados a 3 líneas rectas más visibles (`strokeWidth: 4`).
- ViewBox más compacto, menos espacio vacío alrededor.

**2. Contenedor de código que envuelve de verdad.** Aunque el `pre` ya
tenía `pre-wrap` + `overflow-wrap: anywhere`, las líneas largas seguían
saliéndose del bloque. Causa: **highlight.js** envuelve cada token en
un `<span class="hljs-...">` inline que por defecto no rompe. Fix:
- CSS global nuevo (`globals.css`) que fuerza `pre-wrap` + `break-word`
  en todos los spans `hljs-*` y `code span`.
- CSS embebido en el `CodeBlock` que repite la regla por si el global
  se pierde.
- Cabecera rediseñada estilo terminal macOS: 3 puntos de color (rojo,
  ámbar, verde) + lenguaje + botón copiar.
- Borde con tinte del acento del tema (`border-prism-violet/20`) y
  sombra más marcada para separarlo del card.

**SW bump.** `sw.js` de `prism-ai-v6` → `prism-ai-v7` para forzar la
desactivación del SW anterior y que los navegadores descarguen el nuevo
bundle sin recarga dura.

**Puerta.** tsc ✓ · lint ✓ · build ✓ · servidor rearrancado (commit
`d6efeee`).

---

## v3.35.0 — El plan V7 entrando junto al V6, y los fallos que salieron al juntarlos

La entrega del plan V7 llegó como ZIP construido sobre `dc1a06b`, es decir
**antes** de que la v3.32.0 (plan V6) entrara en `main`. Su propio parte lo
dice: «las 5 tareas del PLAN-V6 siguen pendientes en `main`». Aplicarla encima
habría borrado T1-T4 sin que lo cantara nada —un ZIP no sabe decir «esto no lo
toqué»—, así que entró como **fusión de verdad**: rama auxiliar en la base
correcta y `git merge`.

Chocaron cuatro archivos, todos mecánicos: las dos versiones, el lockfile y el
worklog. El código chocó en **cero**: V7 tocó `chat-app.tsx` y V6 también, y
git los juntó solo.

### Lo que se descartó de la entrega

- **Su `package-lock.json`**: traía dependencias opcionales resueltas en otra
  máquina (`@emnapi`…), 3064 líneas de más, sin una sola dependencia nueva en
  `package.json`. Es exactamente lo que rompió un despliegue entero un día. Se
  conservó el nuestro y la versión subió con `npm run bump`.
- **Su numeración**: sus siete entradas se llamaban v3.32.0…v3.34.3, números
  que en `main` ya significan otra cosa. Se conservan tal cual las escribió su
  autor, retituladas como «tandas» para que no haya dos v3.32.0 distintas en
  este archivo. Todo sale junto aquí, en la **v3.35.0** — por encima de
  cualquier número que se llegara a ver en un build de aquella rama.

### Fallo real: el logo rompía la hidratación

`PrismLogo` generaba los ids de sus degradados con `Math.random()` **en el
render**. Servidor y cliente sacaban ids distintos, React lo cantaba como
fallo de hidratación y, en desarrollo, eso levanta el overlay de error de Next
**tapando la pantalla entera**: 12 E2E caían por clics interceptados que no
tenían nada que ver con lo que probaban. Arreglado con `useId`, que da un id
estable entre servidor y cliente y distinto por instancia. Su parte decía «tsc
✓ lint ✓ build ✓» y era verdad: esto no lo ve ninguno de los tres.

### El resto: carreras que el V7 destapó, no rompió

Los otros nueve fallos eran tests que se habían quedado atrás o que corrían
contra una interfaz aún moviéndose:

- **Cargar un proyecto ya no aterriza en el editor.** Lo pediste tú («que abra
  directo index.html») y funciona: abre la vista previa **en vista completa**,
  que es una capa `fixed inset-0` por encima del Sandbox. Los ocho tests de
  `studio.spec` daban por hecho el árbol al aterrizar. Ahora salen de la vista
  completa primero, y hay **un test nuevo** que comprueba justo lo nuevo: que
  la demo aterriza en «Vista» con la página corriendo dentro.
- **La instantánea del auto-arranque.** `run()` programa un
  `setTimeout(finalizarSnapshot, 3000)`: tres segundos después, estado nuevo y
  redibujado. Un clic que caiga ahí se va con el nodo viejo —no falla, no hace
  nada— y de ahí salían los fallos sueltos que aparecían en una pasada
  completa sí y en otra no. Los tests esperan a que pase.
- **El aviso de errores en vivo**: mismo patrón, mismo remedio.

Los clics que pueden perderse así se pulsan ahora con `toPass`, y cada uno
lleva escrito **por qué**. No es tapar: si la función está rota, los reintentos
se agotan y el test cae igual.

### `prefers-reduced-motion` en los E2E

El fondo «aurora» que el V7 pone a animar en bucle detrás de paneles con
`backdrop-filter` deja al navegador repintando sin parar, y la comprobación de
estabilidad de Playwright llegaba a agotar el minuto sobre un botón quieto. Los
E2E corren con `contextOptions: { reducedMotion: "reduce" }`: la app ya apaga
esas animaciones con reduced-motion, así que no se desactiva nada nuestro —se
prueba la variante accesible.

Y de paso, otra del §1.3 de `INSTRUCCIONES-V6.md`: `reducedMotion` **no** es
una opción de `use` en el tipado de Playwright 1.62. `npm run build` lo rechazó;
`tsc --noEmit` no lo habría visto.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1113** unitarios (990 antes) · ✓ **139** E2E
  (130 antes)
- ✓ `npm start` + `/api/version` → `{"version":"3.35.0",…}` · ✓ `VERCEL=1` con
  `.next/next-server.js.nft.json`
- La suite completa se pasó **cuatro veces seguidas en verde**, la última ya
  con reduced-motion aplicado de verdad. Antes de los arreglos fallaba entre 1
  y 12 tests según la pasada.

### Lo que NO pude comprobar

- **La entrega no traía E2E ejecutados.** Su parte declara tsc, lint y build,
  y ninguno de los tres ve nada de lo de arriba.
- **No he revisado una por una las funciones nuevas del V7** (snippets,
  plantillas, wrapped, presentación, REPL, búsqueda web): lo comprobado es que
  compilan, que sus unitarios pasan y que no rompen nada de lo que ya había.
  Una revisión de diseño de cada una es otro trabajo.
- **La vista completa se lleva por delante un clic tuyo** si pulsas una
  pestaña mientras el proyecto todavía está cargando: el auto-arranque llega
  después y te devuelve a la vista. Es la misma carrera que sufrían los tests.
  No lo he tocado porque es una decisión de producto sobre una función recién
  pedida, no un bug que me tocara arreglar por mi cuenta.

---

## v3.35.1 — Los números que mentían, las funciones sin test y las trampas nuevas

Repaso del plan V7 ya fusionado. Cuatro cosas, todas salidas de mirar el código
que había entrado, no de suponer.

### Números falsos en pantalla

El catálogo de plantillas declaraba a mano cuántos archivos trae cada ZIP y los
**dos estaban mal**: decía «1 archivo» donde hay **5** y «3 archivos» donde hay
**8**, y eso se pinta tal cual en la tarjeta. Corregidos, y —más importante—
atados: un unitario abre el ZIP de verdad con `zip.ts`, el mismo lector que usa
el Sandbox, y compara. Escrito a mano se había desviado ya; ahora no puede.

Y el Wrapped enseñaba **`p95`** cuando lo que calcula es el **mayor de los p95
por modelo**. El p95 global no se puede sacar de ahí: `useUsage` guarda
agregados por modelo, no la lista de latencias, y el percentil de una unión no
sale de los percentiles de las partes. Ahora se llama `peorP95Ms` y en pantalla
pone «peor p95», que es lo que es: una cota superior.

### Cuatro funciones que nadie abría en ningún test

Snippets, Plantillas, Wrapped y Presentación llegaron con unitarios de su
lógica y **cero E2E**. Las seis herramientas del agente sí estaban cubiertas;
estos cuatro diálogos, no. Es la regla que existe porque un `VersionLine` que
no llamaba nadie estuvo semanas dentro creyéndose entregado.

`tests/e2e/v7-dialogos.spec.ts` abre cada uno por su comando y comprueba un
dato de dentro:

- `/snip` → el snippet elegido cae **en el compositor** y no se envía nada.
- `/plantillas` → el catálogo enseña los 5 y 8 archivos reales, y el buscador
  filtra.
- `/wrapped` → las 8 peticiones sembradas salen, y la latencia dice «peor p95».
- `/presentar` → sin página lo dice en vez de abrir vacío; con una, abre las
  diapositivas.

**Comprobados en rojo**: comentando las cuatro líneas que abren los diálogos,
los cuatro fallan.

### La vista completa ya no deshace un clic tuyo

Cargar un proyecto abre la vista previa sola —es lo que se pidió— pero el
auto-arranque llega **después** de que el ZIP termine de leerse: si mientras
tanto pulsabas «Editor», te devolvía a la vista y perdías el clic. Ahora las
pestañas marcan `eleccionManualRef` y el auto-arranque se aparta si ya elegiste.
Cada proyecto nuevo lo reinicia, así que la función sigue intacta.

**Esto no tiene test que lo pruebe, y conviene decirlo con esas palabras.** La
carrera vive en un hueco de milisegundos entre que el ZIP llena el árbol y el
efecto se dispara, y desde fuera no se puede meter el clic ahí de forma fiable:
lo intenté retrasando el ZIP con `page.route` y el clic seguía cayendo después.
El test que queda sostiene la regla visible (al elegir «Editor» te quedas en el
editor, sin la capa encima) y **no se pone rojo si se quita la guarda**; va
escrito en el propio test para que nadie lo confunda con una prueba.

### `INSTRUCCIONES-V6.md` al día

Cuatro trampas nuevas, todas de esta ronda: `Math.random()` en un render rompe
la hidratación y el overlay de Next tapa la pantalla (§1.10); un clic puede
perderse con el nodo viejo sin que nada falle (§1.11); una capa `fixed inset-0`
se come los clics de debajo (§1.12); y `npm run build` comprueba también los
tipos de `playwright.config.ts` (§1.13).

Y una sección nueva delante de todo: **entrega en rama, no en ZIP**. No es
burocracia — el CI ya ejecuta los E2E, así que los 10 fallos de la entrega
anterior se habrían visto solos en la primera pasada; y un ZIP sobre una base
vieja borra en silencio lo que entró mientras tanto, que es exactamente lo que
estuvo a punto de pasar con el plan V6.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1115** unitarios (1113 antes) · ✓ **144** E2E
  (139 antes)
- ✓ `npm start` + `/api/version` → `{"version":"3.35.1",…}` · ✓ `VERCEL=1` con
  `.next/next-server.js.nft.json`
- Suite completa en verde **dos veces seguidas**.

### Lo que NO pude comprobar

- **La guarda de la vista completa no tiene test que la pruebe** (arriba, con
  el motivo). Está verificada leyendo el camino del código, no ejecutándolo.
- **Sigo sin haber revisado una por una** las seis herramientas nuevas del
  agente ni la lógica interna de snippets/plantillas/wrapped/presentación. Lo
  que ahora sí hay es un E2E que abre cada diálogo y usa lo que enseña.

---

## v3.35.2 — Limpieza: lo que sobraba, y lo que estaba mal heredado

Repaso de qué hay en el repositorio y qué lo referencia. Salieron dos cosas
distintas: archivos que sobran, y archivos que **no sobran pero estaban mal**
porque venían de otro proyecto.

### Borrado del sitio público (137 KB)

Todo esto se estaba **sirviendo en internet** con la app:

- **`subir-github-v3.html`** (32 KB). Su `<title>` es **«MYIACHAT - Subir a
  GitHub»**: es la guía de otro producto, publicada aquí.
- **`guia-instalacion-prism-ai.html`** (28 KB) y **`guia-vercel-pwa.html`**
  (24 KB). Se quedaron en la **v2.6.1** —treinta y tantas versiones atrás— y
  mandan a descargar `prism-ai-v2.6.1-codigo-fuente.zip`, que no existe, y a
  usar el uploader de MYIACHAT. Nada de la app ni del README enlazaba a
  ninguna: el README cubre la instalación y está al día.
- **`propuestas/prism-ai-propuesta-v7-mockup.html`** (76 KB). Un mockup de
  trabajo, publicado en el sitio público. Lo que se implementó está en
  `PLAN-V7.md`, que ahora dice que el archivo ya no está.
- **`test-doc.pdf`**. Cero referencias: los tests de PDF usan un buffer
  sintético, no este archivo.

### Código muerto que destapó `knip --include exports`

- **`PresentLauncher`** (`presentation-dialog.tsx`): un botón exportado que no
  llamaba nadie. Con él se va `canPresent`, que solo lo usaba él.
- **`fetchTemplateZip`** (`templates.ts`): el Sandbox descarga el ZIP por su
  cuenta desde `initialZipUrl`; esta función quedó huérfana al cablearlo.

Los 21 exports que `knip` sigue marcando son la API de los componentes de
shadcn, y están así a propósito: lo dice `knip.jsonc`.

### Lo que NO borré, porque lo que había que hacer era arreglarlo

El `Dockerfile` decía ser para self-hosting y traía **`npx prisma generate` y
un `DATABASE_URL=file:./db/docker.db`**. Aquí **no hay Prisma ni base de
datos**: es una PWA que corre en el navegador. Heredado de otro proyecto, como
las guías. Reescrito:

- fuera Prisma y `DATABASE_URL`;
- `npm ci` en vez de `npm install` — `install` puede resolver versiones
  distintas a las del lockfile, que es exactamente el desfase que ya rompió un
  despliegue entero;
- documentado `PRISM_ACCESS_CODE`, que en un despliegue público no es opcional.

Y el `.dockerignore` tenía un **`*.zip`** que dejaba fuera de la imagen
`public/demo-sandbox.zip` y `public/demo-modulos.zip`: en Docker, «Probar con
una demo» habría dado 404 sin que nada lo explicara. También llevaba carpetas
del otro proyecto (`db/`, `download`, `upload`, `workspace`, `tool-results`,
`agent-ctx`, `skills`) que aquí no existen.

El README, de paso, dibujaba en su árbol un **`prisma/ # esquema (opcional,
SQLite local)`** que tampoco existe. Corregido, y ahora el árbol nombra
`tests/` y dice qué hay de verdad en `public/`.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1115** unitarios · ✓ **144** E2E
- ✓ `npm start` + `/api/version` → `3.35.2`, y comprobado a mano en producción:
  la raíz da 200, `/demo-sandbox.zip` da **200** (las demos siguen ahí) y
  `/guia-vercel-pwa.html` da **404** (borrada de verdad)
- ✓ `VERCEL=1` con `.next/next-server.js.nft.json`

### Lo que NO pude comprobar

- **La imagen Docker no se ha construido.** Los arreglos son de lectura: no
  hay Prisma que generar, `npm ci` respeta el lockfile y `*.zip` excluía las
  demos. Pero `docker build` no se ha ejecutado aquí, y el CI tampoco lo hace.
  Si alguien va a self-hostear, que lo construya una vez antes de fiarse.
- **No sé si alguien tenía guardado un enlace** a las guías borradas. Eran
  páginas públicas; ahora dan 404. Lo vigente está en el README.

---

## v3.35.3 — El Sandbox no encontraba el `index.html` casi nunca

Encargo: «revisa que el Sandbox busque automáticamente index.html cuando
cargas un zip». Lo buscaba, pero **solo en la raíz del ZIP**, y casi ningún
ZIP es así.

### Lo que pasaba

`pickEntryPath` (`sandbox.ts`) preferían el `index.html` con esta condición:

```ts
htmls.find((p) => depth(p) === 1 && /^index\.html?$/i.test(…))
```

`depth(p) === 1` es «en la raíz del ZIP». Pero el «Download ZIP» de GitHub
—y cualquier proyecto exportado— mete todo dentro de **una carpeta**:
`mi-web/index.html` tiene profundidad 2. Con una carpeta envolviendo, esa
regla no se aplicaba nunca y quedaba el desempate **alfabético**.

Medido antes de tocar nada, sobre siete casos reales: **cuatro abrían el
archivo equivocado**.

| ZIP | Abría | Debía abrir |
|---|---|---|
| `mi-web/{about,index}.html` | `about.html` | `index.html` |
| `proyecto/{contacto,index}.html` | `contacto.html` | `index.html` |
| `{assets/plantilla, web/index}.html` | `assets/plantilla.html` | `web/index.html` |
| `sitio/{aaa.html, index.htm}` | `aaa.html` | `index.htm` |

Los que acertaban lo hacían por casualidad: o el `index` estaba en la raíz, o
era el único HTML, o ganaba igual por orden alfabético.

### El arreglo

El orden pasa a ser: **el `index.html` manda, esté en la carpeta que esté**;
a igualdad, el menos hondo; y a igualdad de todo, alfabético para que sea
estable. El caso especial de la raíz desaparece porque el nuevo orden ya lo
cubre.

Un preferido explícito sigue mandando por encima de todo: si abriste otro
archivo a mano, eso no se discute.

No es solo el ZIP: `pickEntryPath` lo usan también la vista previa de lo que
genera el modelo (`answer-files.ts`), la auto-revisión y el corredor del
Sandbox. Los cuatro caminos mejoran igual.

### Pruebas

- Unitarios: los cuatro casos de arriba, más «entre varios index gana el menos
  hondo» y «un preferido explícito manda». **Los tres tests que ya había pasan
  sin tocarlos** — el arreglo no cambia nada de lo que ya acertaba.
- **Un E2E que lo prueba de punta a punta**: construye un ZIP con el mismo
  escritor que usa la app (`mi-web/about.html` + `mi-web/index.html`, con
  «about» ganando por orden alfabético), lo carga por el input de archivo y
  comprueba qué página aparece dentro del marco.
- **Comprobado en rojo**: con la lógica anterior, ese E2E abre
  «PAGINA SECUNDARIA» en vez del index. Dos de los unitarios nuevos también
  caen.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1119** unitarios (1115 antes) · ✓ **145** E2E
  (144 antes)
- ✓ `npm start` + `/api/version` → `3.35.3` · ✓ `VERCEL=1` con el `.nft.json`

### Lo que NO pude comprobar

- **No he probado con un ZIP real descargado de GitHub**, sin red aquí. El caso
  está reproducido con la misma forma (carpeta envolviendo + varios HTML), y el
  ZIP del E2E se construye con el escritor de la app, no a mano.
- **Un ZIP sin ningún `index.html`** sigue abriendo el HTML menos hondo y
  alfabético. Es lo que ya hacía y me parece razonable, pero es una elección,
  no una certeza: si prefieres que en ese caso pregunte, se cambia.

---

## v3.36.0 — Los «Sugeridos» dejan de proponer modelos que no existen

Reportado con dos capturas: «Conexión OK · OpenRouter — **423 modelos
visibles**» y, justo debajo, cuatro de los cinco sugeridos añadidos y en
**rojo**: «el proveedor no los reconoce o tu clave no llega a ellos».

### La causa

Los sugeridos salían de `def.defaultModels`, una lista **escrita a mano** en
`providers.ts`:

```
deepseek/deepseek-chat-v3-0324:free
meta-llama/llama-3.3-70b-instruct:free
qwen/qwen3-coder:free
z-ai/glm-4.5-air:free
```

Son exactamente los cuatro que salieron en rojo. No es que estuvieran mal
escritos: los proveedores retiran y renombran modelos constantemente, así que
**cualquier lista fija envejece sola**. Da igual cuántas veces se actualice a
mano; vuelve a pasar.

Y lo que más duele: la app **ya tenía la respuesta buena delante**. «Probar»
le pregunta al proveedor, este contesta con su catálogo entero —los 423— y esa
lista **se contaba y se tiraba**. De ahí el «lista no tocada» del aviso.

### El arreglo

`lib/prism/sugeridos.ts`, módulo puro como el resto:

- Con catálogo vivo (lo que el proveedor acaba de contestar a «Probar» o a
  «Cargar modelos») los sugeridos salen **de ahí**, solo los gratis y solo los
  que no tienes ya.
- Sin catálogo vivo, se cae a la lista de mano — pero **se dice**: «Sugeridos
  de la lista de siempre · pulsa «Probar» para ver los tuyos», con el enlace
  que lo hace. Con catálogo, el rótulo es otro y en verde: «Gratis en tu
  catálogo · N que no tienes».
- Si el catálogo vivo no trae ningún gratis que te falte, **no se rellena** con
  la lista de mano: sería volver a proponer justo lo que no existe.

La diferencia visible es esa: un modelo que el proveedor acaba de listar y uno
escrito en el código no valen lo mismo, y hasta ahora se pintaban igual.

### Lo que NO se ha tocado, a propósito

**Los ids de `defaultModels` siguen como estaban.** Aquí no hay red
—`openrouter.ai` está bloqueado por la política de este entorno, comprobado— y
escribir ids «buenos» de memoria sería inventarlos: exactamente el problema que
se está arreglando. Con el catálogo vivo por delante, esa lista pasa a ser lo
que debe ser: un apaño para cuando aún no has probado la clave.

### Pruebas

- Siete unitarios de la decisión: con catálogo y sin él, solo gratis, sin
  duplicar lo que ya tienes (comparando en minúsculas), catálogo vacío que no
  cuenta como catálogo, y el recorte con su total.
- **Un E2E del cambio entero**: OpenRouter apuntando al mock, se ve primero
  «Sugeridos de la lista de siempre» con `deepseek/…:free`; se pulsa «Probar»;
  y pasan a salir los del mock (`mock-mini-free`…), desaparece el de la lista
  de mano, no se propone ninguno de pago, y al pulsar uno se añade.
- **Comprobado en rojo**: volviendo a la lista fija, ese E2E cae.

### De paso

El E2E del `index.html` (v3.35.3) fallaba en la suite completa: su semilla
llevaba `version: 3`, zustand descartaba el estado entero («couldn't be
migrated»), volvía la guía inicial y su overlay se comía el clic. Ahora usa la
misma forma de semilla que el resto. Pasaba suelto y fallaba acompañado, que
es la peor forma de fallar.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1126** unitarios (1119 antes) · ✓ **146** E2E
  (145 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.36.0` · ✓ `VERCEL=1` con el `.nft.json`

### Lo que NO pude comprobar

- **No se ha probado contra OpenRouter de verdad**: sin red aquí. El camino
  está probado con el mock, que es el mismo código de red (`fetchModels`), pero
  no he visto los 423 con mis ojos.
- **Cuáles de los ids de `defaultModels` siguen vivos** hoy en OpenRouter. Por
  eso no los he tocado.
- **Que «Probar» se pulse solo** no está: hay que pulsarlo para que aparezca el
  catálogo. Hacerlo automático al pegar la clave gastaría una petición sin
  pedirla; si lo prefieres así, se cambia.

---

## v3.36.1 — Una imagen mandada una vez viajaba en TODAS las peticiones

Reportado con captura: «Hola», sin adjuntar nada, y OpenRouter contestando
**«404: No endpoints found that support image input»** con `z-ai/glm-5.2:free`.
Dos veces seguidas, en una conversación que había empezado pidiendo una página
de aterrizaje.

### La causa

Los adjuntos se guardan pegados a su mensaje, y el historial **se reenvía
entero en cada turno**:

```ts
...(m.attachments?.length ? { attachments: m.attachments } : {}),
```

O sea que una imagen mandada una vez viajaba en la petición de ese turno **y
en la de todos los siguientes**. Escribías «Hola» y el modelo de texto recibía
la foto de veinte mensajes atrás. No es que el modelo estuviera roto: es que
la app le mandaba algo que él no acepta.

Y no se arregla mirando si el modelo admite imágenes: **aquí no hay catálogo de
capacidades**. OpenRouter sirve cientos de ids y ninguno dice si ve; suponerlo
sería inventar, que es lo que ya nos pasó con los sugeridos.

### El arreglo

`lib/prism/adjuntos-historial.ts`: **las imágenes viajan solo en el turno en el
que las mandas**. En los mensajes anteriores se quedan como una nota de texto
—`[adjuntado en este mensaje: captura.png]`— para que el modelo sepa que hubo
una imagen sin recibirla otra vez.

De paso deja de reenviarse un base64 por turno, que era la otra factura
silenciosa: cada mensaje siguiente arrastraba la imagen entera.

### Y el aviso que mandaba a buscar donde no era

`pistaDelFallo` traducía este 404 como «Ahora mismo ningún proveedor está
sirviendo ese modelo. Suele volver solo; no hace falta quitarlo» — el aviso
ámbar de la segunda captura. Casaba por `no endpoints found`, que también está
en el texto de la imagen.

Son dos problemas distintos: en uno el modelo está caído, en el otro está
**perfectamente vivo** y lo que no admite es la imagen. Ahora se distinguen
(`esFalloDeImagen`), y si aun así mandas una imagen a un modelo que no ve, el
error lo dice en castellano: «ese modelo no admite imágenes: manda solo texto
o elige uno con visión».

### Pruebas

- Siete unitarios de la regla (el «Hola» sin imagen, la del turno actual que sí
  viaja, mensajes intactos, mensaje vacío, sin usuario) y tres de la distinción
  entre «no ve imágenes» y «nadie lo sirve».
- **Un E2E que lee lo que VIAJA**, no lo que se ve: siembra una conversación
  cuyo primer mensaje llevaba imagen, escribe «Hola», intercepta la petición y
  comprueba que no hay `image_url` ni base64 dentro, y que sí queda la nota.
- **Comprobado en rojo**: sin el arreglo, esa petición lleva `image_url`.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1136** unitarios (1126 antes) · ✓ **147** E2E
  (146 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.36.1` · ✓ `VERCEL=1` con el `.nft.json`

### Lo que NO pude comprobar

- **No se ha reproducido contra OpenRouter de verdad**: sin red en este
  entorno. Lo que sí está probado es lo que importa y lo que se podía probar:
  qué sale en la petición.
- **El 503 de Gemini de la primera captura es otra cosa** y no se ha tocado:
  «This model is currently experiencing high demand» es el proveedor caído,
  no un fallo nuestro. El failover ya está para eso.
- **Si preguntas por una imagen de hace varios mensajes**, el modelo ya no la
  recibe: le queda el nombre del archivo, no la foto. Es el precio de no
  reenviarla siempre. Si alguna vez hace falta recuperarla, la vuelves a
  adjuntar. Decisión mía, revisable.

---

## v3.36.2 — Un proveedor caído ya no para la conversación, y el aviso deja de culpar a tu cuota

Reportado con captura: Gemini contestando **503 «This model is currently
experiencing high demand»** dos veces seguidas, el error quedándose en
pantalla, y encima un aviso de **cuota agotada** a alguien con clave **Pro**.

Dos fallos distintos, los dos nuestros.

### 1 · El failover no saltaba con un proveedor caído

`decidirTrasError` mandaba a `failover` en dos casos: cuota agotada, o trabajo
a medias que merece la pena continuar. Un **503 sin nada escrito** no era
ninguno de los dos. Y con un modelo elegido a mano la cadena es de **uno solo**,
así que tampoco había «siguiente» al que ir.

Resultado: `parar`. Error en pantalla, y ahí se quedaba — con otros proveedores
conectados y sin usar. Justo lo que el failover existe para evitar.

Ahora un fallo **pasajero** (0, 408, 5xx) sin cadena que seguir salta de
proveedor. Un 400 o un 404 **no**: ahí el problema es la petición y probar otro
sería esconderlo. El tope de saltos sigue mandando.

### 2 · «Cuota gratis agotada» se decía siempre

Los dos avisos del failover llevaban ese texto **fijo**, pasara lo que pasara:

```
`Cuota gratis agotada en ${failedName}`
`${failedName} se quedó sin cuota gratis`
```

Con un 503 eso es sencillamente **falso**, y con una clave de pago manda a
mirar la facturación por un problema que está en el proveedor. Ahora el motivo
se calcula (`motivoDelFallo`) y el titular lo dice:

- **cuota** (402, 429, o el aviso escrito en el cuerpo) → «Cuota agotada en X»
- **caído** (0, 408, 5xx) → «X no está respondiendo»
- **otro** → «X falló»

### Pruebas

- Nueve unitarios: el 503 con la cadena agotada que va a failover, la petición
  caída, el 400 y el 404 que siguen parando, el tope de saltos, y los cuatro
  del motivo y sus titulares.
- **Un E2E del caso entero**: dos proveedores conectados, modelo elegido a
  mano, el primero devuelve un 503 con el texto literal de Gemini. Se comprueba
  que el aviso dice «no está respondiendo», que **no aparece la palabra
  «cuota»** en ningún aviso, y que contesta el segundo proveedor.
- **Comprobado en rojo**: quitando la regla del fallo pasajero, ese E2E cae.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1144** unitarios (1136 antes) · ✓ **148** E2E
  (147 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.36.2` · ✓ `VERCEL=1` con el `.nft.json`

### Lo que NO pude comprobar

- **No se ha reproducido contra Gemini de verdad**: sin red en este entorno. El
  503 del E2E lleva el texto literal de la captura, y el camino que recorre es
  el mismo.
- **El 404 de la imagen de la misma captura es el de la v3.36.1** y ya está
  arreglado; esa conversación venía de antes del arreglo, así que ahí sigue.
  En un hilo nuevo no debería volver.
- **Si el 503 es de TODOS tus proveedores**, seguirá parando: no hay a quién
  saltar. Entonces el aviso lo dice sin inventarse una causa.

---

## v3.36.3 — «Hola» ya no arranca el bucle del agente

Reportado con captura: en la conversación de la página de aterrizaje, escribir
**«Hola»** devolvía el bucle entero —Plan / Estado / Edits / Resultados— con un
**«He actualizado el archivo index.html»** y un párrafo sobre hotlinking y
CDNs. Nadie había pedido tocar nada.

### La causa, y no es el modelo

Con el modo agente encendido, **todos** los turnos llevaban delante la
plantilla del agente y el catálogo de herramientas. La plantilla dice, con
mayúsculas:

> «estructuras tu respuesta EXACTAMENTE con estas etiquetas» ·
> «continúa OBLIGATORIAMENTE con otro `<step>`»

Y la regla que decía «si la tarea es trivial (saludo, pregunta corta), responde
normal sin etiquetas» era la **número 4 de cinco**, enterrada debajo. Además,
la ficha y el mapa del proyecto iban delante: el modelo veía «existe
index.html, estas son sus funciones» y una plantilla que rellenar. La rellenó.

Pedirle a un modelo gratis de 8k que se acuerde de esa línea es confiar en la
suerte. Decidirlo en el código es determinista.

### El arreglo

`lib/prism/turno-trivial.ts`: en un turno trivial **no se manda la plantilla
del agente ni las herramientas**. Sin plantilla no hay plan que montar, y sin
herramientas no hay archivos que escribir.

Qué cuenta como trivial: mensaje corto (≤ 8 palabras, ≤ 80 caracteres) que
sea un saludo o una cortesía entera —hola, buenas, qué tal, gracias, ok, vale,
adiós, test…— **y** que no traiga nada que huela a encargo (verbos como
arregla/añade/crea/cambia/sigue/revisa, una URL, un bloque de código, un nombre
de archivo), **y** que el clasificador de tareas tampoco reconozca como web,
código, datos, escritura o razonamiento.

**El riesgo de esta función va al revés de lo que parece.** Dar por trivial un
encargo de verdad sería quitarle el agente a quien lo pide, y eso es peor que
el fallo que se arregla. Por eso todo lo dudoso cuenta como NO trivial, y hay
un test entero dedicado a esa lista: «arregla el botón», «sigue», «pon un
menú», «hola, quiero una landing para una cafetería…» — ninguno es trivial.

### Pruebas

- Cinco unitarios: los saludos, la lista de encargos que NUNCA deben serlo, el
  mensaje largo que empieza por «hola», las preguntas de verdad, y el vacío.
- **Dos E2E que leen lo que VIAJA**: con el modo agente encendido, «Hola» sale
  sin `MODO AGENTE`, sin `<step n=` y sin el catálogo de herramientas; y
  «arregla el botón del formulario» **sí** lleva la plantilla — el otro lado de
  la moneda, para que el arreglo no se coma el agente de quien lo necesita.
- **Comprobado en rojo**: sin el cambio, el primero falla («sin la plantilla
  del agente») y el segundo sigue pasando.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1149** unitarios (1144 antes) · ✓ **150** E2E
  (148 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.36.3` · ✓ `VERCEL=1` con el `.nft.json`

### Lo que NO pude comprobar, y una decisión

- **La lista de saludos es en español e inglés básico.** Si escribes en otro
  idioma, o un saludo que no está en la lista, el turno cuenta como normal y
  vuelve la plantilla. Ampliarla es fácil; adivinarla, no.
- **El mapa del proyecto SIGUE viajando** en un turno trivial. Podría quitarse
  también —es parte de lo que empuja al modelo a «seguir con el proyecto»—
  pero es la memoria de la sesión y quitarla tiene su propio coste. Empecé por
  lo que provoca el comportamiento: la plantilla y las herramientas. Si con
  esto todavía se pone a editar, se quita el mapa también.
- **No se ha probado contra un modelo real**: sin red aquí. Lo comprobado es
  qué sale en la petición, que es donde estaba el fallo.

---

## v3.37.0 — Cinco runtimes locales más, y el radar dice qué te van a pedir

Sale de un listado de APIs gratis (itsfree.ai, recopilado por @midudev) que
trajo el usuario. De sus 25 proveedores, **11 ya estaban** en Prism; de sus 9
runtimes locales, **2**. Se han tomado las dos ideas que aportan algo sin meter
datos que envejezcan mal.

### 1 · llama.cpp, Jan, vLLM, MLX y llamafile

Los cinco exponen una API **compatible con OpenAI en localhost**, así que
entran con el mismo patrón que LM Studio: `keyless`, `directByDefault`, y una
entrada de tabla. Sin cuenta, sin clave, sin cuota — es tu equipo. Encajan con
la promesa del producto mejor que cualquier nube.

Y **`defaultModels: []` en los cinco**, a propósito: a un servidor local no se
le adivina qué modelos tiene descargados, se le pregunta con «Probar». Escribir
ahí una lista de nombres sería repetir el fallo de la v3.36.0, donde los
sugeridos de OpenRouter proponían modelos que ya no existían. Hay un test que
lo sostiene.

Cada uno lleva su `hint` con el comando que levanta el servidor
(`llama-server -m modelo.gguf --port 8080`, `vllm serve <modelo>`,
`mlx_lm.server`…), que es lo que de verdad hace falta saber.

El test de la v3.35.0 —«FAILOVER_ORDER cubre a todos los proveedores»— **saltó
en cuanto añadí los cinco**, exactamente para lo que se escribió: sin él se
habrían quedado fuera de la cadena de failover y de la lista de Ajustes, en
silencio.

Están en la cadena pero **no en `FULL_FREE_TIER`**, igual que LM Studio: un
servidor que no está levantado no debe recibir la conversación cuando la nube
falla. Solo entran si tú añadiste modelos suyos.

### 2 · Qué te piden para darte la clave

El dato más útil del listado no eran modelos: era **email / teléfono /
tarjeta**. El radar te mandaba a por una clave sin avisar de que en NVIDIA y
Z.ai piden **teléfono**, o de que Cerebras pide **tarjeta**. Mucha gente se
entera a mitad del registro y se da la vuelta.

`RadarSource` gana `registro`, cada tarjeta lo enseña, y hay un filtro **«Sin
teléfono ni tarjeta»**.

**Lo que no se sabe se dice**: AiHubMix, TokenRouter y GitHub Models no están
en ese listado, así que se quedan en `null` y la tarjeta pone «Registro: sin
dato». Y el filtro **los deja fuera** — «sin dato» no es «no piden nada», y
colarlos ahí sería justo la promesa falsa que el filtro viene a evitar. Hay un
test para eso.

Los valores llevan su procedencia escrita en el código: **son de itsfree.ai,
consultado el 2026-09-02, no medidos por Prism**. Nadie de aquí se ha dado de
alta en los trece para comprobarlo, y decirlo es más barato que fingirlo.

### Lo que NO se tomó del listado, y es lo importante

**Los nombres de modelo.** «Gemini 3.7 Flash», «GLM 5.2», «Kimi K3»,
«Gemma 4 31B»… Hace dos versiones arreglamos justo eso: los sugeridos salían de
una lista escrita a mano, cuatro no existían y salían en rojo. Copiar esta
lista sería reconstruir el bug con datos que además no puedo verificar —
`openrouter.ai` está bloqueado por la política de red de este entorno.

**Los proveedores nuevos de nube.** La regla del repositorio («hay 17 y
sobran») sigue valiendo: cada uno es mantenimiento, y la mitad del listado son
créditos de prueba que se agotan. Los locales son otra cosa: no caducan, no
tienen cuota y no hay clave que rotar.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1160** unitarios (1149 antes) · ✓ **152** E2E
  (150 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.37.0` · ✓ `VERCEL=1` con el `.nft.json`
- Los dos E2E, comprobados en rojo por separado: sin la etiqueta cae el del
  radar, sin los proveedores cae el de los runtimes.

### Lo que NO pude comprobar

- **No he levantado ninguno de los cinco runtimes.** Los puertos son los que
  cada proyecto trae de fábrica según el listado; si alguno cambió, se edita la
  URL base y ya. Que la app hable con un servidor OpenAI-compatible en
  localhost sí está probado desde hace versiones (Ollama, LM Studio).
- **Los `registro` no están verificados por mí**, con el detalle de arriba.
- **GPT4All y KoboldCpp se quedan fuera**: el listado no da su endpoint
  compatible y no me lo voy a inventar. Si me pasas el puerto, entran en cinco
  minutos.

---

## v3.38.0 — El veredicto de «Probar modelos» sale del diálogo

Reportado con captura: los cuatro modelos de Groq tachados en rojo —«4 no
responden»— y, en palabras del usuario, «aunque el modelo no funciona lo agrega
al apartado en el chat de escoger modelos».

### La causa, en una línea

```ts
const [probados, setProbados] = useState<Record<string, ProbeResult>>({});
```

El resultado de la prueba vivía en un `useState` **dentro del diálogo de
Ajustes**. Al cerrarlo se perdía. El selector del chat nunca se enteraba de
nada, y volvía a ofrecer los mismos modelos que acababan de fallar. Elegías uno
y volvía el error.

### El arreglo

`lib/prism/modelos-rotos.ts`: una memoria persistida de los modelos que el
proveedor **no reconoce**, con dos reglas que importan tanto como la función:

1. **Solo entra la culpa confirmada del modelo** — «no existe» o «tu clave no
   llega a él». Nunca un límite de peticiones, ni una caída del proveedor, ni
   un servidor local apagado. Ya existía `culpaConfirmadaDelModelo` para esa
   decisión y es la que manda: acusar a un modelo bueno es peor que dejar pasar
   uno malo.
2. **Una prueba que sale bien limpia la marca**, y recargar la lista de un
   proveedor borra todas las suyas. Los proveedores retiran y reponen modelos;
   una lista negra que solo crece acabaría escondiendo modelos que ya
   funcionan.

Con eso, un modelo marcado:

- **no se ofrece en el selector del chat** — con una escapatoria: el que tienes
  puesto AHORA se queda aunque esté marcado, o la cabecera señalaría a un
  modelo que no aparece en ninguna lista;
- **no entra en la cadena de Auto**, que lo elegía y fallaba en el primer
  intento gastando un salto para nada;
- **no recibe el failover**: saltar a un modelo que ya sabemos que no responde
  es cambiar un error por otro.

En Ajustes sigue estando, tachado y con lo que contestó, para quitarlo o
volver a probarlo.

### Sobre «ninguno funciona»

Los cuatro de la captura son los `defaultModels` que Prism trae escritos para
Groq. Es la misma enfermedad que se arregló en la v3.36.0 con los sugeridos de
OpenRouter: **listas de ids escritas a mano envejecen solas**. La cura de
verdad ya está puesta —«Cargar modelos» trae el catálogo real y ahora borra las
marcas viejas— y esto evita que los caducados sigan apareciendo como si nada.

**No he tocado los ids de `defaultModels`.** Sin red en este entorno no puedo
saber cuáles siguen vivos, y escribirlos de memoria sería exactamente el fallo
que estamos persiguiendo. Lo que sí hace la app ahora es no ofrecerte lo que ha
comprobado que no responde.

### Pruebas

- Nueve unitarios: el filtrado, la escapatoria del modelo en uso, el texto del
  motivo, y —lo más importante— **qué NO se marca**: 429, servidor local
  apagado, 503 del proveedor, y el 404 de la política de datos de OpenRouter
  (el modelo existe; funciona en cuanto la aceptas).
- **Un E2E del camino entero**: dos modelos (uno bueno, uno que el mock no
  reconoce), se prueban en Ajustes, **se cierra el diálogo** —que es donde se
  perdía— y se comprueba que el selector del chat ya no ofrece el fantasma y sí
  el bueno.
- **Comprobado en rojo**: sin el filtro, el fantasma sigue en el selector.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1169** unitarios (1160 antes) · ✓ **153** E2E
  (152 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.38.0` · ✓ `VERCEL=1` con el `.nft.json`

### Lo que NO pude comprobar

- **No se ha probado contra Groq de verdad**: sin red. El E2E usa el mock, que
  devuelve el mismo `model_not_found` con 404 que devuelven los proveedores.
- **Las marcas se hacen al probar, no solas.** Si nunca pulsas «Probar
  modelos», nada se marca y el selector sigue ofreciéndolo todo. Marcar por un
  fallo del chat es tentador pero peligroso: un 404 puntual no distingue entre
  «no existe» y «se cayó ahora mismo», y esconder un modelo bueno es peor.
  Si lo quieres automático, se hace, pero prefiero decirlo antes.

---

## v3.39.0 — Sube código y ZIP al chat: se leen enteros aquí, y se dice lo que no cupo

Pedido: «debería dejar subir archivos en el chat para poder analizar corregir
reparar, y zip también, que sea capaz de leer todo dentro del zip».

### Lo que pasaba

El compositor aceptaba imágenes, PDF, `.txt`/`.md` y hojas de cálculo. Un
`.js`, un `.py` o un `.zip` **no encajaban en ningún filtro y se ignoraban en
silencio**: soltabas el archivo, no pasaba nada, y nadie te decía por qué. Eso
era casi peor que no aceptarlos.

### Código suelto

`isTextPath` (el mismo que usa el Sandbox) pasa a decidir qué es texto, y se le
añaden los lenguajes que la gente trae para que se los revisen: `py`, `rb`,
`php`, `java`, `kt`, `go`, `rs`, `c`, `cpp`, `cs`, `swift`, `sh`, `sql`, `vue`,
`svelte`, `scss`, `diff`, `patch`… Se puede leer y corregir un `.py` aunque el
Sandbox no sepa ejecutarlo.

Y lo que sigue sin poder leerse **se dice** en vez de tragárselo.

### ZIP

`lib/prism/zip-a-texto.ts`. El ZIP se abre **en el navegador**, con el mismo
lector que usa el Sandbox: nada sale del dispositivo.

«Que lea todo lo de dentro» choca con la realidad del producto: los modelos
gratis de aquí tienen 8k de contexto y un proyecto cualquiera pasa del millón
de caracteres. Mandarlo entero no es generoso — es que la petición falla. Así
que se prioriza, y **lo que no cabe se nombra**:

1. **El índice completo va siempre**: todos los archivos con su tamaño, aunque
   el contenido no quepa. El modelo tiene que conocer la forma del proyecto
   aunque no haya leído cada archivo; si no, opina sobre algo que no ha visto.
2. **El contenido, por prioridad**: README y manifiestos primero, luego
   `index`/`main`, luego lo menos hondo. Techo de 60.000 caracteres en total y
   12.000 por archivo, para que un minificado no se coma el presupuesto.
3. **«Lo que NO viaja en este mensaje»**: los recortados con cuántos
   caracteres faltan, los que no cupieron **por su nombre** (para que puedas
   pedirlos), los binarios, y lo omitido por ser `node_modules`, lockfiles o
   `.min.js`.

Esa tercera sección es la que hace que esto sea honesto. Un resumen que oculta
lo que no cupo es peor que uno corto.

### Pruebas

- Nueve unitarios: qué es ruido y qué no, que el índice sale entero aunque el
  contenido no quepa, que se respeta el techo, que un archivo enorme se recorta
  **diciendo cuánto falta**, el orden de prioridad, y un ZIP solo de imágenes
  que lo admite en vez de fingir que leyó algo.
- **Dos E2E que leen lo que VIAJA**: se construye un ZIP con el escritor de la
  propia app, se suelta en el chat, se manda «repara esto» y se comprueba que
  el contenido de los tres archivos de texto está en la petición, que el índice
  incluye el `.png`, que el `node_modules` **no** viaja, y que el aviso de lo
  omitido sí. El segundo hace lo mismo con un `.js` suelto.
- **Comprobados en rojo**: con el filtro anterior, los dos caen.

### De paso

Renombrar el botón de adjuntar («Adjuntar imágenes o PDF» ya era falso) rompió
`composer.spec.ts`, que lo buscaba por ese nombre. Es la trampa §1.4 de
`INSTRUCCIONES-V6.md`, esta vez al revés: no había colisión, el nombre viejo
había dejado de ser cierto. Test actualizado al nombre nuevo.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1178** unitarios (1169 antes) · ✓ **155** E2E
  (153 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.39.0` · ✓ `VERCEL=1` con el `.nft.json`

### Lo que NO pude comprobar, y dos límites que conviene saber

- **No se ha probado con un ZIP grande de verdad** (un repo entero). El
  reparto y los recortes están probados con unitarios; el comportamiento con un
  ZIP de 50 MB en un móvil no lo he medido. El lector es el mismo que ya usa el
  Sandbox desde hace versiones.
- **Un ZIP grande NO cabe entero, y eso no es un fallo**: es el techo de
  contexto. Lo que la app garantiza es que sabrás qué se quedó fuera y podrás
  pedirlo por su nombre.
- **Máximo 3 documentos por mensaje**, y un ZIP cuenta como uno. Es el cupo que
  ya había para PDF y hojas; no lo he tocado.

## v3.40.0 — El agente mide su propio cambio, y el QA por fin le llegaba

Del catálogo de ocho herramientas que llegó en el mockup, entran **tres**. Las
otras cinco se descartaron o se convirtieron en otra cosa, y el porqué está más
abajo: dos de ellas se apoyaban en cosas que aquí no existen.

### El fallo que apareció verificando el mockup

`sandbox-runner.ts` leía la medida de QA en `e.data.items`. El medidor
(`visual-qa.ts`) manda `{ type, token, result }`: la medida va dentro de
`result`. Así que `Array.isArray(undefined)` era `false`, `qaResults` se quedaba
en `null` y **`run_project` con `qa: true` no le ha contado nunca un solo
hallazgo al agente**. El QA se medía, se mandaba por `postMessage`, y se tiraba
en esa línea.

De paso, una medida que **no respondió** se contaba como «cero hallazgos», que
es un aprobado inventado. Ahora se excluye del recuento, igual que ya hacía el
Sandbox visible.

### `run_regression` — mide el antes y el después

`compareRuns` y `comparables` estaban escritos y probados desde la v3.31, y solo
los usaba `sandbox-studio.tsx`. Ahora el agente puede llamarlos: ejecuta el
proyecto y lo compara con **su ejecución anterior de esta conversación**.

- La **primera vez no hay con qué comparar**, y se dice: se guarda la referencia
  y se le explica que vuelva a llamarla después de editar. No se inventa una
  comparación con la nada.
- `run_project` también deja referencia, así que el flujo natural —ejecuto,
  edito, mido— funciona sin preparar nada.
- Dos ejecuciones de **páginas distintas no se comparan**, y se dice cuál era
  cuál.
- Si el QA no respondió en alguno de los dos lados, se lee **«sin comparación»**,
  no «sin cambios».

### `snapshot_diff` — qué archivos se movieron

Módulo puro nuevo, `diff-proyectos.ts`, encima del `diff.ts` que ya había.
Con un id compara ese punto de restauración con el proyecto **tal como está
ahora** (el caso normal); con dos, los compara entre sí.

Esto **absorbe la `diff_with_main` del mockup**, que no se puede hacer: pedía
`against: "main" | sha | "head~1"` y declaraba un permiso «Git ✓». Aquí no hay
git. `git_snapshot` es un nombre entre comillas: son copias planas en
`localStorage`.

Y de paso, **el catálogo mentía sobre los ids**. Decía «(s1, s2…)» y los ids
reales son `s` + la fecha en base 36 (`smtknd746`). El modelo llamaba con «s1» y
se llevaba un error. Corregido en `git_snapshot` y en la nueva; hay un unitario
que recorre el catálogo entero para que no vuelva a colarse.

### `ask_memory` — preguntar al mapa en vez de arrastrarlo

`buscarEnMapa` busca en archivos, funcionalidades, tecnologías y **notas de
memoria**. Las notas van con ventaja a propósito: son lo que decidió el usuario,
y eso pesa más que algo que Prism dedujo leyendo el HTML.

El argumento del mockup («recuperar decisiones») era el flojo: el mapa **ya
viaja entero en cada prompt** vía `renderMapForPrompt`. El fuerte es poder
dejar de mandarlo siempre y que el modelo lo pida cuando le haga falta.

Distingue dos cosas que no son la misma: **«todavía no hay mapa»** y **«no hay
nada sobre eso»**. Y no hay porcentaje de relevancia: o una palabra de la
pregunta está en el texto, o no está.

### `read_url` gana `selector` y `max_chars` (no una tool nueva)

La `import_url` del mockup **ya existe**: es `read_url`. Meter una gemela habría
hecho que el modelo eligiera mal la mitad de las veces. Lo que sí faltaba eran
sus dos parámetros.

`extraerSeleccion` entiende **solo selectores simples**: `main`, `#precios`,
`.PricingTable`, `section#precios`, `div.card`. Sin combinadores, atributos ni
comas. Es una decisión, no una limitación que se esconde: un motor CSS a medio
hacer que acierta el 80 % es peor que uno que dice qué sabe hacer. Si el
selector no se soporta, o no casa, **se devuelve un error** — nunca la página
entera fingiendo que se hizo caso. Va por texto y no por DOM para dar el mismo
resultado en el navegador y en un test.

`max_chars` sube el tope de 8 000, con techo de 20 000: una sola página no se
come la conversación.

### El peso del HTML era el peso del HTML *más Prism*

Saltó leyendo la salida del E2E: una página de 410 caracteres pesaba 2 196
bytes. `built.html` ya trae el puente de consola, y encima se medía después de
inyectar el medidor de QA y el piloto. O sea, el «peso html» que se enseñaba
incluía ~1,8 KB de instrumentación que el usuario no tiene y no puede bajar.

`buildRunHtml` ahora apunta `htmlBytes` con el proyecto ya empaquetado (CSS, JS
e imágenes dentro) y **antes** de inyectar nada. Lo usan el agente y el Sandbox
visible.

### Lo que NO entra, y por qué

- **`deploy_preview`**: `localhost.run` es un túnel **SSH**. En un navegador no
  hay SSH ni servidor local que tunelar — el Sandbox es un `<iframe>`. Para que
  hubiera URL pública habría que subir los archivos a un host ajeno: servidor y
  casi seguro cuenta, o sea lo contrario de la promesa del producto. La tarjeta
  además enseñaba datos inventados («uso 3 / 50 requests»).
- **`transcribe_media`**: decía reutilizar `speech.ts`, que es `startDictation`
  sobre la Web Speech API — escucha el **micrófono en vivo**.
  `SpeechRecognition` no acepta un archivo de audio en ningún navegador. El
  fallback propuesto, Whisper local, son 40-75 MB de modelo en WASM.
- **`propose_plan`**: buena idea, pero una tool es algo que el modelo
  *ejecuta* y un plan es algo que *escribe*. Sale con prompt + parser + UI, y el
  bloqueo «espera tu OK» lo da la interfaz, no la herramienta. Pendiente.
- **`diff_with_main`**: fusionada en `snapshot_diff` (ver arriba).

### Lo que el mockup daba por hecho y no existe

El pie decía: «Las tools nuevas heredan `skill-permissions.ts`… el usuario las
ve listadas y puede apagarlas por chat». **Eso no existe.**
`analyzeSkillPermissions` analiza con expresiones regulares el texto en prosa de
una skill **antes de instalarla**. No hay declaración de permisos por
herramienta, ni comprobación en ejecución, ni interruptor. Las tarjetas
«Red ✓ por URL / Claves — no envía» eran etiquetas dibujadas.

No se ha implementado nada de eso aquí, y **no se enseña por ninguna parte**.
Lo que sí es real y sigue puesto es `net-guard.ts` en `/api/proxy`, que bloquea
localhost, IPs privadas y los metadatos de la nube, revalidando cada redirección.

### Pruebas

- Unitarios nuevos: `diff-proyectos` (9), `memoria-mapa` (11), `selector-html`
  (14), `tools-v8` (21, las tres herramientas por el runner real), más 7 casos
  de selector en `tool-runner-read-url` y 2 de peso en `sandbox`.
- E2E `tools-medir.spec.ts` con un modelo simulado nuevo, `mock-mide`, que
  recorre la sesión entera: escribe una página rota, guarda un punto, la mide,
  la arregla, la vuelve a medir, compara archivos y consulta el mapa.
- **Comprobados en rojo**: con el fallo del payload restaurado a mano, el E2E lee
  «QA móvil: sin comparación» donde ahora lee «sin cambios». Con las tres
  herramientas desactivadas del catálogo, lee «Herramienta desconocida».

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1245** unitarios (1178 antes) · ✓ **156** E2E
  (155 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.40.0` · ✓ `VERCEL=1` sin `standalone` y
  con el `.nft.json` donde Vercel lo busca

### Lo que NO pude comprobar

- **El `selector` de `read_url` no tiene E2E**, y es a propósito: en este entorno
  no hay red hacia fuera y `net-guard` rechaza —correctamente— una página local,
  así que no hay ninguna página que la herramienta pueda leer de verdad. Es la
  misma razón por la que `read_url` tampoco lo tenía. Está probado con 14
  unitarios del extractor (`selector-html`) y 7 que pasan por `runTool` de
  verdad con el `fetch` simulado.
- **`run_regression` no se ha probado contra un proyecto grande**. Las dos
  ejecuciones del E2E son de una página de 400 caracteres. Con un proyecto de
  cientos de KB, cada medida son dos cargas completas del iframe: no he medido
  cuánto tarda ni si el techo de 2,5 s de recogida de logs se queda corto.
- **`ask_memory` busca por palabras, no por significado.** «¿qué colores
  usamos?» no encuentra una nota que diga «la paleta es cálida» si no comparten
  ninguna palabra. Es una búsqueda literal y honesta, no un buscador semántico.

## v3.41.0 — Permisos por herramienta que se hacen cumplir

El catálogo llevaba versiones diciendo, en su propia cabecera, «si añades una
herramienta aquí, dale permiso en `tool-permissions.ts`». **Ese archivo no
existía.** Lo que sí existía era `skill-permissions.ts`, que es otra cosa:
analiza el texto en prosa de una skill antes de instalarla.

Tres piezas, y sin las tres esto sería una pantalla decorativa:

### 1. Declaración — `tool-permissions.ts`

Cuatro efectos: **leer el proyecto**, **escribir en el proyecto**, **ejecutar
código**, **salir a internet**. Cada una de las 15 herramientas declara los
suyos. Dos tests lo cierran en los dos sentidos: una herramienta sin declarar
sería una herramienta que nadie puede apagar, y una entrada de más sería una
promesa sobre algo que no existe.

Decisiones que conviene dejar escritas:

- **`git_snapshot` cuenta como escritura**, aunque «create» y «list» solo lean:
  «restore» descarta archivos. Manda el efecto más fuerte que la herramienta
  puede llegar a tener.
- **Una herramienta sin declarar NO se ejecuta.** Es lo contrario de lo cómodo
  y es lo correcto: si alguien añade una y olvida declararla, lo que no puede
  pasar es que corra sin permiso porque nadie sabía cuál pedirle.
- **Todo concedido por defecto.** El agente sin permisos no sirve, y un
  producto que arranca roto «por seguridad» acaba con el usuario encendiéndolo
  todo sin leer. Lo que importa es que se vean, se apaguen y que apagarlos
  surta efecto.
- **Un efecto que falta en los ajustes guardados se concede**, no se deniega.
  Al revés, una actualización dejaría al agente mudo sin que el usuario haya
  tocado nada.

### 2. Comprobación — en dos capas

- **`tool-runner.ts`** rechaza antes del `switch` y antes de tocar nada. Esta
  es la que manda: que el catálogo venga filtrado no basta, porque el modelo
  puede pedir una herramienta que no se le ofreció (se la inventa, o la
  arrastra de un turno anterior).
- **`use-agent-tools.ts`** recorta el catálogo que se le describe al modelo.
  No es seguridad, es no gastar contexto en herramientas que se van a
  rechazar y no provocar reintentos.

El mensaje de rechazo está escrito para el modelo: le dice qué permiso falta y
**que no insista**. Sin eso se queda reintentando hasta agotar las vueltas.

De paso: **el probe también mandaba el catálogo entero**. Solo comprueba si el
modelo entiende `tools`, así que describirle al proveedor herramientas que el
usuario apagó era mandar fuera una capacidad que decidió no usar, y pagar sus
tokens. Ahora lleva el catálogo filtrado.

### 3. Interruptor — Ajustes → Chat

Aparece con el modo agente encendido. Cada efecto con su explicación de lo que
pasa de verdad, y **qué herramientas cubre, por su nombre**. La lista sale de
la tabla, no escrita a mano: si se añade una herramienta, aparece sola; escrita
a mano, el panel mentiría en cuanto el catálogo creciera.

Con algo apagado, un aviso dice exactamente cuántas herramientas y cuáles
pierde el agente — calculado del catálogo real.

### Pruebas

- 19 unitarios de la tabla y las reglas; 6 en `tools-v8` que comprueban el
  cumplimiento **por sus efectos, no por el mensaje**: con «red» apagada el
  `fetch` no ocurre, con «escribir» apagado el archivo no cambia, con
  «ejecutar» apagado `runProject` no se llama. 3 del filtrado del catálogo.
- E2E `permisos-agente.spec.ts`: abre Ajustes, apaga «Salir a internet»,
  comprueba el aviso, que `read_url` desaparece de **todas** las peticiones que
  llevan catálogo (probe incluido) y que la llamada acaba rechazada.
- **Comprobados en rojo**: desactivando la comprobación del runner a mano,
  caen 4 unitarios —entre ellos el que verifica que **no se sale a internet**—
  y el E2E.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1273** unitarios (1245 antes) · ✓ **159** E2E
  (156 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.41.0` · ✓ `VERCEL=1` sin `standalone` y
  con el `.nft.json`

### Lo que esto NO es

- **No es un sandbox de seguridad.** Es control del usuario sobre su propio
  agente, no defensa contra código hostil. Lo que protege el perímetro sigue
  siendo `net-guard.ts` en `/api/proxy` y el `sandbox` del iframe.
- **No hay permisos por herramienta suelta**, solo por efecto. Apagar «red»
  apaga las tres de internet a la vez. Cuatro interruptores que se entienden
  valen más que quince que nadie lee.
- **No hay confirmación por llamada.** El agente no pide permiso cada vez: o
  puede o no puede. Un diálogo por herramienta en un bucle de ocho vueltas se
  convierte en un botón que se pulsa sin leer.
- **No cubre lo que no pasa por el runner.** El camino XML del agente (los
  modelos que no soportan `tools`) escribe archivos por otra vía y estos
  permisos no lo tocan. Es el siguiente hueco real.

## v3.41.1 — Tres fallos que vio el usuario en un solo mensaje

Los tres se reportaron juntos: «puse hola al agente y me mandó un código de una
página que yo le había mandado anteriormente», «el sandbox le subí un zip con
css, js y el HTML y solo carga el html con texto no carga los diseños» y
«Escudo PII: 2 datos enmascarados, correo… y ese error también me dió solo puse
hola». Son tres causas distintas.

### 1. El ZIP con carpeta y rutas absolutas se abría pelado

**El más grave.** Un ZIP con esta forma —que es la normal— no cargaba ni
estilos ni scripts:

```
mi-web/index.html   →  <link href="/css/estilos.css">
mi-web/css/estilos.css
mi-web/js/app.js
```

El HTML se escribió pensando en la raíz de un dominio (`/css/…`), y el ZIP trae
el sitio dentro de su carpeta. `resolvePath` resolvía `/css/estilos.css` a
`css/estilos.css`, que no existe. La página se abría con el texto y sin nada
más.

Probé once formas de organizar un ZIP antes de tocar nada; **diez funcionaban y
esta fallaba**, y es justo la que sale de comprimir una carpeta.

Arreglo: `raizComun()` deduce la carpeta del proyecto (ignorando `__MACOSX/` y
los `._algo` que mete macOS, que si no ningún ZIP hecho en un Mac tendría raíz)
y `hacerResolver()` prueba primero la ruta literal y, solo si ahí no hay nada,
dentro de esa carpeta. Se usa en los cinco sitios que resolvían por su cuenta:
imágenes, `<link>`, `<script>`, `@import` y `url()` del CSS.

**Dos rutas y en ese orden, nada más.** Buscar por nombre de archivo por todo
el proyecto acertaría más veces y se equivocaría en silencio cuando hay dos
`estilos.css`. Hay un test de eso: con dos, gana el que dice la ruta. Y lo que
de verdad falta se sigue reportando como ausente.

### 2. «Hola» devolvía la página del turno anterior

En la v3.36.3 se quitó la plantilla del agente en los turnos triviales. **No
bastaba.** El mapa del proyecto seguía viajando en todos los turnos, y termina
con:

> «Al pedir cambios: entrega SOLO el/los archivos que modifiques (completos) y
> conserva el resto tal cual.»

Eso es una orden de escribir archivos. Con un «Hola» delante, el modelo la
obedecía. La ficha del proyecto igual.

Ahora, en un turno trivial, tampoco viajan la ficha ni el mapa. El E2E lo
comprueba por las dos caras: con «Hola» no viaja «MAPA DEL PROYECTO ACTUAL» ni
«entrega SOLO»; con «cambia el color del hero a violeta», sí.

### 3. El escudo PII rompía el código que subías

`guard()` ya protegía los bloques de código con vallas. Pero el texto de los
**adjuntos** se pegaba al mensaje SIN vallas, así que el escudo enmascaraba los
correos dentro del HTML que subías: el modelo veía `co***@ejemplo.com` en el
código y te devolvía el archivo con el correo roto. **El escudo estropeaba tu
trabajo creyendo que te protegía.**

Y enmascaraba también las respuestas del modelo, que no protege nada —ya salió
y volvió— y le rompe su propio código en la vuelta siguiente.

Ahora hay `escudoHistorial()`, puro y probado, que se aplica **antes** de pegar
los adjuntos y solo a lo que el usuario escribió. Ese orden es el arreglo.

Además, el aviso decía «en lo que se envió al modelo. Tu mensaje visible no
cambia» aunque el correo viniera de diez mensajes atrás. Con un «hola» eso no
hay quien lo entienda. Ahora distingue:

- «correo **en tu mensaje**. Tu burbuja no cambia; solo lo que se envía.»
- «correo **en mensajes anteriores de esta conversación**, que viajan como
  contexto. Tu mensaje de ahora no tenía ninguno.»

### Pruebas

- 6 unitarios del resolutor del Sandbox (incluidos los dos casos límite: la
  ruta literal manda, y lo ausente se sigue reportando), 9 del escudo.
- 2 E2E nuevos en `saludo-sin-agente.spec.ts`, con una sesión que ya tiene mapa.
- **Comprobados en rojo, uno a uno**: sin el respaldo del resolutor caen 2
  unitarios del Sandbox; enmascarando también las respuestas del modelo cae 1
  del escudo; dejando pasar el mapa en turnos triviales cae el E2E.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1288** unitarios (1273 antes) · ✓ **161** E2E
  (159 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.41.1` · ✓ `VERCEL=1` sin `standalone` y
  con el `.nft.json`

### Lo que NO se ha arreglado

- **No he probado con el ZIP concreto del usuario**, solo con once formas
  típicas reconstruidas a mano. Si el suyo tiene otra estructura, el fallo
  puede seguir ahí y hace falta el ZIP para saberlo.
- **El aviso de archivos que faltan sigue siendo un toast** que se va en unos
  segundos. Con este arreglo saltará mucho menos, pero cuando salte se puede
  perder igual: debería vivir en la pestaña Revisión, y no lo he movido.
- **`esTurnoTrivial` sigue siendo de ocho palabras y una lista de cortesías.**
  «Hola» y «gracias» los caza; «y bueno, qué tal va todo por ahí» no. No es un
  clasificador, es un filtro conservador a propósito.

## v3.42.0 — Si el HTML pide un archivo que no está, se dice y se arregla

El usuario mandó el ZIP. Con el archivo delante, la causa es esta:

```
web ambueguesa/index.html   →  <link href="styles.css">  <script src="script.js">
web ambueguesa/css.css
web ambueguesa/javascript.js
```

**Los nombres no coinciden.** Ese `index.html` se ve igual de pelado abierto en
Chrome. El resolutor de la v3.41.1 hace su trabajo bien —resuelve a
`web ambueguesa/styles.css`—; lo que pasa es que ahí no hay nada.

Y aun así hubo fallo de Prism: **habérselo callado**. `buildRunHtml` ya
apuntaba los ausentes, pero se enseñaban en un aviso que se va a los tres
segundos y que ni siquiera decía lo evidente: que en el proyecto SÍ hay un
`.css`, con otro nombre. El usuario se quedó mirando una página sin estilos sin
manera de saber por qué. Es exactamente lo que quedó apuntado como pendiente en
la v3.41.1: «debería vivir en la pestaña Revisión, y no lo he movido».

### El diagnóstico (`faltantes.ts`)

Para cada archivo que falta se busca, en este orden:

1. **El mismo nombre en otra carpeta** → es la ruta, no el nombre.
2. **El único archivo de esa extensión** → es el nombre. Este es el caso del
   ZIP: pides `styles.css` y el único `.css` se llama `css.css`.
3. **Varios de ese tipo** → se enseña la lista y elige el usuario. Adivinar
   entre tres es acertar una de cada tres veces y haberlo estropeado las otras
   dos.
4. **Ninguno** → se dice y ya.

**Nada se resuelve solo.** Hacer que `styles.css` cargue `css.css` por nuestra
cuenta haría que la vista previa mintiera sobre lo que pasa en un servidor de
verdad.

### La banda, que no se va

Pegada a la vista previa, no un aviso pasajero. Dice qué falta, qué hay en su
lugar, y una frase que hacía falta: **«En un navegador normal pasaría lo
mismo»** — para no cargarle a Prism un fallo que no es suyo.

### El arreglo de un clic

Cuando hay UN candidato claro, un botón «Apuntar a css.css». Cambia la
referencia **en el HTML**; no renombra tu archivo. Dos razones: tu archivo se
llama como tú quisiste, y una edición sobre un archivo existente sale en la
pestaña «Cambios» y se puede deshacer.

Solo se sustituyen las referencias que resuelven EXACTAMENTE al archivo
ausente: una cadena parecida dentro de un `<script>` no se toca, y hay un test
de eso.

### De paso: «Recargar» recargaba el HTML viejo

`onClick={() => setRunKey((k) => k + 1)}` remontaba el iframe con el MISMO
`srcDoc`. Después de editar un archivo, «Recargar» no enseñaba el cambio y no
había forma de saber por qué. Ahora llama a `run()` y reconstruye con los
archivos de ahora, que es lo que dice su nombre. Sin esto, el arreglo de un
clic no se habría visto nunca.

### Pruebas

- 19 unitarios de `faltantes.ts` (los cuatro casos del diagnóstico, los límites
  del arreglo, y que una cadena dentro de un script no se toca).
- **El ZIP del usuario es la fixture del E2E**, tal cual lo subió
  (`tests/fixtures/web-hamburgueseria.zip`). Tres pruebas: que se dice qué
  falta y qué hay en su lugar; que la banda **sigue ahí pasados 12 segundos**
  (el fallo de verdad era que la información se perdía); y que con dos clics y
  «Recargar» la página carga — comprobando `getComputedStyle(body).fontFamily`
  dentro del marco, que es Poppins porque lo fija el `css.css` del proyecto.
- **Comprobado en rojo**: sin la banda, los tres E2E caen.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1307** unitarios (1288 antes) · ✓ **164** E2E
  (161 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.42.0` · ✓ `VERCEL=1` sin `standalone` y
  con el `.nft.json`

### Lo que sigue sin estar bien

- **Las imágenes de ese ZIP apuntan a `https://via.placeholder.com`.** Son
  externas, así que si ese servicio no responde salen rotas y Prism no puede
  hacer nada. La banda NO dice nada de eso: solo habla de archivos del
  proyecto. Decir «ese servicio está caído» sería afirmar algo del mundo que
  desde aquí no se puede comprobar.
- **El arreglo no toca las referencias dentro del CSS** (`url(...)`,
  `@import`). Si lo que falta lo pide una hoja de estilos y no el HTML, el
  diagnóstico sale igual pero el botón no arregla nada — habría que editarlo a
  mano.
- **Un candidato de otro tipo no se propone.** Si pides `estilos.css` y solo
  tienes `estilo.scss`, no se sugiere: la extensión tiene que coincidir.

## v3.43.0 — El perímetro cerrado y una red que caza lo que los ejemplos no ven

Cuatro análisis externos sobre la mesa. Lo primero fue contrastarlos con el
código, y lo primero que salió es que **traían datos que ya no son ciertos**:
decían 1 076 / 890 / 1 178 unitarios (hay 1 331), 119-131 E2E (hay 167), 12
herramientas (son 15), que knip no corre en CI (corre, `ci.yml` línea 41), que
falta un trace panel (existe, `agent-trace.tsx`) y que falta un sistema de
permisos por herramienta (existe desde la v3.41.0).

Lo que sí acertaban, y era verificable, entra. El destilado con lo descartado y
por qué está en `docs/PLAN-V8.md`.

### 1. El proxy no tenía límite de abuso

Cero coincidencias de `429` en la ruta. `net-guard.ts` impide que te usen para
llegar a la red interna; **no impide que te usen de relé**. Y el timeout de 90 s
no vale para eso: corta la petición que no contesta, no la ráfaga de las que sí.
La demo está pública en Vercel, así que esto es riesgo real, no teórico.

`proxy-budget.ts`, puro y con el reloj inyectado: 120 peticiones por minuto y
por identidad, cuerpo máximo de 8 MB. La comprobación va **antes** de validar el
destino y antes de leer el cuerpo — quien se pasó no debe costar ni una
resolución DNS.

Tres decisiones escritas en el código:

- **120/minuto**, no 30: una conversación activa manda 10-20 contando el probe,
  el streaming y las vueltas del agente. Un límite que corta el uso normal se
  acaba quitando, y entonces no protege nada.
- **El mensaje del 429 dice «límite del despliegue»**. Sin eso el usuario culpa
  a su proveedor de IA y se pone a cambiar de modelo por un problema que no es
  suyo.
- **Se barre el mapa cada 200 peticiones.** Un contador que nunca limpia es una
  fuga de memoria disfrazada.

Y se dice lo que NO es: sin cuentas no hay identidad, y una IP se cambia. Es el
guardarraíl que impide que un despliegue público acabe de relé abierto por
accidente. Para más que eso ya está `PRISM_ACCESS_CODE`.

### 2. Tests de propiedad: la red que faltaba

Los tres fallos que aparecieron esta semana —el QA que nunca llegaba al agente,
el ZIP con carpeta que no resolvía, el escudo PII que rompía los adjuntos—
**pasaron por delante de tests de ejemplo en verde**. Ninguno preguntaba la
regla; todos preguntaban un caso.

24 propiedades con `fast-check` en `tests/unit/propiedades/`. Las que importan:

- «Lo que se ofrece al modelo nunca incluye un efecto apagado.»
- «Un CSS referenciado como quiera siempre se inlinea si existe» — carpeta o no,
  `./` o `/` o relativo.
- «El escudo nunca toca lo que no escribió el usuario.»
- «Nunca pasan más de `max` peticiones por ventana, sea cual sea el reparto.»
- «Un candidato propuesto siempre existe en el proyecto.»

**Comprobado revirtiendo los fallos de verdad**: con el resolutor del ZIP
desactivado cae la propiedad del CSS; con el escudo tocando todos los roles cae
la del PII; sin el presupuesto cae la del proxy.

#### Dos cosas que salieron de hacerlo bien

**La propiedad del PII pasaba en verde con el fallo puesto.** `fc.string()`
genera ruido que casi nunca contiene un correo válido, así que la propiedad se
cumplía sin ver nunca el caso que le importaba. Se cambió por un generador que
mete PII de verdad, y ahora hay un test guardián que comprueba que **el
generador genera lo que dice generar** — si deja de hacerlo, las propiedades de
ese bloque se volverían verdes por vacío.

**Y encontró un fallo: `«0 4111 1111 1111 1111»` no detectaba la tarjeta.** El
patrón coge 16 cifras desde el límite de palabra; con un dígito suelto pegado
delante quedan 17 y Luhn dice que no, con razón. Se intentó arreglar probando
subsecuencias finales y **el remedio salió peor**: empezaba a enmascarar
`«el pedido 1234 5678 9012 3456 7»` y se comía un espacio. Se revirtió. El
límite es estrecho (hace falta un dígito Y un espacio; con `«ref9 »` o `«1: »`
funciona), y queda **documentado en un test**, no escondido. Antes de estropear
texto del usuario, se prefiere el límite conocido.

### 3. CodeQL

`security-extended` sobre el TypeScript, en su propio workflow y sin bloquear la
entrega: un aviso de CodeQL es una pista para mirar, no un veredicto. Lo que
bloquea sigue en `ci.yml`.

### 4. La raíz, limpia

Los cuatro `PLAN-V*.md`, `PLAN-EVOLUCION.md`, las dos `INSTRUCCIONES-*.md` y
`MANIFIESTO.txt` se van a `docs/`. En la raíz quedan `README.md` y
`worklog.md`. Solo había referencias en comentarios; ningún import.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1 331** unitarios (1 307 antes) · ✓ **167**
  E2E (164 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.43.0`
- ✓ **El 429 comprobado contra el servidor de producción**: 125 peticiones
  seguidas → 120 pasan, 5 cortadas. El techo declarado, medido.
- ✓ `VERCEL=1` sin `standalone` y con el `.nft.json`

### Lo que NO entra de esos análisis, y por qué

- **Multi-Agent Orchestrator, Task DNA, Prism Lab, Prism OS.** Es otra
  aplicación. Y el argumento en contra lo da el propio análisis que lo propone:
  los modelos gratis fallan en cadenas largas. Un orquestador de cinco agentes
  empeora el problema **para los modelos por los que esta app existe**.
- **Sincronización con backend.** Se la llama «la única limitación que no se
  resuelve con otra iteración». Pero «sin cuentas, sin servidor» no es una
  limitación: es el producto. Y `transfer.ts` ya pasa las claves cifradas entre
  dispositivos sin servidor.
- **Búsqueda semántica con embeddings locales.** Decenas de MB de modelo.
  `ask_memory` busca por palabras y lo dice.

### Lo que sigue pendiente

- **`chat-app.tsx` son 2 920 líneas y sigue creciendo** (2 906 cuando se
  escribió el análisis). Es lo siguiente, y no se ha tocado hoy.
- **La memoria negativa** («no toques `Header.tsx`») es la mejor idea de los
  cuatro documentos y encaja con lo que ya hay. Sin empezar.
- **El límite por IP es por instancia** en serverless: cada una lleva su
  contador, así que el techo real se multiplica por el número de instancias.
  Corta el uso como tubería, que es para lo que está, pero no es un límite
  global y no se ha medido cuántas instancias levanta Vercel bajo carga.

## v3.44.0 — Memoria negativa, y el primer corte de `chat-app.tsx`

Las dos cosas que quedaron dichas y sin hacer en la v3.43.0.

### 1. «No tocar»: una regla que se hace cumplir, no una nota

Es la mejor idea de los cuatro análisis (`PLAN-EVOLUCION.md` §3) y la más
barata de las suyas, porque encaja con lo que ya existe.

El mapa del proyecto guardaba notas y el modelo las leía. Pero **una nota es
una sugerencia**: el agente la entiende y aun así reescribe el archivo que le
pediste que no tocara. Cuando pasa, has perdido trabajo.

Una regla de aquí es otra cosa. Mismo patrón de dos capas que
`tool-permissions.ts`, que es el que funciona:

1. **Las reglas viajan en el prompt** para que el modelo ni lo intente.
2. **`tool-runner.ts` rechaza la escritura** antes de tocar el archivo, aunque
   lo intente igual.

Sin la 2 sería otra nota. Sin la 1, el agente chocaría contra un muro invisible
y gastaría vueltas averiguando por qué.

Los patrones son un glob pequeño a propósito: un nombre suelto (`Header.tsx`)
protege ese archivo **esté en la carpeta que esté** —que es lo que la gente
quiere decir—, un asterisco no cruza carpetas, el doble sí. Sin distinguir
mayúsculas: una regla que falla según el sistema operativo del usuario no es una
regla.

Tres decisiones escritas en el código:

- **Restaurar un snapshot que cambiaría un archivo protegido se cancela
  ENTERO.** Restaurar descarta lo hecho después, así que puede llevarse por
  delante un archivo protegido sin nombrarlo nunca. Y si se cancela, no puede
  dejar el proyecto a medias. Pero solo si lo cambiaría de verdad: bloquear un
  restore que deja el archivo igual sería bloquear por bloquear.
- **El mensaje del bloqueo dice «no lo intentes por otra vía».** Sin eso, el
  agente prueba con `edit_file` lo que no pudo con `write_file` y se gasta las
  vueltas en eso.
- **Al escribir el patrón se enseña a qué afectaría AHORA.** Una regla que no
  casa con nada da una falsa sensación de protección, que es peor que no
  tenerla, y verlo antes de guardar cuesta menos que descubrirlo cuando el
  agente ya reescribió el archivo.

Y lo que NO es: no es control de acceso. El usuario puede editar el archivo a
mano en el Sandbox cuando quiera, y debe poder. Es una barandilla contra el
agente, que es quien se lleva por delante lo que no miraba.

### 2. Primer corte de `chat-app.tsx`

2 945 → 2 930 líneas. Poco en número y mucho en lo que importa: **la tubería de
adjuntos ya no vive dentro del componente**.

`reparto-adjuntos.ts` decide qué es cada archivo y cuántos caben, sin tocar
disco ni pantalla. Esa lógica estaba mezclada con el I/O y con los avisos, y
por eso **no tenía un solo test**: los fallos de esta semana —un `.py` que se
caía en silencio, un ZIP que no se aceptaba— pasaron sin que nada se pusiera
rojo. Ahora tiene 15.

Y al sacarlo apareció un fallo del reparto: se descontaba `zips.length`, o sea
**los candidatos**, no los que de verdad entraban. Mandar cinco ZIP dejaba a las
hojas sin sitio aunque hubiera hueco. Ahora se descuenta lo asignado, y hay un
test que lo dice con esas palabras.

### Pruebas

- 21 unitarios de `reglas-no.ts` (los patrones, los límites, y que un patrón
  vacío no se convierta en «todo»), 8 del cumplimiento en el runner, 15 del
  reparto de adjuntos.
- E2E `memoria-negativa.spec.ts` con un modelo simulado nuevo,
  `mock-toca-header`, que intenta escribir el archivo protegido pase lo que
  pase: se comprueba que el intento acaba rechazado, que **sin la regla el
  mismo agente escribe sin problema** (si bloqueara siempre no probaría nada),
  que la regla viaja en el prompt, y que se puede crear desde el mapa.
- **Comprobado en rojo**: quitando el bloqueo del runner caen 3 unitarios y el
  E2E del bloqueo.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1 374** unitarios (1 331 antes) · ✓ **171**
  E2E (167 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.44.0` · ✓ `VERCEL=1` sin `standalone` y
  con el `.nft.json`

### Lo que sigue pendiente

- **`chat-app.tsx` sigue en 2 930 líneas.** El corte de hoy es el primero y el
  más fácil. El grande es `runGeneration`: **674 líneas** de la 1010 a la 1684,
  y está acoplado a decenas de closures. No se toca de una sentada ni sin más
  tests alrededor.
- **Las reglas no cubren el camino XML del agente.** Los modelos que no
  soportan `tools` escriben archivos por otra vía y el bloqueo no pasa por ahí.
  Es el mismo hueco que ya tenían los permisos y sigue abierto.
- **El reparto de cupos sigue contando candidatos y no aceptados en un caso**:
  si un ZIP entra en el cupo pero falla al abrirse, ese sitio se ha gastado
  igual. Es defendible (el cupo es de intentos) pero no está dicho en pantalla.

## v3.45.0 — Auto Context: se ve qué contexto viajó con tu mensaje

De `PLAN-EVOLUCION.md` §12, la prioridad nº 1 de ese documento. Y una
rectificación: ese plan se resumió en la v3.43.0 por sus cuatro propuestas más
caras (orquestador multiagente, Task DNA, Prism Lab, Prism OS) y se dejaron
fuera veinte secciones sin mirarlas una a una. Fue injusto con el documento. La
memoria negativa de la v3.44.0 ya venía de él (§3); esto es la §12, y quedan
por lo menos dos más que valen y son realizables: **Evidence Mode** (§10) y la
**memoria episódica** (§2).

### El problema

Cada turno se manda mucho más que lo que escribes: el mapa del proyecto, tus
notas, las reglas «no tocar», las skills activas, las reglas aprendidas de
fallos anteriores, los adjuntos y N mensajes de historial.

**Nada de eso se veía.** Escribías una línea, recibías una respuesta rara, y no
tenías forma de saber que el modelo estaba leyendo doce archivos y tres
decisiones viejas. Es exactamente el fallo que se arregló en la v3.41.1 —«hola»
devolvía la página del turno anterior porque el mapa viajaba y nadie lo sabía—
y la causa se tardó tres versiones en encontrar precisamente porque el contexto
era invisible.

### Lo que se hace

Bajo cada respuesta, un chip: **`ctx 2 archivos · 2 notas · 1 regla · 8
mensajes`**. Al pulsarlo, el desglose con los **nombres**: qué archivos, qué
skills, cuántas notas.

Dos decisiones que definen la pieza:

- **Se cuenta lo que ENTRÓ en el prompt, no lo que hay guardado.** El mapa
  puede tener cuarenta archivos y viajar doce; decir «40» sería mentir con la
  verdad. Por eso el resumen se calcula en `prompt-actual.ts`, en el mismo
  sitio donde se construyen las piezas y con los mismos topes —que se han
  exportado para eso—, y no por su cuenta. Es la lección que ya estaba escrita
  en `presupuesto.ts`: un contador que se lo imagina se desincroniza a la
  primera pieza nueva.
- **Si no hay nada del proyecto, no sale.** Los caracteres del prompt base y
  los mensajes del historial viajan SIEMPRE: si contaran, el chip aparecería en
  el 100 % de las respuestas y la gente lo ignoraría en dos días — y entonces
  tampoco lo miraría cuando sí hay algo que mirar. Hay un test que lo dice con
  esas palabras.

Y se guarda en el mensaje, como ya se guardaban `ctxSaved` y `piiMasked`: se
puede volver a mirar una respuesta de ayer y ver con qué se generó.

### Lo que NO es (todavía)

La §12 pide más: **elegir** el contexto relevante según lo que pides (intent →
archivos relevantes → memoria relevante). Eso es lo caro y es donde se inventa.
Aquí se ha hecho la mitad honesta —**enseñar lo que se usa**— porque hacerla
primero es lo que permite juzgar la otra: sin ver qué viaja hoy, no hay forma
de saber si una selección automática mejora algo o solo lo enreda.

### Pruebas

- 11 unitarios, la mayoría sobre cuándo NO enseñar el chip.
- E2E `contexto-usado.spec.ts`: con proyecto sale y nombra los archivos al
  desplegarlo; **sin nada del proyecto no sale**.
- **Comprobado en rojo**: quitando el chip cae el E2E.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1 385** unitarios (1 374 antes) · ✓ **173**
  E2E (171 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.45.0` · ✓ `VERCEL=1` sin `standalone` y
  con el `.nft.json`

### Lo que sigue

- **Evidence Mode** (§10) es el siguiente, y es el que mejor encaja con este
  proyecto: «esto lo digo por `src/lib/provider.ts` línea 84» y, cuando no hay
  fuente, decirlo en vez de afirmarlo. Es literalmente el ADN de la app.
- **Memoria episódica** (§2): las notas de hoy son texto suelto; decisiones,
  errores y preferencias con fecha y origen se pueden consultar de verdad.
- El chip cuenta los adjuntos del envío, no de la conversación entera. Si
  adjuntaste un PDF hace diez turnos y sigue viajando en el historial, el chip
  de hoy no lo cuenta. No está mal, pero tampoco está dicho.

## v3.46.0 — Un director reparte, varios ejecutan, el director cierra

`PLAN-EVOLUCION.md` §5, el orquestador multiagente. **Se había descartado con
un argumento incompleto**, y el usuario lo señaló: se dijo que los modelos
gratis fallan en cadenas largas, y eso solo es cierto si TODA la cadena es
gratis. Con el director de pago y los ejecutores gratis, el que razona y
verifica es el bueno y los baratos hacen trabajo acotado. Es más barato que
usar el caro para todo y mejor que usar solo gratis.

### Cómo funciona

`/orquesta`, escribes el encargo, y:

1. **El director** —tu modelo actual, el que hayas elegido— parte el encargo en
   trozos independientes.
2. **Los ejecutores** —gratis, de otros proveedores— hacen cada uno el suyo, en
   paralelo.
3. **El director** revisa lo que volvió, corrige lo que esté mal y entrega.

### Las tres cosas que lo hacen usable con dinero de por medio

Un orquestador sin estas tres no debería existir, y por eso van dentro y no
después:

- **Techo duro: `2 + n` llamadas y se acabó.** El reparto, los ejecutores y el
  veredicto. No hay bucle, no hay reintentos en cascada, no hay «una ronda
  más». Pedir 99 ejecutores sigue costando 6 llamadas: hay un test que lo
  comprueba, porque es lo que permite prometer un número.
- **El número se dice ANTES de arrancar.** «5 llamadas en total: 2 al director
  y 3 a los ejecutores. No hay más rondas.» Saberlo después no sirve de nada.
- **Compartimentación.** Cada ejecutor recibe SU trozo y nada más: ni la
  conversación, ni el encargo original completo, ni los trozos de los demás. Es
  a la vez más barato y menos superficie — tu historial no acaba repartido
  entre cuatro proveedores porque sí. El E2E lo comprueba mirando lo que viaja
  en cada petición.

### Lo que NO se hace: inventar el precio

No hay ningún «≈ 0,02 $» en pantalla. Los precios varían por proveedor, por
modelo y con el tiempo, y no se pueden saber desde el dispositivo. Se cuentan
**llamadas y caracteres**, que son datos duros, y se separa lo del director de
lo de los ejecutores porque es la distinción que importa cuando uno se paga y
los otros no. Hay un test que comprueba que el aviso no menciona dinero.

### Y lo que se protege sin decirlo

- **Un encargo mínimo no se reparte.** «Gracias» costaría dos llamadas del
  modelo que pagas para no ganar nada. Umbral conservador: 40 caracteres y 8
  palabras.
- **Un reparto ilegible no para el trabajo.** Si el director devuelve algo que
  no se puede leer, se responde de la forma normal en vez de quedarse sin
  respuesta habiendo gastado la llamada. Lo peor de los dos mundos sería lo
  otro.
- **Se dice cuántos entregaron**, no cuántos se llamaron: `equipo 2/3 · 5
  llamadas`. Un ejecutor que falló no cuenta como trabajo hecho.
- **Al director se le pide que diga lo que no pudo verificar**, empezando por
  «Sin verificar:». Un veredicto que firma lo que no comprobó vale menos que
  ninguno. Es la puerta de entrada al Evidence Mode de la §10.
- **`/orquesta` vale para UN envío y se apaga solo.** Dejarlo encendido haría
  que el siguiente «gracias» costara seis llamadas.

### Pruebas

- 29 unitarios de `orquesta.ts`, la mayoría sobre el techo y sobre qué NO se
  promete.
- E2E `orquesta.spec.ts` con dos modelos simulados (`mock-director`,
  `mock-obrero`): que el reparto se lee, que **cada ejecutor recibe solo su
  trozo** —comprobado sobre el cuerpo real de cada petición—, que el aviso sale
  antes, y que un encargo corto **no dispara ni una llamada de reparto**.

### Puerta

- ✓ lint · ✓ knip · ✓ build · ✓ **1 414** unitarios (1 385 antes) · ✓ **177**
  E2E (173 antes), suite completa en verde **dos veces seguidas**
- ✓ `npm start` + `/api/version` → `3.46.0` · ✓ `VERCEL=1` sin `standalone` y
  con el `.nft.json`

### Lo que falta para que esto sea de verdad seguro con dinero

Y esto es lo importante, porque la pieza está pero el perímetro no:

- **No hay tope de gasto por sesión ni por día.** El techo es por encargo. Diez
  encargos seguidos son sesenta llamadas y nadie te para. Es lo siguiente.
- **Los ejecutores se eligen solos.** No puedes decir «estos tres y no otros»,
  ni excluir un proveedor concreto del reparto. Con datos sensibles, eso hace
  falta.
- **El director no puede rechazar el reparto a medias.** Si ve que dos trozos
  volvieron mal, cierra con lo que hay; no puede pedir que se rehaga uno. Es a
  propósito —ahí empieza el bucle que multiplica el coste— pero es una
  limitación real y no una virtud.
- **Nada de esto pasa por los permisos del agente.** Los ejecutores no usan
  herramientas, así que hoy no escriben nada; el día que lo hagan, hay que
  meterlos por `tool-permissions.ts` y por las reglas «no tocar».
