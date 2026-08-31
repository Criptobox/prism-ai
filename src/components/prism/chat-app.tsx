"use client";
/** Prism AI — App principal: chat + vista previa en vivo + agente con bucles + mapa del proyecto
 * + Arena A/B, modo imagen, documentos (PDF), atajos de teclado, bóveda PIN y lista virtualizada. */

/** Cuántas veces puede saltar de modelo una MISMA respuesta.
 * Antes el salto se contaba siempre como el primero y los guardas de
 * `depth === 0` bloqueaban el segundo: bastaba con que el modelo de repuesto
 * también fallara —lo normal entre los gratis— para que todo se parara. */
const MAX_SALTOS = 4;

/** Cuántas veces se retoma SOLO un trabajo del agente que se quedó a medias.
 * Con tope, porque un modelo que no sabe cerrar el bucle seguiría dando
 * vueltas y gastando cuota. Agotado el tope queda el botón «Continuar». */
const MAX_CONTINUACIONES = 2;

/** Cuántas veces se pide la continuación de un código cortado por longitud.
 * Una web entera puede necesitar dos o tres trozos; más que eso ya es un
 * modelo con el techo de salida demasiado bajo para la tarea. */
const MAX_TROZOS = 3;

/** Lo que un modelo caído le pasa al que lo sustituye.
 *
 * `attemptFailover` borraba la respuesta a medias y el modelo nuevo empezaba
 * de cero. Con esto la recoge y sigue desde donde se quedó, en la MISMA
 * burbuja — que es lo que hace que el bloque de código no acabe partido. */
interface SemillaFailover {
  /** la burbuja que se conserva, en vez de crear otra */
  assistantId: string;
  /** lo que llegó a escribir el modelo caído */
  previo: string;
  /** dónde se quedó, para pedir el empalme exacto */
  corte: CorteInfo;
}

/** Caracteres mínimos para que valga la pena rescatar un trabajo a medias.
 * Por debajo de esto (un saludo, media frase) reiniciar sale más limpio que
 * empalmar. */
const MIN_RESCATE = 200;

/** Mensajes de historial que deja pasar el modo ahorro. De fábrica son 40, y
 * en una conversación larga el historial pesa mucho más que las instrucciones:
 * recortarlo es lo que de verdad baja la cuenta. */
const VENTANA_AHORRO = 12;

/** Cómo se llama cada forma de quedarse a medias en la memoria de fallos. */
const MOTIVO_PARADA: Record<string, string> = {
  "revision-pendiente": "revisión sin corregir",
  "sin-respuesta": "sin cerrar <answer>",
  cortado: "respuesta cortada a mitad de una etiqueta",
};
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileDown,
  FileText,
  Globe,
  Maximize2,
  Menu,
  Minimize2,
  ScrollText,
  Settings,
  Zap,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sidebar } from "./sidebar";
import { ChatInput } from "./chat-input";
import { MessageItem } from "./message";
import { ModelPicker } from "./model-picker";
import { SettingsDialog } from "./settings-dialog";
import { PromptLibrary } from "./prompt-library";
import { SkillsDialog } from "./skills-dialog";
import { FreeRadarDialog } from "./free-radar";
import { GitHubDialog } from "./github-dialog";
import { RepoStudioDialog } from "./repo-dialog";
import { SandboxStudio } from "./sandbox-studio";
import type { PublishSeed, SandboxSeed } from "@/lib/prism/sandbox";
import { OnboardingDialog } from "./onboarding";
import { PreviewPanel } from "./preview-panel";
import { PANTALLA_ESTRECHA, useMediaQuery } from "@/lib/prism/use-media-query";
import {
  estadoPanel,
  necesitaSintesis,
  pickPanel,
  pickSintetizador,
  synthesisPrompt,
  type Panelista,
  type RespuestaPanel,
} from "@/lib/prism/consensus";
import { Welcome } from "./welcome";
import { registerServiceWorker } from "./pwa";
import { BannerVersionNueva } from "./app-update";
import { PrismLogo } from "./logo";
import { ModelArenaDialog } from "./model-arena";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { UsagePanel } from "./usage-panel";
import { QuotaPanel } from "./quota-panel";
import { FailuresPanel } from "./failures-panel";
import { VaultLockDialog } from "./vault-lock";
import { usePrism, uid } from "@/lib/prism/store";
import { migrateLegacyAttachments, deleteBlob } from "@/lib/prism/attachment-blob";
import { useAgentTools } from "@/lib/prism/use-agent-tools";
import { textoDeModos } from "@/lib/prism/agent-modes";
import { skillsSugeridas, textoSugerencia } from "@/lib/prism/skills-sugeridas";
import { anchorAt } from "@/lib/prism/branches";
import { ThreadBar } from "./thread-bar";
import { streamChat } from "@/lib/prism/chat-client";
import { fileToAttachment } from "@/lib/prism/attachments";
import { extractPreviewHtml } from "@/lib/prism/preview";
import {
  DEMO_MODEL,
  DEMO_PROMPT,
  DEMO_TITLE,
  decideDemo,
  demoReply,
  typeDemoReply,
} from "@/lib/prism/preview-demo";
import { construirPrompt, type EntradaPrompt } from "@/lib/prism/presupuesto";
import { estaCortadaPorLongitud, type MotivoParada } from "@/lib/prism/finish-reason";
import {
  hayBotonesQueCorregir,
  promptDeBotones,
  reglaDeBotones,
  resumenBotones,
} from "@/lib/prism/prueba-botones";
import {
  hayQueCorregir,
  promptDeCorreccion,
  proyectoDeLaRespuesta,
  reglaDeFallo,
  resumenRevision,
  MAX_REVISIONES,
} from "@/lib/prism/auto-revision";
import { runProjectInMemory } from "@/lib/prism/sandbox-runner";
import {
  decidirTrasCuotaEnTexto,
  decidirTrasError,
  decidirTrasVacio,
} from "@/lib/prism/decisiones";
import { entradaPromptActual } from "@/lib/prism/prompt-actual";
import {
  continuarCodigoPrompt,
  respuestaCortada,
  unirContinuacion,
  type CorteInfo,
} from "@/lib/prism/continuar";
import {
  agentPrompt,
  agentStalled,
  continuePrompt,
  parseAgentTrace,
  suggestAgentMode,
} from "@/lib/prism/agent-loop";
import { applyAccent } from "@/lib/prism/accent";
import {
  downloadSessionHtml,
  downloadSessionMarkdown,
  printSessionPdf,
} from "@/lib/prism/export-chat";
import { speak, stopSpeaking } from "@/lib/prism/speech";
import { splitThinkTags } from "@/lib/prism/thinking";
import { buildImageUrl, preloadImage } from "@/lib/prism/images";
import { extractPdfText } from "@/lib/prism/pdf";
import { isSheetFile, readSheetFile } from "@/lib/prism/sheets";
import { recapPrompt, translatePrompt, type TargetLang } from "@/lib/prism/recap";
import { useFocusMode } from "@/lib/prism/focus-mode";
import type { SlashCommand } from "@/lib/prism/slash";
import { initVault, useVault } from "@/lib/prism/vault";
import {
  addNote as addMapNote,
  deriveProjectMap,
  deriveMapFromMessages,
  mergeProjectMap,
  parseMapJson,
  removeNote as removeMapNote,
  renderMapForPrompt,
  withHistory,
} from "@/lib/prism/project-map";
import { buildPassport, renderPassportForPrompt } from "@/lib/prism/passport";
import {
  analyzeSkillPermissions,
  renderPermisosPrompt,
} from "@/lib/prism/skill-permissions";
import {
  splitModelKey,
  makeModelKey,
  isAutoKey,
  AUTO_MODEL_KEY,
  pickManualModel,
  type Attachment,
  type DocText,
  type ProviderId,
} from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { isQuotaError, pickFailoverCandidate } from "@/lib/prism/free-models";
import {
  buildTaskChain,
  classifyTask,
  lastUserPrompt,
  pickTaskFailover,
} from "@/lib/prism/task-router";
import { useHealth, cooldownRemaining, providerCooldownRemaining, statusFromError, retryAfterFromError } from "@/lib/prism/health";
import { resumenCuota, tonoCuota, useQuota } from "@/lib/prism/quota";
import { reglasActivas, useFailures } from "@/lib/prism/failures";
import { useUsage } from "@/lib/prism/usage";
import { compressHistory, savingsPercent, type CompressionMode } from "@/lib/prism/compress";
import { maskPII, PII_LABELS } from "@/lib/prism/pii";
import { unseenRadarCount } from "@/lib/prism/free-radar";
import { extractRepoFromText, isMostlyRepoLink } from "@/lib/prism/repo-cloud";
import { cn } from "@/lib/utils";

export function ChatApp() {
  // hidratación
  const hydrated = usePrism((s) => s.hydrated);

  const sessions = usePrism((s) => s.sessions);
  const activeId = usePrism((s) => s.activeSessionId);
  const providers = usePrism((s) => s.providers);
  const settings = usePrism((s) => s.settings);

  const ensureSession = usePrism((s) => s.ensureSession);
  const branchFrom = usePrism((s) => s.branchFrom);
  const startThread = usePrism((s) => s.startThread);
  const switchThread = usePrism((s) => s.switchThread);
  const removeThread = usePrism((s) => s.removeThread);
  const renameThread = usePrism((s) => s.renameThread);
  const switchBranch = usePrism((s) => s.switchBranch);
  const createSession = usePrism((s) => s.createSession);
  const renameSession = usePrism((s) => s.renameSession);
  const setActiveSession = usePrism((s) => s.setActiveSession);
  const addMessage = usePrism((s) => s.addMessage);
  const updateMessage = usePrism((s) => s.updateMessage);
  const deleteMessage = usePrism((s) => s.deleteMessage);
  const truncateAfter = usePrism((s) => s.truncateAfter);
  const clearMessages = usePrism((s) => s.clearMessages);
  const setProjectMap = usePrism((s) => s.setProjectMap);
  const setSettings = usePrism((s) => s.setSettings);

  const [input, setInput] = useState("");
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** la sugerencia del modo agente se ofrece una vez por sesión de uso */
  const [agentSugerido, setAgentSugerido] = useState(false);
  /** Skills ya propuestas en esta pestaña. En una ref y no en el estado: solo
   * sirve para no repetirse, y no tiene que repintar nada. */
  const skillsPropuestas = useRef<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [reposOpen, setReposOpen] = useState(false);
  const [repoSeedUrl, setRepoSeedUrl] = useState<string | null>(null);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [sandboxInitial, setSandboxInitial] = useState<SandboxSeed | null>(null);
  const [githubInitial, setGithubInitial] = useState<PublishSeed | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [focusProvider, setFocusProvider] = useState<ProviderId | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [failuresOpen, setFailuresOpen] = useState(false);
  /** modo foco (zen): solo la conversación, recordado entre sesiones */
  const [focusMode, toggleFocusMode] = useFocusMode();

  // adjuntos del borrador actual
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [docs, setDocs] = useState<DocText[]>([]);
  const [attaching, setAttaching] = useState(false);

  // Hook del bucle de tools del agente (PLAN-V4 punto 5): encapsula
  // el probe de tools + el bucle de tool_calls + la reinyección.
  const { runWithTools } = useAgentTools();

  // bóveda de claves (PIN)
  const vaultEnabled = useVault((s) => s.enabled);
  const vaultUnlocked = useVault((s) => s.unlocked);

  /* En el móvil la vista previa NO parte la pantalla.
   *
   * `ResizablePanelGroup` no miraba el ancho: en 390 px dejaba el chat y la
   * página generada en unos 195 px cada uno, con todo apretujado y sin poder
   * ver bien ninguno de los dos. Ahí el chat se queda entero y la vista previa
   * se abre a pantalla completa desde el botón de la cabecera. */
  const estrecha = useMediaQuery(PANTALLA_ESTRECHA);
  // Novedades del radar sin ver: la insignia del botón del menú en el móvil.
  const radarSeenIds = usePrism((st) => st.radarSeenIds);
  const radarPendientes = unseenRadarCount(radarSeenIds);

  // vista previa
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const autoOpenedForRef = useRef<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const demoCancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** Evita un doble Enter / doble toque; no bloquea repetir el mismo texto más tarde. */
  const lastSendAtRef = useRef(0);
  /** referencia fresca a runGeneration para reintentos de failover (evita dependencia circular) */
  const runGenRef = useRef<
    | ((
        sessionId: string,
        depth?: number,
        continuaciones?: number,
        semilla?: SemillaFailover,
        revisiones?: number
      ) => Promise<void>)
    | null
  >(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  const modelKey = activeSession?.modelKey ?? settings.defaultModelKey;

  const setModelKey = useCallback((key: string | null) => {
    const state = usePrism.getState();
    const current =
      (state.activeSessionId
        ? state.sessions.find((s) => s.id === state.activeSessionId)?.modelKey
        : undefined) ?? state.settings.defaultModelKey;
    const patch: { defaultModelKey: string | null; lastManualModelKey?: string | null } = {
      defaultModelKey: key,
    };
    if (isAutoKey(key) && current && !isAutoKey(current)) {
      patch.lastManualModelKey = current;
    }
    if (state.activeSessionId) {
      const sid = state.activeSessionId;
      usePrism.setState((st) => ({
        sessions: st.sessions.map((x) => (x.id === sid ? { ...x, modelKey: key } : x)),
      }));
    }
    state.setSettings(patch);
  }, []);

  // Registrar SW al montar + arrancar la bóveda (desbloqueo silencioso si toca)
  useEffect(() => {
    registerServiceWorker();
    initVault();
  }, []);

  // Migración tolerante de adjuntos viejos: en sesiones creadas antes de la
  // v3.14, los `dataUrl` viven todavía dentro del store (en localStorage).
  // Aquí los pasamos a IndexedDB, sustituyéndolos por `blobId`. Si IDB falla
  // o la cuota de localStorage se agota, los adjuntos se quedan como estaban
  // — no se pierde nada. Idempotente: correrlo otra vez no hace nada.
  // El detalle de «no he podido comprobar X» del INSTRUCCIONESIA: si la
  // migración se queda a medias, la siguiente vez que se monta la app
  // vuelve a intentarlo con los que faltan.
  useEffect(() => {
    if (!hydrated) return;
    void migrateLegacyAttachments();
  }, [hydrated]);

  // Share Target (PLAN-V4 punto 4): cuando una app externa comparte
  // texto con Prism (PWA instalada), el navegador POSTea al action del
  // share_target del manifest. El handler en `src/app/route.ts` guarda
  // el contenido en una cookie efímera `prism-share` y redirige a
  // `/?shared=1`. Aquí la leemos en mount, la volcamos en el input y la
  // borramos. Si no hay cookie, no pasa nada.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("prism-share="));
      if (!raw) return;
      const contenido = decodeURIComponent(raw.slice("prism-share=".length));
      if (!contenido) return;
      setInput(contenido);
      // Borra la cookie: es de un solo uso.
      document.cookie = "prism-share=; path=/; max-age=0; SameSite=Lax";
      // Avisa al usuario de dónde viene el texto.
      toast.info("Texto compartido cargado", {
        description: "Revísalo y pulsa Enviar cuando esté listo.",
        duration: 5000,
      });
    } catch {
      /* cookie ilegible: se ignora */
    }
  }, [hydrated]);

  // Tema de acento: aplica el elegido en Ajustes → Apariencia
  useEffect(() => {
    if (!hydrated) return;
    applyAccent(settings.accent, settings.accentCustom);
  }, [hydrated, settings.accent, settings.accentCustom]);

  // El radar no avisa con nada flotante. Antes salía un aviso a los 2,5 s que
  // se plantaba encima de la cabecera de lo que acabaras de abrir, y decía lo
  // mismo que la insignia numérica del Radar. Ahora solo está la insignia: en
  // pantalla grande sobre el botón del pie, y en el móvil sobre el botón del
  // menú, que es lo único que se ve con la barra lateral escondida.

  // Guía inicial: se abre sola en la primera visita
  useEffect(() => {
    if (!hydrated) return;
    if (usePrism.getState().onboardingDone) return;
    const t = setTimeout(() => {
      if (!usePrism.getState().onboardingDone) setOnboardingOpen(true);
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated]);

  // Demo de vista previa: escribe una landing. En escritorio el split se abre
  // en vivo; en el móvil el chat se queda entero y, al terminar, sale el botón.
  // Si ya terminó una vez, solo la reabre. ?demo=preview la vuelve a escribir.
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(location.search);
    const force = params.get("demo") === "preview" || params.get("demo") === "1";
    if (force) history.replaceState(null, "", location.pathname);

    const st = usePrism.getState();
    // La conversación del demo se reconoce por la marca de su mensaje, no por
    // el título: al enviarse, la conversación se retitula sola con el primer
    // mensaje del usuario y deja de llamarse DEMO_TITLE.
    const existing = st.sessions.find((s) =>
      s.messages.some((m) => m.role === "assistant" && m.model === DEMO_MODEL)
    );
    let already = false;
    try {
      already = localStorage.getItem("prism-preview-demo") === "1";
    } catch {
      /* almacenamiento bloqueado: se trata como no vista */
    }

    const decision = decideDemo({
      forzado: force,
      yaVista: already,
      hayDemo: !!existing,
      // cualquier cosa del usuario: conversaciones suyas o un proveedor puesto
      usuarioConDatos:
        st.sessions.some((s) => s.id !== existing?.id && s.messages.length > 0) ||
        Object.values(st.providers).some((p) => p.enabled),
    });

    if (decision === "nada") return;
    if (decision === "abrir") {
      if (existing) st.setActiveSession(existing.id);
      return;
    }

    st.setOnboardingDone(true);
    setOnboardingOpen(false);

    let sessionId: string;
    if (existing) {
      clearMessages(existing.id);
      st.setActiveSession(existing.id);
      sessionId = existing.id;
    } else {
      createSession();
      sessionId = usePrism.getState().ensureSession();
      renameSession(sessionId, DEMO_TITLE);
    }

    addMessage(sessionId, {
      id: uid(),
      role: "user",
      content: DEMO_PROMPT,
      createdAt: Date.now(),
    });
    const assistantId = uid();
    addMessage(sessionId, {
      id: assistantId,
      role: "assistant",
      content: "",
      model: DEMO_MODEL,
      createdAt: Date.now(),
    });
    setStreamingMsgId(assistantId);
    stickToBottomRef.current = true;

    const startedAt = Date.now();
    const full = demoReply();
    let finished = false;
    const cancel = typeDemoReply(
      full,
      (soFar) => {
        updateMessage(sessionId, assistantId, { content: soFar });
      },
      () => {
        finished = true;
        try {
          localStorage.setItem("prism-preview-demo", "1");
        } catch {
          /* ignore */
        }
        updateMessage(sessionId, assistantId, { elapsedMs: Date.now() - startedAt });
        setStreamingMsgId(null);
        demoCancelRef.current = null;
      }
    );
    demoCancelRef.current = cancel;
    return () => {
      cancel();
      demoCancelRef.current = null;
      if (!finished) setStreamingMsgId(null);
    };
  }, [hydrated, createSession, renameSession, addMessage, updateMessage, clearMessages]);

  // Atajo: acción=nueva desde el manifest
  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "new") {
      createSession();
      history.replaceState(null, "", "/");
    }
  }, [createSession]);

  // Auto-scroll
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [activeSession?.messages, streamingMsgId]);

  // ——— Vista previa en vivo: busca HTML en la última respuesta ———
  const previewMsg = useMemo(() => {
    if (!activeSession) return null;
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      const m = activeSession.messages[i];
      if (m.role === "assistant" && !m.error && extractPreviewHtml(m.content)) return m;
    }
    return null;
  }, [activeSession]);

  const previewCode = useMemo(
    () => extractPreviewHtml(previewMsg?.content ?? null),
    [previewMsg]
  );
  const previewStreaming = !!streamingMsgId && streamingMsgId === previewMsg?.id;
  /** En el móvil el botón de «ver cómo va» solo sale cuando YA terminó de escribir. */
  const mobilePreviewReady = !!previewCode && !previewStreaming && !focusMode;

  // auto-abrir el split de escritorio al aparecer HTML nuevo; cerrar si ya no hay.
  // En el móvil NO se abre sola: taparía el chat mientras el modelo escribe.
  useEffect(() => {
    if (previewMsg && previewMsg.id !== autoOpenedForRef.current) {
      autoOpenedForRef.current = previewMsg.id;
      // En modo foco el split NO se abre solo: para eso se pidió el modo zen.
      if (!focusMode) setPreviewOpen(true);
    }
    if (!previewMsg) setPreviewOpen(false);
  }, [previewMsg, focusMode]);

  // Si pide un cambio, se cierra la hoja del móvil para que vea el chat otra vez.
  useEffect(() => {
    if (streamingMsgId && estrecha) setMobilePreviewOpen(false);
  }, [streamingMsgId, estrecha]);

  // ——— Adjuntos (imágenes) y documentos (PDF/TXT) ———
  const attachFiles = useCallback(
    async (files: File[]) => {
      setAttaching(true);
      try {
        const images = files.filter((f) => f.type.startsWith("image/"));
        const sheets = files.filter((f) => !f.type.startsWith("image/") && isSheetFile(f.name, f.type));
        const documents = files.filter(
          (f) =>
            !isSheetFile(f.name, f.type) &&
            (f.type === "application/pdf" || f.type === "text/plain" || /\.(txt|md)$/i.test(f.name))
        );

        // documentos y hojas de cálculo comparten cupo: son todos «texto adjunto»
        const docRoom = Math.max(0, 3 - docs.length);
        // hojas de cálculo: se parsean EN LOCAL y llegan al modelo como tabla markdown
        for (const f of sheets.slice(0, docRoom)) {
          try {
            const { text } = await readSheetFile(f);
            if (!text.trim()) throw new Error("La hoja no tiene datos legibles");
            setDocs((cur) =>
              cur.some((d) => d.name === f.name)
                ? cur
                : [...cur, { id: uid(), name: f.name, text, chars: text.length }]
            );
            toast.success(`«${f.name}» leído en tu dispositivo`, {
              description: "Va al modelo como tabla markdown. El archivo no sale de aquí.",
            });
          } catch (e) {
            toast.error(`No se pudo leer «${f.name}»`, {
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // documentos: extrae el texto localmente (pdf.js / texto plano)
        for (const f of documents.slice(0, Math.max(0, docRoom - sheets.length))) {
          try {
            const text = f.type === "application/pdf" ? await extractPdfText(f) : (await f.text()).slice(0, 120_000);
            if (!text.trim()) throw new Error("No se pudo extraer texto");
            setDocs((cur) =>
              cur.some((d) => d.name === f.name)
                ? cur
                : [...cur, { id: uid(), name: f.name, text, chars: text.length }]
            );
            toast.success(`«${f.name}» listo (${text.length.toLocaleString("es")} caracteres)`);
          } catch (e) {
            toast.error(`No se pudo leer «${f.name}»`, {
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }
        if (documents.length + sheets.length > docRoom) {
          toast.info(`Máximo 3 documentos u hojas por mensaje`);
        }

        // imágenes: comprime y adjunta
        const room = Math.max(0, 6 - attachments.length);
        if (images.length && room === 0) {
          toast.error("Máximo 6 imágenes por mensaje");
        }
        const converted: Attachment[] = [];
        for (const f of images.slice(0, room)) {
          try {
            converted.push(await fileToAttachment(f));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo adjuntar la imagen");
          }
        }
        if (converted.length) setAttachments((cur) => [...cur, ...converted]);
      } finally {
        setAttaching(false);
      }
    },
    [attachments.length, docs.length]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((cur) => {
      // Si el adjunto todavía no se ha enviado, su binario ya está escrito en
      // IndexedDB (lo hizo `fileToAttachment` al crearlo). Aquí lo borramos
      // para no dejar un huérfano ocupando espacio. Fire-and-forget: si IDB
      // falla, no es crítico — el usuario puede purgar con «Borrar todos».
      const removed = cur.find((a) => a.id === id);
      if (removed?.blobId) void deleteBlob(removed.blobId);
      return cur.filter((a) => a.id !== id);
    });
  }, []);

  const removeDoc = useCallback((id: string) => {
    setDocs((cur) => cur.filter((d) => d.id !== id));
  }, []);

  /** Resuelve y valida el modelo actual (acepta clave fresca del store para reintentos) */
  const resolveModel = useCallback(
    (keyOverride?: string): {
      providerId: ProviderId;
      modelId: string;
    } | null => {
      const key = keyOverride ?? modelKey;
      if (!key) return null;
      const split = splitModelKey(key);
      if (!split) return null;
      const cfg = providers[split.providerId];
      const def = PROVIDER_MAP[split.providerId];
      if (!cfg || !def) return null;
      if (!cfg.apiKey.trim() && !def.keyless) {
        toast.error(`${def.name} necesita tu API key`, {
          description: "Ábrela en Ajustes → Proveedores.",
          action: {
            label: "Abrir",
            onClick: () => {
              setFocusProvider(split.providerId);
              setSettingsOpen(true);
            },
          },
        });
        return null;
      }
      return split;
    },
    [modelKey, providers]
  );

  /** Las piezas del prompt, tal y como están ahora. Vive en
   * `prompt-actual.ts` porque el medidor de Ajustes necesita exactamente lo
   * mismo: si cada uno se lo montara aparte, el medidor enseñaría un número
   * distinto del que viaja de verdad. */
  const piezasDelPrompt = useCallback(
    (sessionId?: string): EntradaPrompt => entradaPromptActual(sessionId),
    []
  );

  /** Instrucciones finales, ya montadas. */
  const composeSettings = useCallback(
    (sessionId?: string) => {
      const st = usePrism.getState();
      const { prompt } = construirPrompt(piezasDelPrompt(sessionId));
      // El ahorro también recorta lo que ENTRA: el historial es casi siempre
      // más gordo que las instrucciones (40 mensajes de fábrica), así que
      // limitarlo es lo que de verdad baja la cuenta.
      const contextWindow =
        st.settings.ahorro && (st.settings.contextWindow === 0 || st.settings.contextWindow > VENTANA_AHORRO)
          ? VENTANA_AHORRO
          : st.settings.contextWindow;
      return { ...st.settings, systemPrompt: prompt, contextWindow };
    },
    [piezasDelPrompt]
  );

  /** Tras cada respuesta: refresca el mapa del proyecto (memoria compacta).
   * Prioridad: <project-map> emitido por el modelo > derivación local del HTML. */
  const updateProjectMap = useCallback(
    (sessionId: string, content: string) => {
      try {
        const st = usePrism.getState();
        const session = st.sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const prev = session.projectMap ?? null;
        const trace = parseAgentTrace(content);
        const modelMap = trace.mapJson ? parseMapJson(trace.mapJson) : null;
        let map = deriveProjectMap(content, prev);
        if (modelMap) map = mergeProjectMap(map, modelMap);
        if (map && (map.files.length || map.features.length)) {
          // historial estilo Obsidian: instantánea del estado previo si cambió algo
          setProjectMap(sessionId, withHistory(prev, map));
        }
      } catch {
        /* el mapa es best-effort: nunca rompe el chat */
      }
    },
    [setProjectMap]
  );

  /** Notas de memoria del mapa (estilo Obsidian): decisión del usuario que la IA respeta */
  const addProjectNote = useCallback(
    (sessionId: string, text: string) => {
      const st = usePrism.getState();
      const session = st.sessions.find((s) => s.id === sessionId);
      if (!session?.projectMap) return;
      setProjectMap(sessionId, addMapNote(session.projectMap, text));
    },
    [setProjectMap]
  );

  const removeProjectNote = useCallback(
    (sessionId: string, index: number) => {
      const st = usePrism.getState();
      const session = st.sessions.find((s) => s.id === sessionId);
      if (!session?.projectMap) return;
      setProjectMap(sessionId, removeMapNote(session.projectMap, index));
    },
    [setProjectMap]
  );

  /** Restaura una versión del historial del mapa (conserva la línea temporal) */
  const restoreMapSnapshot = useCallback(
    (sessionId: string, index: number) => {
      const st = usePrism.getState();
      const session = st.sessions.find((s) => s.id === sessionId);
      const snap = session?.projectMap?.history?.[index];
      if (!session || !snap) return;
      setProjectMap(sessionId, {
        name: snap.name,
        description: snap.description,
        files: snap.files,
        features: snap.features,
        notes: snap.notes,
        history: session.projectMap?.history,
        updatedAt: Date.now(),
      });
    },
    [setProjectMap]
  );
  /** Arranca otra generación DESPUÉS de que la actual termine de recogerse.
   *
   * Lanzarla en el acto no valía: `runGeneration` marca el mensaje en curso de
   * forma síncrona y el `finally` del intento que acaba de fallar lo borraba
   * justo después, dejando la respuesta nueva sin indicador de escritura. Un
   * `setTimeout` la deja empezar cuando ese `finally` ya pasó. */
  const relanzar = useCallback(
    (
      sessionId: string,
      depth: number,
      continuaciones: number,
      semilla?: SemillaFailover,
      revisiones?: number
    ) => {
      setTimeout(() => {
        void runGenRef.current?.(sessionId, depth, continuaciones, semilla, revisiones);
      }, 0);
    },
    []
  );

  /** Failover gratis: si un proveedor agotó su cuota, reintenta con el siguiente
   * modelo más acorde a la tarea. Los que están en cooldown se saltan. */
  const attemptFailover = useCallback(
    (
      sessionId: string,
      failedProviderId: ProviderId,
      failedAssistantId: string,
      depth = 0,
      continuaciones = 0,
      /** lo que llegó a escribir el modelo caído: la burbuja ya no lo tiene,
       *  porque la rama de error la sobrescribe con el mensaje del fallo */
      parcial = ""
    ) => {
      const st = usePrism.getState();
      const session = st.sessions.find((s) => s.id === sessionId);
      const task = classifyTask(lastUserPrompt(session?.messages ?? []));
      const blocked = (pid: ProviderId, mid: string) => {
        const h = useHealth.getState();
        // cuota a dos niveles: el modelo enfriado Y el proveedor entero (429/402)
        if (cooldownRemaining(h.entries[makeModelKey(pid, mid)]) > 0) return true;
        return providerCooldownRemaining(h.providerEntries[pid]) > 0;
      };
      const candidate =
        pickTaskFailover(task.kind, st.providers, failedProviderId, blocked) ??
        pickFailoverCandidate(st.providers, failedProviderId, blocked);
      const failedName = PROVIDER_MAP[failedProviderId]?.name ?? failedProviderId;
      if (!candidate) {
        toast.error(`${failedName} se quedó sin cuota gratis`, {
          description: "No hay otro proveedor conectado. Conecta Gemini, Groq u OpenRouter (gratis) en Ajustes, o prueba el modelo Auto.",
          action: { label: "Ver radar", onClick: () => setRadarOpen(true) },
          duration: 12000,
        });
        return;
      }
      const targetName = PROVIDER_MAP[candidate.providerId]?.name ?? candidate.providerId;
      const corte = parcial.trim().length >= MIN_RESCATE ? respuestaCortada(parcial) : null;
      const seguira = !!corte?.cortada;
      toast.warning(`Cuota gratis agotada en ${failedName}`, {
        description: seguira
          ? `${candidate.modelId} · ${targetName} sigue desde donde se quedó. El modelo quedó cambiado.`
          : `Reintentando automáticamente con ${candidate.modelId} · ${targetName}. El modelo quedó cambiado.`,
        duration: 10000,
      });
      // ¿Había trabajo hecho que merezca la pena conservar?
      //
      // Hasta ahora esto era `deleteMessage` a secas: el modelo nuevo
      // empezaba de cero y los minutos que llevaba escritos el anterior se
      // tiraban. Cambiaba de modelo, sí; *seguir con la tarea*, no. Con
      // modelos gratis lentos eso son minutos perdidos en cada salto.
      const semilla: SemillaFailover | undefined = corte?.cortada
        ? { assistantId: failedAssistantId, previo: parcial, corte }
        : undefined;

      if (semilla) {
        // se conserva la burbuja y se le devuelve lo escrito: el modelo nuevo
        // escribe A CONTINUACIÓN. Si se creara otra, el bloque de código
        // quedaría partido en dos y la vista previa se quedaría sin documento.
        updateMessage(sessionId, failedAssistantId, { content: parcial, error: false });
      } else {
        deleteMessage(sessionId, failedAssistantId);
      }
      setModelKey(makeModelKey(candidate.providerId, candidate.modelId));
      // `depth + 1`, no `1` fijo: el salto se contaba siempre como el primero,
      // así que los guardas de `depth === 0` cerraban la puerta al segundo. Si
      // el sustituto también fallaba, el trabajo se quedaba ahí parado.
      relanzar(sessionId, depth + 1, continuaciones, semilla);
    },
    [deleteMessage, updateMessage, setModelKey, relanzar]
  );

  /** Ejecuta una generación a partir del estado actual de la sesión.
   * Con el modelo «Auto» clasifica la tarea y recorre los gratis más acordes,
   * saltando cooldown y avanzando si se acaba la cuota. */
  const runGeneration = useCallback(
    async (
      sessionId: string,
      depth = 0,
      continuaciones = 0,
      semilla?: SemillaFailover,
      revisiones = 0
    ) => {
      const state = usePrism.getState();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session) return;

      // clave fresca del store (importante tras un failover que cambió el modelo)
      const freshKey = session.modelKey ?? state.settings.defaultModelKey ?? undefined;
      const auto = isAutoKey(freshKey);
      const task = classifyTask(lastUserPrompt(session.messages));

      // ——— cadena de candidatos ———
      type Candidate = { providerId: ProviderId; modelId: string };
      let chain: Candidate[] = [];
      if (auto) {
        const health = useHealth.getState();
        // el bloqueo mira modelo Y proveedor: si la cuota del proveedor está agotada,
        // no se dan tumbos entre sus modelos — se salta directo al siguiente proveedor
        const bloqueado = (pid: ProviderId, mid: string) =>
          cooldownRemaining(health.entries[makeModelKey(pid, mid)]) > 0 ||
          providerCooldownRemaining(health.providerEntries[pid]) > 0;
        chain = buildTaskChain(
          task.kind,
          state.providers,
          bloqueado,
          6,
          health.lastGood?.key ?? null,
          // Lo medido de verdad en este dispositivo. Hasta ahora Auto no
          // aprendía: recordaba el último acierto y nada más.
          useUsage.getState().byModel
        );
        if (chain.length === 0) {
          toast.error("Auto no tiene modelos disponibles", {
            description: "Conecta al menos un proveedor gratis (Gemini, Groq, OpenRouter…) en Ajustes.",
            action: { label: "Abrir", onClick: () => { setFocusProvider("gemini"); setSettingsOpen(true); } },
          });
          return;
        }
        if (depth === 0) {
          toast.message(`Auto · ${task.label}`, {
            description: `${chain[0].modelId} · ${PROVIDER_MAP[chain[0].providerId]?.name ?? chain[0].providerId}. Si se acaba la cuota, pasa al siguiente.`,
            duration: 4500,
          });
        }
      } else {
        const resolved = resolveModel(freshKey);
        if (!resolved) return;
        chain = [resolved];
      }

      // Con semilla se escribe DENTRO de la burbuja del modelo caído: así el
      // bloque de código queda entero y la vista previa lo puede pintar.
      const assistantId = semilla?.assistantId ?? uid();
      if (semilla) {
        updateMessage(sessionId, assistantId, {
          model: `${chain[0].providerId}::${chain[0].modelId}`,
          error: false,
        });
      } else {
        addMessage(sessionId, {
          id: assistantId,
          role: "assistant",
          content: "",
          model: `${chain[0].providerId}::${chain[0].modelId}`,
          createdAt: Date.now(),
        });
      }
      setStreamingMsgId(assistantId);

      // ——— historial + escudo PII + compresión de contexto ———
      const history = session.messages
        // la burbuja de la semilla se reinyecta aparte, con su instrucción de
        // continuar: si entrara aquí además, el modelo la vería dos veces
        .filter((m) => m.role !== "system" && !m.error && m.id !== semilla?.assistantId)
        .map((m) => ({
          role: m.role,
          // los documentos adjuntos viajan como texto de contexto del mensaje
          content: m.docTexts?.length
            ? `${m.content}\n\n${m.docTexts.map((d) => `[Documento: ${d.name}]\n${d.text}`).join("\n\n")}`
            : m.content,
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        }));
      // Escudo PII (inspirado en OrcaRouter): enmascara correos/teléfonos/tarjetas/
      // IBAN/DNI en lo que ENVÍA — la burbuja que ves permanece intacta.
      let piiCount = 0;
      let piiTypes: string[] = [];
      if (usePrism.getState().settings.piiShield) {
        for (let i = 0; i < history.length; i++) {
          if (history[i].role !== "user") continue;
          const r = maskPII(history[i].content);
          if (r.findings.length) {
            history[i] = { ...history[i], content: r.masked };
            piiCount += r.findings.length;
            piiTypes = Array.from(new Set([...piiTypes, ...r.findings.map((f) => PII_LABELS[f.type])]));
          }
        }
        if (piiCount > 0) {
          toast.info(`Escudo PII: ${piiCount} ${piiCount === 1 ? "dato enmascarado" : "datos enmascarados"}`, {
            description: `${piiTypes.join(", ")} en lo que se envió al modelo. Tu mensaje visible no cambia.`,
            duration: 6000,
          });
        }
      }
      const cw = usePrism.getState().settings.contextWindow;
      const base = cw > 0 ? history.slice(-cw) : history;
      const compMode: CompressionMode = usePrism.getState().settings.compression ?? "off";
      // la pregunta viva (último mensaje user) no se comprime nunca
      let protectIdx = -1;
      for (let i = base.length - 1; i >= 0; i--) {
        if (base[i].role === "user") { protectIdx = i; break; }
      }
      const comp = compressHistory(base, compMode, protectIdx);
      // Con semilla se añaden DESPUÉS de comprimir: lo que llevaba escrito el
      // modelo caído y la orden de empalmar son justo lo que no se puede
      // resumir sin perder el punto exacto del corte.
      const trimmed = semilla
        ? [
            ...comp.messages,
            { role: "assistant" as const, content: semilla.previo },
            { role: "user" as const, content: continuarCodigoPrompt(semilla.corte) },
          ]
        : comp.messages;
      const origChars = base.reduce((a, m) => a + m.content.length, 0);
      const savedPct =
        comp.savedChars > 400 && origChars > 0 ? savingsPercent(origChars, comp.savedChars) : 0;

      const controller = new AbortController();
      abortRef.current = controller;
      const startedAt = Date.now();

      // Con semilla, lo que escriba el modelo nuevo se empalma detrás de lo
      // que había: `base` es el punto de partida, no la cadena vacía.
      const base0 = semilla?.previo ?? "";
      let content = base0;
      let motivoProveedor: MotivoParada | null = null;
      let reasoning = "";
      let lastPaint = 0;

      const paint = (force = false) => {
        const now = Date.now();
        if (!force && now - lastPaint < 60) return;
        lastPaint = now;
        // separa también los <think>…</think> que algunos modelos meten en el contenido
        const s = splitThinkTags(content, reasoning);
        updateMessage(sessionId, assistantId, {
          content: s.content,
          reasoning: s.reasoning || undefined,
        });
      };

      /** registra el resultado en métricas y salud */
      const settle = (candidate: Candidate, ok: boolean, ms: number) => {
        const key = makeModelKey(candidate.providerId, candidate.modelId);
        if (ok) {
          useHealth.getState().recordSuccess(key);
          useUsage.getState().record({
            modelKey: key,
            ok: true,
            ms,
            charsIn: origChars,
            charsOut: content.length,
            savedChars: comp.savedChars,
          });
        } else {
          useUsage.getState().record({ modelKey: key, ok: false, charsIn: origChars });
        }
      };

      try {
        for (let ci = 0; ci < chain.length; ci++) {
          const candidate = chain[ci];
          const attemptStart = Date.now();
          content = base0;
          reasoning = "";
          if (ci > 0) {
            // reutiliza la misma burbuja con el nuevo modelo — y si hay
            // semilla, conservando lo que ya estaba escrito
            updateMessage(sessionId, assistantId, {
              content: base0,
              reasoning: undefined,
              model: `${candidate.providerId}::${candidate.modelId}`,
              error: false,
            });
          }
          try {
            // Bucle de tools del agente (PLAN-V4 punto 2 + 5): el hook
            // `useAgentTools` encapsula el probe de tools + el bucle de
            // tool_calls + la reinyección. Así `chat-app` no tiene que
            // saber de los tres protocolos ni del catálogo.
            const agentOn = usePrism.getState().settings.agentMode;
            const maxLoops = Math.max(1, Math.min(8, usePrism.getState().settings.agentMaxLoops || 3));
            const cfg = usePrism.getState().providers[candidate.providerId];
            await runWithTools(
              {
                providerId: candidate.providerId,
                config: cfg,
                modelId: candidate.modelId,
                messages: trimmed,
                settings: composeSettings(sessionId),
                signal: controller.signal,
                onDelta: (text) => {
                  content = base0 ? unirContinuacion(base0, text) : text;
                  paint();
                },
                onReasoning: (r) => {
                  reasoning = r;
                  paint();
                },
                // Por qué paró, según el proveedor. Es la señal AUTORIZADA de
                // «te corté por longitud»; la forma del texto (una cerca sin
                // cerrar) es solo un indicio, y falla cuando el corte cae a
                // mitad de una frase sin código de por medio.
                onFinish: (m) => {
                  motivoProveedor = m;
                },
                onDone: () => {},
              },
              agentOn,
              maxLoops,
              sandboxInitial,
              cfg
            );
          } catch (err) {
            const aborted = err instanceof DOMException && err.name === "AbortError";
            if (aborted) throw err;
            const status = statusFromError(err);
            useHealth.getState().recordFailure(
              makeModelKey(candidate.providerId, candidate.modelId),
              status,
              retryAfterFromError(err)
            );
            settle(candidate, false, 0);
            const msg = err instanceof Error ? err.message : String(err);
            // La decisión (¿otro modelo? ¿otro proveedor? ¿me rindo?) vive en
            // `decisiones.ts`, sin React de por medio y con sus propios tests.
            // Aquí solo queda ejecutarla y contarlo.
            const decision = decidirTrasError({
              status,
              mensajeCuota: isQuotaError(msg),
              auto,
              depth,
              maxSaltos: MAX_SALTOS,
              indice: ci,
              cadena: chain,
              parcial: content,
              rescatable:
                content.trim().length >= MIN_RESCATE && respuestaCortada(content).cortada,
            });

            if (decision.tipo === "siguiente") {
              const sig = chain[decision.indice];
              toast.warning(
                auto ? `Auto: ${candidate.modelId} falló` : `${candidate.modelId} no respondió`,
                {
                  description: `Saltando a ${sig.modelId} · ${PROVIDER_MAP[sig.providerId]?.name ?? ""}`,
                  duration: 6000,
                }
              );
              ci = decision.indice - 1;
              continue;
            }

            updateMessage(sessionId, assistantId, {
              content: msg,
              error: true,
              elapsedMs: Date.now() - attemptStart,
            });
            if (decision.tipo === "failover") {
              attemptFailover(
                sessionId,
                candidate.providerId,
                assistantId,
                depth,
                continuaciones,
                content
              );
            }
            break;
          }

          // ——— éxito del stream ———
          paint(true);
          const finalSplit = splitThinkTags(content, reasoning);
          content = finalSplit.content;
          reasoning = finalSplit.reasoning;
          let elapsed = Date.now() - attemptStart;

          // Con semilla, `content` arranca con lo que ya había escrito el
          // modelo caído: para juzgar ESTE intento hay que mirar solo lo que
          // ha aportado él, no la burbuja entera.
          const aportado =
            base0 && content.startsWith(base0) ? content.slice(base0.length) : content;

          // Failover: algunos proveedores responden 200 con el aviso de cuota como texto
          const quotaInText =
            aportado.length > 0 && aportado.length < 600 && isQuotaError(aportado);
          if (quotaInText) {
            const key = makeModelKey(candidate.providerId, candidate.modelId);
            useHealth.getState().recordFailure(key, 402);
            settle(candidate, false, elapsed);
            const dCuota = decidirTrasCuotaEnTexto({
              status: 402,
              mensajeCuota: true,
              auto,
              depth,
              maxSaltos: MAX_SALTOS,
              indice: ci,
              cadena: chain,
              parcial: base0,
              rescatable: false,
            });
            if (dCuota.tipo === "siguiente") {
              updateMessage(sessionId, assistantId, { content: base0, reasoning: undefined });
              toast.warning(`${auto ? "Auto" : candidate.modelId}: cuota agotada`, {
                description: `Saltando a ${chain[dCuota.indice].modelId}.`,
                duration: 6000,
              });
              ci = dCuota.indice - 1;
              continue;
            }
            if (dCuota.tipo === "failover") {
              attemptFailover(
                sessionId,
                candidate.providerId,
                assistantId,
                depth,
                continuaciones,
                base0
              );
            }
            return;
          }

          // Respuesta vacía. Pasa con los modelos de razonamiento: gastan el
          // presupuesto de salida pensando y cierran el stream sin escribir
          // nada. Se contaba como ÉXITO, así que la burbuja se quedaba en
          // blanco y todo se paraba ahí sin decir por qué. Es un fallo, y como
          // fallo avanza en la cadena.
          if (!aportado.trim()) {
            const key = makeModelKey(candidate.providerId, candidate.modelId);
            useHealth.getState().recordFailure(key, 0);
            settle(candidate, false, elapsed);
            const soloPenso = reasoning.trim().length > 0;
            const dVacio = decidirTrasVacio({
              status: 200,
              mensajeCuota: false,
              auto,
              depth,
              maxSaltos: MAX_SALTOS,
              indice: ci,
              cadena: chain,
              parcial: "",
              rescatable: false,
            });
            if (dVacio.tipo === "siguiente") {
              toast.warning(`${candidate.modelId} no escribió respuesta`, {
                description: `${soloPenso ? "Se le fue el turno razonando. " : ""}Probando con ${chain[dVacio.indice].modelId}.`,
                duration: 6000,
              });
              ci = dVacio.indice - 1;
              continue;
            }
            const aviso = soloPenso
              ? "El modelo terminó de razonar pero cerró la respuesta sin escribir nada. Su razonamiento está aquí debajo. Suele pasar cuando el límite de salida se agota pensando: sube «Tokens máximos» en Ajustes o prueba otro modelo."
              : "El modelo cerró la respuesta sin escribir nada.";
            updateMessage(sessionId, assistantId, {
              // lo rescatado del modelo anterior no se tira por que el nuevo
              // no aportara: se conserva y se explica debajo
              content: base0 ? `${base0}\n\n_${aviso}_` : aviso,
              error: !base0,
              reasoning: reasoning || undefined,
              elapsedMs: elapsed,
            });
            if (dVacio.tipo === "failover") {
              attemptFailover(
                sessionId,
                candidate.providerId,
                assistantId,
                depth,
                continuaciones,
                base0
              );
            }
            break;
          }

          // ——— la respuesta se cortó por longitud ———
          //
          // Pides una web larga, el modelo llega a su techo de tokens y el
          // stream acaba dentro del bloque de código. Se daba por respuesta
          // buena: la cerca quedaba sin cerrar, la vista previa recibía un
          // documento incompleto y no cargaba.
          //
          // Se cose EN LA MISMA burbuja a propósito. Si la continuación fuera
          // otro mensaje, el bloque de código quedaría partido en dos y la
          // vista previa seguiría sin tener un documento entero que enseñar.
          //
          // Con el modo agente esto lo lleva `agentStalled`, que entiende sus
          // etiquetas; aquí es para todo lo demás, que es como se pide una web
          // la mayoría de las veces.
          if (!usePrism.getState().settings.agentMode) {
            // Dos señales: lo que dice el proveedor y la forma del texto.
            // Con cualquiera de las dos se continúa — el proveedor acierta
            // donde la forma no ve nada (un corte a media frase), y la forma
            // cubre a los proveedores que no mandan el campo.
            let corte = respuestaCortada(content);
            if (!corte.cortada && estaCortadaPorLongitud(motivoProveedor)) {
              corte = { cortada: true, motivo: "cerca-abierta", lang: "", cola: content.slice(-600) };
            }
            for (let trozo = 0; corte.cortada && trozo < MAX_TROZOS; trozo++) {
              if (controller.signal.aborted) break;
              const previo = content;
              toast.message("La respuesta se cortó por longitud", {
                description: `Pidiendo la continuación (${trozo + 1} de ${MAX_TROZOS}) y uniéndola al mismo bloque.`,
                duration: 5000,
              });
              let parcial = "";
              try {
                await runWithTools(
                  {
                    providerId: candidate.providerId,
                    config: usePrism.getState().providers[candidate.providerId],
                    modelId: candidate.modelId,
                    messages: [
                      ...trimmed,
                      { role: "assistant" as const, content: previo },
                      { role: "user" as const, content: continuarCodigoPrompt(corte) },
                    ],
                    settings: composeSettings(sessionId),
                    signal: controller.signal,
                    onDelta: (t) => {
                      parcial = t;
                      content = unirContinuacion(previo, t);
                      paint();
                    },
                    onReasoning: () => {},
                    onFinish: (m) => {
                      motivoProveedor = m;
                    },
                    onDone: () => {},
                  },
                  // sin tools y con una sola vuelta: esto es empalmar texto,
                  // no otro bucle de agente
                  false,
                  1,
                  sandboxInitial,
                  usePrism.getState().providers[candidate.providerId]
                );
              } catch {
                // Si la continuación falla, lo cortado vale más que nada: se
                // conserva lo que ya había y se sale del bucle.
                content = previo;
                break;
              }
              content = unirContinuacion(previo, parcial);
              // si no aportó nada, insistir solo gasta cuota
              if (content === previo) break;
              corte = respuestaCortada(content);
              if (!corte.cortada && estaCortadaPorLongitud(motivoProveedor)) {
                corte = { cortada: true, motivo: "cerca-abierta", lang: "", cola: content.slice(-600) };
              }
            }
            paint(true);
            elapsed = Date.now() - attemptStart;
            if (corte.cortada) {
              toast.warning("La respuesta sigue incompleta", {
                description: "El modelo no llegó a cerrar el código. Prueba con otro modelo o pídele solo la parte que falta.",
                duration: 8000,
              });
            }
          }

          settle(candidate, true, elapsed);
          updateMessage(sessionId, assistantId, {
            content,
            reasoning: reasoning || undefined,
            elapsedMs: elapsed,
            ...(savedPct >= 5 ? { ctxSaved: savedPct } : {}),
            ...(piiCount > 0 ? { piiMasked: piiCount } : {}),
          });
          updateProjectMap(sessionId, content);
          // Memoria de fallos: un trabajo del agente que se quedó a medias es un
          // fallo verificable (hay traza, no hay <answer>). Se apunta la regla para
          // la próxima vez — y caduca sola para no envenenar el contexto.
          if (usePrism.getState().settings.agentMode) {
            // `true`: el stream ya acabó, así que una etiqueta abierta no es
            // que esté escribiendo — es que se cortó a mitad.
            const info = agentStalled(parseAgentTrace(content), true);
            if (info.stalled) {
              useFailures.getState().record(
                "agente",
                `Trabajo a medias: ${MOTIVO_PARADA[info.reason ?? "sin-respuesta"]} tras ${info.iterations} ${info.iterations === 1 ? "iteración" : "iteraciones"}`,
                "Cierra SIEMPRE el bucle del agente con <answer> tras la revisión final. Si el techo de iteraciones se acerca, prioriza terminar lo esencial y cerrar en vez de dejar pasos abiertos.",
                "warn"
              );
              // Y se retoma solo. Hasta ahora solo aparecía el botón
              // «Continuar»: el agente se paraba y, si nadie lo pulsaba, el
              // trabajo moría ahí. Con tope, y el botón sigue estando para
              // cuando se agote.
              if (continuaciones < MAX_CONTINUACIONES) {
                addMessage(sessionId, {
                  id: uid(),
                  role: "user",
                  content: continuePrompt(info),
                  createdAt: Date.now(),
                  instruction: true,
                });
                toast.message("El agente se quedó a medias", {
                  description: `Retomando el trabajo solo (${continuaciones + 1} de ${MAX_CONTINUACIONES}).`,
                  duration: 5000,
                });
                relanzar(sessionId, depth, continuaciones + 1);
              }
            } else {
              // ——— el agente prueba su propio código ———
              //
              // PLAN-V4 §3: «hoy el agente escribe código y te pregunta a TI
              // si funciona». Se arregló solo para los modelos que soportan
              // `tools` y llaman a `run_project`; la mayoría de los gratis van
              // por el camino XML, o sea que el arreglo llegaba justo a los
              // modelos para los que Prism NO existe.
              //
              // Ejecutar es local y gratis: solo cuesta una llamada al modelo
              // si de verdad hay errores que corregir.
              const proyecto = proyectoDeLaRespuesta(content);
              if (proyecto && revisiones < MAX_REVISIONES) {
                void (async () => {
                  // `botones: true`: además de cargar la página, se pulsan
                  // sus botones. La revisión de carga solo caza lo que revienta
                  // al abrir, y en una web generada la mayoría de los fallos
                  // están detrás de un clic.
                  const salida = await runProjectInMemory(proyecto.files, { botones: true });
                  const inf = salida.botones;

                  if (!hayQueCorregir(salida)) {
                    // La carga fue limpia, pero puede haber botones que revienten.
                    if (inf && hayBotonesQueCorregir(inf)) {
                      const reglaB = reglaDeBotones(inf);
                      if (reglaB) {
                        useFailures.getState().record("sandbox", reglaB.titulo, reglaB.regla, "error");
                      }
                      addMessage(sessionId, {
                        id: uid(),
                        role: "user",
                        content: promptDeBotones(inf, proyecto.entry),
                        createdAt: Date.now(),
                        instruction: true,
                      });
                      toast.warning("Botones que fallan", {
                        description: `${resumenBotones(inf)} Corrigiéndolo solo (${revisiones + 1} de ${MAX_REVISIONES}).`,
                        duration: 7000,
                      });
                      relanzar(sessionId, depth, continuaciones, undefined, revisiones + 1);
                      return;
                    }
                    if (salida.ejecutado) {
                      toast.success("El agente probó su código", {
                        description: `${resumenRevision(salida)}${inf?.hecho ? ` ${resumenBotones(inf)}` : ""}`,
                        duration: 6000,
                      });
                    }
                    return;
                  }
                  // Memoria de fallos: esto ha salido de EJECUTAR el código,
                  // no de una impresión. Es exactamente lo que esa memoria
                  // debe guardar.
                  const regla = reglaDeFallo(salida);
                  if (regla) {
                    useFailures.getState().record("sandbox", regla.titulo, regla.regla, "error");
                  }
                  addMessage(sessionId, {
                    id: uid(),
                    role: "user",
                    content: promptDeCorreccion(salida, proyecto.entry),
                    createdAt: Date.now(),
                    instruction: true,
                  });
                  toast.warning("El agente encontró errores en su código", {
                    description: `${resumenRevision(salida)} Corrigiéndolo solo (${revisiones + 1} de ${MAX_REVISIONES}).`,
                    duration: 7000,
                  });
                  relanzar(sessionId, depth, continuaciones, undefined, revisiones + 1);
                })();
              }
            }
          }
          // Lectura automática de la respuesta (Ajustes → Chat)
          if (usePrism.getState().settings.autoSpeak && content.trim()) {
            speak({ text: content });
          }
          break;
        }
      } catch (err) {
        paint(true);
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) {
          if (content) {
            const s = splitThinkTags(content, reasoning);
            updateMessage(sessionId, assistantId, {
              content: s.content + "\n\n_(detenido)_",
              reasoning: s.reasoning || undefined,
              elapsedMs: Date.now() - startedAt,
            });
          } else {
            deleteMessage(sessionId, assistantId);
          }
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          updateMessage(sessionId, assistantId, {
            content: content ? content : msg,
            error: !content,
            elapsedMs: Date.now() - startedAt,
          });
          if (content) toast.error("Error a mitad de la respuesta", { description: msg });
        }
      } finally {
        abortRef.current = null;
        setStreamingMsgId(null);
      }
    },
    [addMessage, updateMessage, deleteMessage, resolveModel, composeSettings, updateProjectMap, attemptFailover, relanzar]
  );

  // mantener la referencia fresca para los reintentos del failover
  runGenRef.current = runGeneration;

  /** Genera una imagen gratis (Pollinations) y la añade como mensaje del asistente */
  const sendImage = useCallback(
    async (prompt: string) => {
      const sessionId = ensureSession();
      addMessage(sessionId, {
        id: uid(),
        role: "user",
        content: prompt,
        createdAt: Date.now(),
      });
      const assistantId = uid();
      addMessage(sessionId, {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      });
      setStreamingMsgId(assistantId);
      stickToBottomRef.current = true;
      try {
        const url = buildImageUrl(prompt);
        await preloadImage(url);
        updateMessage(sessionId, assistantId, {
          content: `🖼️ Imagen generada para: ${prompt}`,
          generatedImage: { url, prompt },
          elapsedMs: undefined,
        });
      } catch (e) {
        updateMessage(sessionId, assistantId, {
          content: e instanceof Error ? e.message : "No se pudo generar la imagen",
          error: true,
        });
      } finally {
        setStreamingMsgId(null);
      }
    },
    [ensureSession, addMessage, updateMessage]
  );

  /**
   * Modo consenso: la misma petición a varios modelos a la vez y una pasada
   * final que combina lo mejor de todas.
   *
   * No es un debate de varias rondas: eso multiplica el coste por el número de
   * modelos EN CADA RONDA y con capas gratuitas los 429 lo cortarían a medias.
   * Aquí son N llamadas en paralelo más UNA de síntesis.
   */
  const runConsensus = useCallback(
    async (sessionId: string, pregunta: string) => {
      const st = usePrism.getState();
      const health = useHealth.getState();
      const panel = pickPanel(st.providers, {
        soloGratis: st.settings.onlyFree,
        favoritos: st.favorites,
        enCooldown: (k) => {
          const h = useHealth.getState();
          const split = splitModelKey(k);
          if (cooldownRemaining(h.entries[k]) > 0) return true;
          return split ? providerCooldownRemaining(h.providerEntries[split.providerId]) > 0 : false;
        },
      });

      if (panel.length < 2) {
        toast.warning("El consenso necesita al menos dos proveedores", {
          description:
            "Conecta otro en Ajustes → Proveedores (Gemini, Groq y OpenRouter tienen capa gratis). Mientras tanto se responde de la forma normal.",
          duration: 10_000,
        });
        void runGeneration(sessionId);
        return;
      }

      const assistantId = uid();
      addMessage(sessionId, {
        id: assistantId,
        role: "assistant",
        content: "",
        model: makeModelKey(panel[0].providerId, panel[0].modelId),
        createdAt: Date.now(),
      });
      setStreamingMsgId(assistantId);
      stickToBottomRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;
      const empezó = Date.now();
      let hechos = 0;
      const marcar = () =>
        updateMessage(sessionId, assistantId, {
          content: `_${estadoPanel(hechos, panel.length)}_`,
        });
      marcar();

      const mensajes = [{ role: "user" as const, content: pregunta }];
      const ajustes = { ...composeSettings(sessionId), stream: false };

      /** Cada panelista responde entero; el fallo de uno no tumba la tanda. */
      const preguntar = async (p: Panelista): Promise<RespuestaPanel | null> => {
        try {
          const texto = await streamChat({
            providerId: p.providerId,
            config: usePrism.getState().providers[p.providerId],
            modelId: p.modelId,
            messages: mensajes,
            settings: ajustes,
            signal: controller.signal,
            onDelta: () => {},
            onDone: () => {},
          });
          useHealth.getState().recordSuccess(makeModelKey(p.providerId, p.modelId));
          return texto.trim() ? { panelista: p, texto } : null;
        } catch (err) {
          useHealth
            .getState()
            .recordFailure(makeModelKey(p.providerId, p.modelId), statusFromError(err));
          return null;
        } finally {
          hechos++;
          marcar();
        }
      };

      try {
        const crudas = await Promise.all(panel.map(preguntar));
        const respuestas = crudas.filter((r): r is RespuestaPanel => !!r);

        if (!respuestas.length) {
          updateMessage(sessionId, assistantId, {
            content: "Ningún modelo del panel respondió. Revisa tus claves en Ajustes.",
            error: true,
          });
          return;
        }

        // Con una sola respuesta no hay nada que combinar: se entrega tal cual.
        if (!necesitaSintesis(respuestas)) {
          const sola = respuestas[0];
          updateMessage(sessionId, assistantId, {
            content: sola.texto,
            model: makeModelKey(sola.panelista.providerId, sola.panelista.modelId),
            elapsedMs: Date.now() - empezó,
          });
          return;
        }

        const juez = pickSintetizador(panel, respuestas.map((r) => r.panelista));
        if (!juez) return;

        updateMessage(sessionId, assistantId, {
          content: `_${estadoPanel(panel.length, panel.length)}_`,
          model: makeModelKey(juez.providerId, juez.modelId),
        });

        let salida = "";
        await streamChat({
          providerId: juez.providerId,
          config: usePrism.getState().providers[juez.providerId],
          modelId: juez.modelId,
          messages: [{ role: "user", content: synthesisPrompt(pregunta, respuestas) }],
          settings: composeSettings(sessionId),
          signal: controller.signal,
          onDelta: (t) => {
            salida = t;
            updateMessage(sessionId, assistantId, { content: t });
          },
          onDone: (full) => {
            salida = full;
          },
        });

        updateMessage(sessionId, assistantId, {
          content: salida,
          elapsedMs: Date.now() - empezó,
          consensusOf: respuestas.length,
        });
      } catch (err) {
        const abortada = err instanceof DOMException && err.name === "AbortError";
        if (!abortada) {
          updateMessage(sessionId, assistantId, {
            content: err instanceof Error ? err.message : "Falló el consenso",
            error: true,
          });
        }
      } finally {
        setStreamingMsgId(null);
        abortRef.current = null;
      }
    },
    [addMessage, updateMessage, composeSettings, runGeneration]
  );

  const send = useCallback(
    (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text && attachments.length === 0 && docs.length === 0) return;
      const now = Date.now();
      if (now - lastSendAtRef.current < 350) return;
      lastSendAtRef.current = now;
      const sessionId = ensureSession();
      const state = usePrism.getState();
      const session = state.sessions.find((s) => s.id === sessionId);

      // Primer mensaje de la conversación y modo agente apagado: si parece un
      // encargo de construir algo, se PROPONE. Nunca se activa solo.
      if (!state.settings.agentMode && !session?.messages.length && !agentSugerido) {
        const sug = suggestAgentMode(text);
        if (sug.suggest) {
          setAgentSugerido(true);
          toast("¿Activar el modo agente?", {
            description: `${sug.reason}. El agente planifica, ejecuta y revisa por iteraciones en vez de responder de una sola vez.`,
            duration: 12000,
            action: {
              label: "Activar",
              onClick: () => {
                setSettings({ agentMode: true });
                toast.success("Modo agente activado", {
                  description: "Se aplicará a partir del siguiente mensaje.",
                });
              },
            },
          });
        }
      }
      // Skills que encajan con lo que acabas de pedir. `classifyTask` ya
      // clasificaba el encargo para elegir modelo; aquí la misma señal sirve
      // para decir qué skill ayudaría. Se PROPONE: el clic es tuyo, y el
      // aviso trae el precio en caracteres para que decidas con el dato.
      if (text) {
        const tarea = classifyTask(text);
        const sugerencias = skillsSugeridas(tarea.kind, state.skills, skillsPropuestas.current);
        for (const sug of sugerencias) {
          skillsPropuestas.current.push(sug.skill.id);
          toast(`${sug.skill.icon} ${sug.skill.name}`, {
            description: textoSugerencia(sug, tarea.label),
            duration: 10000,
            action: {
              label: "Activar",
              onClick: () => {
                usePrism.getState().toggleSkill(sug.skill.id);
                toast.success(`«${sug.skill.name}» activada`, {
                  description: "Se aplica a partir del siguiente mensaje.",
                });
              },
            },
          });
        }
      }

      if (imageMode && text) {
        setInput("");
        void sendImage(text);
        return;
      }

      const repo = extractRepoFromText(text);
      if (repo) {
        setRepoSeedUrl(repo.url);
        setReposOpen(true);
        toast.success(`Abriendo ${repo.owner}/${repo.repo}`, {
          description: "Clónalo, edítalo o mándalo al Sandbox para analizarlo.",
        });
      }

      addMessage(sessionId, {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
        ...(attachments.length ? { attachments } : {}),
        ...(docs.length ? { docTexts: docs } : {}),
      });
      setInput("");
      setAttachments([]);
      setDocs([]);
      stickToBottomRef.current = true;
      if (repo && isMostlyRepoLink(text)) {
        addMessage(sessionId, {
          id: uid(),
          role: "assistant",
          content: `He abierto **${repo.owner}/${repo.repo}** en Repo Studio.\n\nAhí puedes ver los archivos, editarlos, clonar el repo y mandarlo al Sandbox. Si es privado o quieres subir a main, pulsa **Conectar GitHub** (un clic, sin token).\n\nSi quieres que lo revise yo, dime qué mirar (estructura, bugs, README…).`,
          createdAt: Date.now(),
        });
        return;
      }
      if (usePrism.getState().settings.consensus) {
        void runConsensus(sessionId, text);
        return;
      }
      void runGeneration(sessionId);
    },
    [input, attachments, docs, imageMode, agentSugerido, ensureSession, addMessage, runGeneration, runConsensus, sendImage, setSettings]
  );

  /** Los errores que salieron mientras USABAS la página van al modelo.
   *
   * El barrido automático pulsa a ciegas, en el orden del DOM y sin escribir
   * en los campos. Esto trae lo que a ese le falta: tu orden, tus datos y los
   * enlaces que tú elegiste. Se manda cuando TÚ lo pides —el aviso trae un
   * botón—, no solo: gastar una respuesta sin permiso por un error que quizá
   * ya sabías es peor que enseñarlo y esperar. */
  const arreglarErroresEnVivo = useCallback(
    (prompt: string) => {
      const st = usePrism.getState();
      const sessionId = st.activeSessionId;
      if (!sessionId || streamingMsgId) return;
      addMessage(sessionId, {
        id: uid(),
        role: "user",
        content: prompt,
        createdAt: Date.now(),
        instruction: true,
      });
      void runGeneration(sessionId);
    },
    [streamingMsgId, addMessage, runGeneration]
  );

  /** Retoma un trabajo del agente que se quedó a medias, sin empezar de cero. */
  const continueAgent = useCallback(
    (msgId: string) => {
      if (!activeSession || streamingMsgId) return;
      const msg = activeSession.messages.find((m) => m.id === msgId);
      if (!msg) return;
      const info = agentStalled(parseAgentTrace(msg.content));
      if (!info.stalled) return;
      addMessage(activeSession.id, {
        id: uid(),
        role: "user",
        content: continuePrompt(info),
        createdAt: Date.now(),
        instruction: true,
      });
      void runGeneration(activeSession.id);
    },
    [activeSession, streamingMsgId, addMessage, runGeneration]
  );

  /** «Resumir hasta aquí»: recapitula la conversación con TODO el contexto.
   *
   * Va como mensaje-instruction: el modelo lo recibe entero (por eso el resumen
   * sale bien), pero en el hilo solo se pinta una nota discreta, igual que el
   * «continuar trabajo» del agente. Así no te ensucia la conversación. */
  const summarizeHere = useCallback(() => {
    if (streamingMsgId) return;
    const st = usePrism.getState();
    const session = st.sessions.find((x) => x.id === st.activeSessionId);
    if (!session?.messages.length) {
      toast.info("Todavía no hay conversación que resumir");
      return;
    }
    addMessage(session.id, {
      id: uid(),
      role: "user",
      content: recapPrompt(),
      createdAt: Date.now(),
      instruction: true,
    });
    stickToBottomRef.current = true;
    void runGeneration(session.id);
  }, [streamingMsgId, addMessage, runGeneration]);

  /** «Traducir respuesta»: la traducción se pega justo debajo, como respuesta
   * nueva, sin tocar el original. También es un mensaje-instruction. */
  const translateMessage = useCallback(
    (msgId: string, lang: TargetLang) => {
      if (!activeSession || streamingMsgId) return;
      const msg = activeSession.messages.find((m) => m.id === msgId);
      if (!msg?.content.trim()) return;
      addMessage(activeSession.id, {
        id: uid(),
        role: "user",
        content: translatePrompt(lang, msg.content),
        createdAt: Date.now(),
        instruction: true,
      });
      stickToBottomRef.current = true;
      void runGeneration(activeSession.id);
    },
    [activeSession, streamingMsgId, addMessage, runGeneration]
  );

  /** Comandos slash del compositor: «/» y a elegir. */
  const handleSlash = useCallback(
    (cmd: SlashCommand) => {
      switch (cmd.id) {
        case "imagen": {
          // el toast va fuera del updater: en StrictMode se invoca dos veces
          const on = !imageMode;
          setImageMode(on);
          toast.success(on ? "Modo imagen activado" : "Modo imagen desactivado", {
            description: on ? "Describe lo que quieres ver y se generará." : undefined,
          });
          break;
        }
        case "agente": {
          const on = !usePrism.getState().settings.agentMode;
          setSettings({ agentMode: on });
          toast.success(on ? "Modo agente activado" : "Modo agente desactivado", {
            description: on ? "Planear → ejecutar → revisar en bucles." : undefined,
          });
          break;
        }
        case "resumen":
          summarizeHere();
          break;
        case "arena":
          setArenaOpen(true);
          break;
        case "nuevo":
          createSession();
          setPreviewOpen(false);
          break;
        case "html":
          // la plantilla ya la insertó el compositor; solo se avisa de qué hacer
          toast.info("Plantilla lista", { description: "Rellena los corchetes y envía." });
          break;
      }
    },
    [imageMode, setSettings, summarizeHere, createSession]
  );

  /** Regenerar NO borra: la respuesta anterior se guarda como rama y puedes
   * volver a ella con las flechas del mensaje. */
  const regenerate = useCallback(
    (msgId: string, modelKey?: string) => {
      if (!activeSession || streamingMsgId) return;
      branchFrom(activeSession.id, msgId);
      // Con modelo elegido se cambia ANTES de lanzar: `runGeneration` lee la
      // clave fresca del store, así que basta con dejarla puesta. Y queda
      // cambiado a propósito — si has tenido que rehacerla con otro, lo
      // normal es seguir con ese.
      if (modelKey) {
        setModelKey(modelKey);
        const info = splitModelKey(modelKey);
        if (info) {
          toast.message(`Rehaciendo con ${info.modelId}`, {
            description: `${PROVIDER_MAP[info.providerId]?.name ?? info.providerId}. La respuesta anterior se guarda: vuelve a ella con las flechas del mensaje.`,
            duration: 6000,
          });
        }
      }
      void runGeneration(activeSession.id);
    },
    [activeSession, streamingMsgId, branchFrom, runGeneration, setModelKey]
  );

  /** Editar tu mensaje tampoco borra lo que vino después: se bifurca desde ahí
   * con el texto nuevo, y la versión anterior sigue accesible. */
  const editUserMessage = useCallback(
    (msgId: string, newContent: string) => {
      if (!activeSession || streamingMsgId) return;
      const original = activeSession.messages.find((m) => m.id === msgId);
      if (!original) return;
      branchFrom(activeSession.id, msgId);
      addMessage(activeSession.id, {
        ...original,
        id: uid(),
        content: newContent,
        createdAt: Date.now(),
      });
      void runGeneration(activeSession.id);
    },
    [activeSession, streamingMsgId, branchFrom, addMessage, runGeneration]
  );

  const stop = () => {
    abortRef.current?.abort();
    demoCancelRef.current?.();
    demoCancelRef.current = null;
    setStreamingMsgId(null);
    stopSpeaking();
  };

  // ——— Atajos de teclado globales (cheat sheet con «?» ) ———
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable ||
          !!t.closest("[contenteditable='true']"));
      const mod = e.metaKey || e.ctrlKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("prism-open-model-picker"));
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const st = usePrism.getState();
        const s = st.sessions.find((x) => x.id === st.activeSessionId);
        if (s && s.messages.length) {
          downloadSessionMarkdown(s);
          toast.success("Conversación exportada a Markdown");
        } else {
          toast.info("No hay conversación activa que exportar");
        }
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setArenaOpen(true);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        createSession();
        return;
      }
      if (!typing && !mod && (e.key === "?" || (e.key === "/" && e.shiftKey))) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [createSession]);

  /** Navegación entre versiones de un mensaje, si se regeneró alguna vez.
   * El ancla de una respuesta es el mensaje que la precede. */
  const branchNav = useCallback(
    (msgId: string) => {
      if (!activeSession?.forks) return undefined;
      const idx = activeSession.messages.findIndex((m) => m.id === msgId);
      if (idx < 0) return undefined;
      const anchor = anchorAt(activeSession.messages, idx);
      const fork = activeSession.forks[anchor];
      if (!fork || fork.branches.length < 2) return undefined;
      const total = fork.branches.length;
      const ir = (delta: number) =>
        switchBranch(activeSession.id, anchor, (fork.active + delta + total) % total);
      return {
        index: fork.active,
        total,
        onPrev: () => ir(-1),
        onNext: () => ir(1),
      };
    },
    [activeSession, switchBranch]
  );

  const lastAssistantId = useMemo(() => {
    if (!activeSession) return null;
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      if (activeSession.messages[i].role === "assistant") return activeSession.messages[i].id;
    }
    return null;
  }, [activeSession]);

  // ——— Virtualización de la lista de mensajes (chats largos fluidos) ———
  const messages = activeSession?.messages ?? [];
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 150,
    getItemKey: (i) => messages[i].id,
    overscan: 6,
  });
  useEffect(() => {
    if (!stickToBottomRef.current || messages.length === 0) return;
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages, streamingMsgId, virtualizer]);

  if (!hydrated) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <PrismLogo size={56} className="generating" />
      </div>
    );
  }

  const hasMessages = !!activeSession && activeSession.messages.length > 0;
  // En modo foco no hay split ni botón de vista previa: solo el hilo.
  const showPreviewPane = previewOpen && !!previewCode && !estrecha && !focusMode;

  const chatArea = (
    <main className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* Arriba del todo: si el servidor ya sirve otra copia, se dice y se
          queda dicho hasta que recargues. */}
      <BannerVersionNueva />
      {/* Cabecera */}
      <header className="glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 px-3 sm:px-4">
        {!focusMode && (
          <Button
            variant="ghost"
            size="icon"
            className="relative size-8 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label={
              radarPendientes > 0
                ? `Abrir conversaciones · ${radarPendientes} novedades en el Radar`
                : "Abrir conversaciones"
            }
          >
            <Menu className="size-4.5" />
            {radarPendientes > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[8px] font-bold text-white">
                {radarPendientes > 9 ? "9+" : radarPendientes}
              </span>
            )}
          </Button>
        )}
        <ModelPicker value={modelKey} onChange={setModelKey} />
        <Button
          size="sm"
          variant={isAutoKey(modelKey) ? "default" : "outline"}
          className={cn(
            "h-9 shrink-0 gap-1 px-2.5 text-xs",
            isAutoKey(modelKey) && "prism-gradient-bg border-0 text-white hover:opacity-90"
          )}
          onClick={() => {
            if (isAutoKey(modelKey)) {
              const st = usePrism.getState();
              setModelKey(
                pickManualModel(st.settings.lastManualModelKey, useHealth.getState().lastGood?.key)
              );
              return;
            }
            setModelKey(AUTO_MODEL_KEY);
          }}
          aria-pressed={isAutoKey(modelKey)}
          aria-label={isAutoKey(modelKey) ? "Desactivar Auto" : "Activar Auto"}
          title={
            isAutoKey(modelKey)
              ? "Auto está on. Púlsalo para volver al modelo que tenías."
              : "Auto: Prism elige el modelo según la tarea."
          }
        >
          <Zap className="size-3.5" />
          Auto
        </Button>
        {/* Chips de estado: lo que está pasando ahora mismo, sin abrir un panel.
         *
         * Los dos solo salen cuando hay dato de verdad. El de Auto, cuando Auto
         * está puesto y ya sabemos qué modelo usó; el de cuota, solo si el
         * proveedor manda sus cabeceras de límite. Donde no hay dato no hay
         * chip: un porcentaje inventado en la cabecera sería lo peor de todo,
         * porque es lo primero que mirarías. */}
        <ChipsDeEstado modelKey={modelKey} />
        <div className="flex-1" />
        {/* La cabecera es solo de la conversación abierta. Arena, instalar,
            tema y Ajustes viven en el pie de la barra lateral, que en pantalla
            grande está siempre a la vista: tenerlos también aquí era la misma
            fila de iconos dos veces. */}
        {hasMessages && activeSession && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Exportar conversación"
                title="Exportar esta conversación"
              >
                <Download className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  downloadSessionMarkdown(activeSession);
                  toast.success("Conversación exportada a Markdown");
                }}
              >
                <FileText className="size-4" />
                <div className="flex flex-col">
                  <span>Markdown (.md)</span>
                  <span className="text-[10.5px] text-muted-foreground">
                    Texto completo con código
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  // `downloadSessionHtml` es async desde v3.14 (resuelve
                  // binarios de IndexedDB antes de montar el HTML). El toast
                  // se muestra inmediatamente; la descarga llega un instante
                  // después. No bloquea la UI.
                  void downloadSessionHtml(activeSession).then(() =>
                    toast.success("Prism Link creado — comparte el .html con quien quieras")
                  );
                }}
              >
                <Globe className="size-4" />
                <div className="flex flex-col">
                  <span>Prism Link (.html)</span>
                  <span className="text-[10.5px] text-muted-foreground">
                    Página autocontenida para compartir
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  // `printSessionPdf` es async desde v3.14: primero carga
                  // los adjuntos desde IndexedDB y luego abre el diálogo
                  // de impresión. El toast avisa de la espera.
                  toast.info("Cargando adjuntos desde el almacenamiento local…");
                  void printSessionPdf(activeSession);
                }}
              >
                <FileDown className="size-4" />
                <div className="flex flex-col">
                  <span>PDF (imprimir)</span>
                  <span className="text-[10.5px] text-muted-foreground">
                    Formateado, con imágenes
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {mobilePreviewReady && (
          /* En el móvil el chat se queda entero mientras escribe. El botón
             sale cuando YA terminó, para ver la página a pantalla completa. */
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2.5 text-xs lg:hidden prism-gradient-bg border-0 text-white hover:opacity-90"
            onClick={() => setMobilePreviewOpen(true)}
            aria-label="Ver el diseño a pantalla completa"
          >
            <Eye className="size-3.5" />
            Ver diseño
          </Button>
        )}
        {hasMessages && (
          /* A 320 px cada icono empuja Ajustes fuera de la pantalla: en el
             móvil el resumen se pide con «/resumen» desde el compositor. */
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-8 lg:inline-flex"
            onClick={summarizeHere}
            disabled={!!streamingMsgId}
            aria-label="Resumir hasta aquí"
            title="Resumir hasta aquí: recapitula la conversación y lo acordado"
          >
            <ScrollText className="size-4" />
          </Button>
        )}
        {/* Resumir y modo foco se quedan: son de la conversación abierta y de
            la vista, y no están en ningún otro sitio. Instalar y tema NO: eso
            es el pie de la barra lateral, que en pantalla grande está siempre
            delante. */}
        <Button
          variant="ghost"
          size="icon"
          className={cn("hidden size-8 lg:inline-flex", focusMode && "text-prism-violet")}
          onClick={() => {
            toggleFocusMode();
            if (!focusMode) setPreviewOpen(false);
          }}
          aria-pressed={focusMode}
          aria-label={focusMode ? "Salir del modo foco" : "Modo foco"}
          title={
            focusMode
              ? "Salir del modo foco: vuelven la barra lateral y la vista previa"
              : "Modo foco: solo la conversación, sin barra lateral ni vista previa"
          }
        >
          {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 lg:hidden"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ajustes"
        >
          <Settings className="size-4" />
        </Button>
      </header>

      {activeSession && (
        <ThreadBar
          session={activeSession}
          onStartThread={() => {
            startThread(activeSession.id);
            toast.success("Hilo archivado", {
              description: "Sigues en la misma conversación, con el lienzo limpio.",
            });
          }}
          onSwitchThread={(id) => switchThread(activeSession.id, id)}
          onRemoveThread={(id) => removeThread(activeSession.id, id)}
          onRenameThread={(id, name) => renameThread(activeSession.id, id, name)}
        />
      )}

      {/* Mensajes / bienvenida */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {!hasMessages ? (
          <Welcome
            onPick={(t) => send(t)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSkills={() => setSkillsOpen(true)}
            onQuickSetup={(pid) => {
              setFocusProvider(pid);
              setSettingsOpen(true);
            }}
            onOpenRepos={() => setReposOpen(true)}
          />
        ) : (
          <div className="relative mx-auto w-full max-w-3xl" style={{ height: virtualizer.getTotalSize() + 24 }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const m = messages[vi.index];
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="px-3 sm:px-6"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                    paddingTop: vi.index === 0 ? 24 : undefined,
                    paddingBottom: 20,
                  }}
                >
                  <MessageItem
                    msg={m}
                    streaming={streamingMsgId === m.id}
                    isLastAssistant={m.id === lastAssistantId && !streamingMsgId}
                    onRegenerate={m.role === "assistant" ? (k?: string) => regenerate(m.id, k) : undefined}
                    branch={branchNav(m.id)}
                    onContinueAgent={
                      m.role === "assistant" ? () => continueAgent(m.id) : undefined
                    }
                    onDelete={
                      streamingMsgId !== m.id ? () => deleteMessage(activeSession!.id, m.id) : undefined
                    }
                    onEdit={m.role === "user" ? (c) => editUserMessage(m.id, c) : undefined}
                    onTranslate={
                      m.role === "assistant" && !m.error && !streamingMsgId
                        ? (lang) => translateMessage(m.id, lang)
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Entrada */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={() => send()}
        onStop={stop}
        streaming={!!streamingMsgId}
        disabled={attaching}
        attachments={attachments}
        onAttach={(files) => void attachFiles(files)}
        onRemoveAttachment={removeAttachment}
        onOpenLibrary={() => setLibraryOpen(true)}
        onOpenSkills={() => setSkillsOpen(true)}
        agent={settings.agentMode}
        onToggleAgent={() => setSettings({ agentMode: !settings.agentMode })}
        consensus={!!settings.consensus}
        onToggleConsensus={() => setSettings({ consensus: !settings.consensus })}
        imageMode={imageMode}
        onToggleImageMode={() => setImageMode((v) => !v)}
        docs={docs}
        onRemoveDoc={removeDoc}
        onSlashCommand={handleSlash}
        placeholder={
          imageMode
            ? "Describe la imagen que quieres generar…"
            : previewOpen
              ? "Pide cambios para la página… se verán en la vista previa"
              : settings.consensus
                ? "Consenso: varios modelos responden y uno combina lo mejor…"
                : settings.agentMode
                ? "Agente activo: planear → ejecutar → revisar en bucles…"
                : undefined
        }
      />
    </main>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar escritorio — en modo foco desaparece */}
      <aside
        className={cn(
          "hidden w-[280px] shrink-0 border-r border-border/60",
          focusMode ? "lg:hidden" : "lg:block"
        )}
      >
        <Sidebar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenLibrary={() => setLibraryOpen(true)}
          onOpenSkills={() => setSkillsOpen(true)}
          onOpenRadar={() => setRadarOpen(true)}
          onOpenGithub={() => setGithubOpen(true)}
          onOpenArena={() => setArenaOpen(true)}
          onOpenGuide={() => setOnboardingOpen(true)}
          onOpenRepos={() => setReposOpen(true)}
          onOpenSandbox={() => setSandboxOpen(true)}
          onOpenUsage={() => setUsageOpen(true)}
          onOpenQuota={() => setQuotaOpen(true)}
          onOpenFailures={() => setFailuresOpen(true)}
        />
      </aside>

      {/* Sidebar móvil */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px] border-border/60 p-0">
          <SheetTitle className="sr-only">Conversaciones</SheetTitle>
          <Sidebar
            onOpenSettings={() => {
              setSettingsOpen(true);
              setSidebarOpen(false);
            }}
            onOpenLibrary={() => {
              setLibraryOpen(true);
              setSidebarOpen(false);
            }}
            onOpenUsage={() => {
              setUsageOpen(true);
              setSidebarOpen(false);
            }}
            onOpenQuota={() => {
              setQuotaOpen(true);
              setSidebarOpen(false);
            }}
            onOpenFailures={() => {
              setFailuresOpen(true);
              setSidebarOpen(false);
            }}
            onOpenSkills={() => {
              setSkillsOpen(true);
              setSidebarOpen(false);
            }}
            onOpenRadar={() => {
              setRadarOpen(true);
              setSidebarOpen(false);
            }}
            onOpenGithub={() => {
              setGithubOpen(true);
              setSidebarOpen(false);
            }}
            onOpenArena={() => {
              setArenaOpen(true);
              setSidebarOpen(false);
            }}
            onOpenGuide={() => {
              setOnboardingOpen(true);
              setSidebarOpen(false);
            }}
            onOpenRepos={() => {
              setReposOpen(true);
              setSidebarOpen(false);
            }}
            onOpenSandbox={() => {
              setSandboxOpen(true);
              setSidebarOpen(false);
            }}
            onClose={() => setSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Área principal + vista previa (escritorio) */}
      {showPreviewPane ? (
        <ResizablePanelGroup direction="horizontal" className="min-w-0 flex-1">
          <ResizablePanel defaultSize={55} minSize={30}>
            {chatArea}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={25} className="panel-in">
            <PreviewPanel
              code={previewCode}
              source={previewMsg?.content ?? null}
              title={activeSession?.title ?? null}
              streaming={previewStreaming}
              onClose={() => setPreviewOpen(false)}
              map={activeSession?.projectMap ?? null}
              onClearMap={() => activeSession && setProjectMap(activeSession.id, null)}
              onAddNote={(t) => activeSession && addProjectNote(activeSession.id, t)}
              onRemoveNote={(i) => activeSession && removeProjectNote(activeSession.id, i)}
              onRestoreSnapshot={(i) => activeSession && restoreMapSnapshot(activeSession.id, i)}
              onFixLive={arreglarErroresEnVivo}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        chatArea
      )}

      {/* Vista previa móvil */}
      <Sheet open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <SheetContent side="right" className="w-full border-border/60 p-0 sm:max-w-full">
          <SheetTitle className="sr-only">Vista previa</SheetTitle>
          {previewCode && (
            <PreviewPanel
              code={previewCode}
              source={previewMsg?.content ?? null}
              title={activeSession?.title ?? null}
              streaming={previewStreaming}
              onClose={() => setMobilePreviewOpen(false)}
              map={activeSession?.projectMap ?? null}
              onClearMap={() => activeSession && setProjectMap(activeSession.id, null)}
              onAddNote={(t) => activeSession && addProjectNote(activeSession.id, t)}
              onRemoveNote={(i) => activeSession && removeProjectNote(activeSession.id, i)}
              onRestoreSnapshot={(i) => activeSession && restoreMapSnapshot(activeSession.id, i)}
              onFixLive={arreglarErroresEnVivo}
            />
          )}
        </SheetContent>
      </Sheet>

      <PromptLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onPick={(text) => setInput(text)}
      />
      <SkillsDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
      <FreeRadarDialog
        open={radarOpen}
        onOpenChange={setRadarOpen}
        onOpenSettings={(pid) => {
          if (pid) setFocusProvider(pid as ProviderId);
          setRadarOpen(false);
          setSettingsOpen(true);
        }}
      />
      <GitHubDialog
        open={githubOpen}
        onOpenChange={setGithubOpen}
        initial={githubInitial}
        onInitialConsumed={() => setGithubInitial(null)}
      />
      <RepoStudioDialog
        open={reposOpen}
        onOpenChange={setReposOpen}
        initialUrl={repoSeedUrl}
        onInitialConsumed={() => setRepoSeedUrl(null)}
        onOpenInSandbox={(seed) => {
          setReposOpen(false);
          setSandboxInitial(seed);
          setSandboxOpen(true);
        }}
      />
      <SandboxStudio
        open={sandboxOpen}
        onOpenChange={setSandboxOpen}
        initial={sandboxInitial}
        onInitialConsumed={() => setSandboxInitial(null)}
        onPublish={(seed) => {
          // del Sandbox a la subida: el proyecto ya corregido, sin pasar por el disco
          setSandboxOpen(false);
          setGithubInitial(seed);
          setGithubOpen(true);
        }}
      />
      <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
      <ModelArenaDialog open={arenaOpen} onOpenChange={setArenaOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <UsagePanel open={usageOpen} onOpenChange={setUsageOpen} />
      <QuotaPanel open={quotaOpen} onOpenChange={setQuotaOpen} />
      <FailuresPanel open={failuresOpen} onOpenChange={setFailuresOpen} />
      {vaultEnabled && !vaultUnlocked && <VaultLockDialog open />}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(v) => {
          setSettingsOpen(v);
          if (!v) setFocusProvider(null);
        }}
        focusProvider={focusProvider}
      />
    </div>
  );
}

/** Auto resuelto y cuota del proveedor, solo cuando hay dato medido. */
function ChipsDeEstado({ modelKey }: { modelKey: string | null }) {
  const lastGood = useHealth((h) => h.lastGood);
  const byProvider = useQuota((q) => q.byProvider);

  const auto = !!modelKey && isAutoKey(modelKey);
  const resuelto = auto && lastGood ? splitModelKey(lastGood.key) : null;

  // El proveedor del que hablamos: el que resolvió Auto, o el elegido a mano.
  const pid = resuelto?.providerId ?? (modelKey ? splitModelKey(modelKey)?.providerId : undefined);
  const resumen = pid ? resumenCuota(byProvider[pid]) : null;
  const tono = resumen ? tonoCuota(resumen.pct) : null;

  if (!resuelto && !resumen) return null;

  return (
    <div className="hidden items-center gap-1.5 md:flex">
      {resuelto && (
        <span
          className="max-w-[190px] truncate rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[10.5px] text-muted-foreground"
          title={`Auto está usando ${resuelto.modelId} de ${resuelto.providerId}. Es el último que respondió bien.`}
        >
          Auto → <span className="font-mono text-foreground/80">{resuelto.modelId}</span>
        </span>
      )}
      {resumen && tono && (
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[10.5px] font-medium",
            tono === "critico" && "bg-red-500/12 text-red-500",
            tono === "justo" && "bg-amber-500/12 text-amber-600 dark:text-amber-400",
            tono === "ok" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          )}
          title={`Queda el ${resumen.pct}% de tu límite de ${resumen.cubo} en este proveedor. Medido de las cabeceras que él mismo manda.`}
        >
          {resumen.pct}% <span className="opacity-70">{resumen.cubo}</span>
        </span>
      )}
    </div>
  );
}
