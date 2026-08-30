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
