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
