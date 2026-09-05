"use client";
/** Prism AI — App principal: chat + vista previa en vivo + agente con bucles + mapa del proyecto
 * + Arena A/B, modo imagen, documentos (PDF), atajos de teclado, bóveda PIN y lista virtualizada. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Download,
  Eye,
  FileDown,
  FileText,
  Globe,
  History,
  Maximize2,
  Menu,
  Minimize2,
  ScrollText,
  Settings,
  ShieldAlert,
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
import { SnippetsDialog } from "./snippets-dialog";
import { TemplatesDialog } from "./templates-dialog";
import { WrappedDialog } from "./wrapped-dialog";
import { PresentationDialog } from "./presentation-dialog";
import { SkillsDialog } from "./skills-dialog";
import { FreeRadarDialog } from "./free-radar";
import { GitHubDialog } from "./github-dialog";
import { RepoStudioDialog } from "./repo-dialog";
import { SandboxStudio } from "./sandbox-studio";
import { ConvoTabs } from "./convo-tabs";
import { abrirTab, cerrarTab } from "@/lib/prism/tabs";
import type { PublishSeed, SandboxSeed } from "@/lib/prism/sandbox";
import { OnboardingDialog } from "./onboarding";
import { PreviewPanel } from "./preview-panel";
import { PANTALLA_ESTRECHA, useMediaQuery } from "@/lib/prism/use-media-query";
import { Welcome } from "./welcome";
import { registerServiceWorker } from "./pwa";
import { BannerVersionNueva } from "./app-update";
import { PrismLogo } from "./logo";
import { ModelArenaDialog } from "./model-arena";
import { SystemPanel } from "./panel-sistema";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { UsagePanel } from "./usage-panel";
import { FailuresPanel } from "./failures-panel";
import { VaultLockDialog } from "./vault-lock";
import { usePrism, uid } from "@/lib/prism/store";
import { migrateLegacyAttachments } from "@/lib/prism/attachment-blob";
import { useChatAttachments } from "@/lib/prism/use-chat-attachments";
import { useGeneration } from "@/lib/prism/use-generation";
import { mereceOrquesta } from "@/lib/prism/orquesta";
import { skillsSugeridas, textoSugerencia } from "@/lib/prism/skills-sugeridas";
import { anchorAt } from "@/lib/prism/branches";
import { ThreadBar } from "./thread-bar";
import { extractPreviewHtml } from "@/lib/prism/preview";
import {
  DEMO_MODEL,
  DEMO_PROMPT,
  DEMO_TITLE,
  decideDemo,
  demoReply,
  typeDemoReply,
} from "@/lib/prism/preview-demo";
import { useSystemPrompt } from "@/lib/prism/use-system-prompt";
import { estimarTokensConversacion, VENTANA_DEFECTO } from "@/lib/prism/ctx-hud";
import { agentStalled, continuePrompt, parseAgentTrace, suggestAgentMode } from "@/lib/prism/agent-loop";
import { applyAccent } from "@/lib/prism/accent";
import {
  downloadSessionHtml,
  downloadSessionMarkdown,
  printSessionPdf,
} from "@/lib/prism/export-chat";
import { stopSpeaking } from "@/lib/prism/speech";
import { recapPrompt, translatePrompt, type TargetLang } from "@/lib/prism/recap";
import { useFocusMode } from "@/lib/prism/focus-mode";
import type { SlashCommand } from "@/lib/prism/slash";
import { initVault, useVault } from "@/lib/prism/vault";
import {
  addNote as addMapNote,
  deriveProjectMap,
  mergeProjectMap,
  parseMapJson,
  removeNote as removeMapNote,
  withHistory,
} from "@/lib/prism/project-map";
import {
  splitModelKey,
  isAutoKey,
  AUTO_MODEL_KEY,
  pickManualModel,
  type ProviderId,
} from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { esTurnoTrivial } from "@/lib/prism/turno-trivial";
import { classifyTask } from "@/lib/prism/task-router";
import { useHealth } from "@/lib/prism/health";
import { resumenCuota, tonoCuota, useQuota } from "@/lib/prism/quota";
import { useUsage } from "@/lib/prism/usage";
import { unseenRadarCount } from "@/lib/prism/free-radar";
import { extractRepoFromText, isMostlyRepoLink } from "@/lib/prism/repo-cloud";
import { cn } from "@/lib/utils";
import {
  checkpointAuto,
  obtenerSnapshot,
  archivosDeSnapshot,
} from "@/lib/prism/snapshots";
import { leerMemoria } from "@/lib/prism/memoria-proyecto";
import { recomendarModelo } from "@/lib/prism/recomendacion";
import {
  buscarContexto as buscarContextoTurno,
  hayContextoTurno as hayContextoTurnoFn,
} from "@/lib/prism/auto-contexto";
import { reglaQueBloquea } from "@/lib/prism/reglas-no";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SnapshotsPanel } from "./snapshots-panel";
import { RepasoDialog } from "./repaso-dialog";
import { OfertasDialog } from "./ofertas-dialog";
import { useRepaso } from "@/lib/prism/repaso-store";
import { useOfertas } from "@/lib/prism/ofertas-store";
import { extraerTarjetas, fechaHoy, PROMPT_REPASO, resumenRepaso } from "@/lib/prism/repaso";
import { fusionarOfertas, novedadesOfertas, OFERTAS_BASE } from "@/lib/prism/ofertas";
import { MemoriaPanel } from "./memoria-panel";

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
  const clearMessages = usePrism((s) => s.clearMessages);
  const setProjectMap = usePrism((s) => s.setProjectMap);
  const addReglaNo = usePrism((s) => s.addReglaNo);
  const removeReglaNo = usePrism((s) => s.removeReglaNo);
  const setSettings = usePrism((s) => s.setSettings);

  const [input, setInput] = useState("");
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
  /** U3 plantillas: URL de un ZIP público que el Sandbox carga al abrirse. */
  const [sandboxInitialZipUrl, setSandboxInitialZipUrl] = useState<string | null>(null);
  /** «/orquesta» arma el modo director para el SIGUIENTE envío y se apaga solo.
   * Es una acción puntual y cara (2 + n llamadas): dejarla encendida haría que
   * el siguiente «gracias» costara seis llamadas. */
  const [orquestaArmada, setOrquestaArmada] = useState(false);
  /** Rutas del proyecto abierto en el Sandbox. Solo se usan para enseñar a qué
   * afectaría una regla ANTES de crearla: una regla que no casa con nada da
   * una falsa sensación de protección. */
  const rutasDelSandbox = useMemo(
    () => (sandboxInitial?.files ?? []).map((f) => f.path),
    [sandboxInitial]
  );

  /** pestañas abiertas (D2, PLAN-V7): ids de conversación. Lo abre el
   * efecto de abajo cuando cambia la activa; no se persiste — abrir la
   * app es como abrir el navegador de nuevo, sin pestañas. */
  const [tabsAbiertas, setTabsAbiertas] = useState<string[]>([]);
  const [githubInitial, setGithubInitial] = useState<PublishSeed | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [focusProvider, setFocusProvider] = useState<ProviderId | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [failuresOpen, setFailuresOpen] = useState(false);
  // U2-U6 (PLAN-V7): diálogos de utilidad que abre el slash (/snip, /plantillas,
  // /wrapped, /presentar). Cada uno se encarga de su propio estado interno.
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [repasoOpen, setRepasoOpen] = useState(false);
  const [ofertasOpen, setOfertasOpen] = useState(false);
  /** modo foco (zen): solo la conversación, recordado entre sesiones */
  const [focusMode, toggleFocusMode] = useFocusMode();

  // adjuntos del borrador actual: el hook encapsula el estado y el I/O
  // (ZIP, hojas, PDF, imágenes). Segundo corte de chat-app (PLAN-V8).
  const {
    attachments,
    docs,
    attaching,
    attachFiles,
    removeAttachment,
    removeDoc,
    clearDraft,
  } = useChatAttachments();

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

  const demoCancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** Evita un doble Enter / doble toque; no bloquea repetir el mismo texto más tarde. */
  const lastSendAtRef = useRef(0);
  /** referencia fresca al volcado de archivos del agente (v3.32):
   * runGeneration lo usa por ref para no depender del estado del Sandbox */
  const aplicarArchivosAgenteRef = useRef<(files: Record<string, string>) => void>(() => {});
  /** Reglas «no tocar» que el usuario AUTORIZÓ para el envío en curso
   * (modal de memoria negativa). Vale para un turno: send() lo limpia al
   * empezar, así que no se filtra al siguiente. */
  const reglasAutorizadasRef = useRef<string[]>([]);
  /** messageId → snapshotId: el checkpoint automático que se hizo ANTES de
   * esa respuesta del agente. Es lo que restaura el botón «Deshacer». */
  const undoMapRef = useRef<Record<string, string>>({});
  const [, forzarUndoRender] = useState(0);
  /** modal de memoria negativa: reglas afectadas + decisión del usuario */
  const [modalReglas, setModalReglas] = useState<{
    afectadas: { id: string; patron: string; motivo: string; path: string }[];
    decidir: (opcion: "cancelar" | "una-vez" | "desactivar") => void;
  } | null>(null);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [memoriaOpen, setMemoriaOpen] = useState(false);

  // ——— La tubería de generación (tercer corte, PLAN-V8) ———
  // Todo lo que convierte un envío en respuesta vive en `use-generation.ts`:
  // la cadena de candidatos de Auto, el failover con rescate del trabajo a
  // medias, la continuación de código cortado, el bucle del agente, el
  // consenso y la orquesta. Aquí queda el marco: qué se ve, qué se pulsa y
  // qué se le pasa por contexto. Va PRONTO en el componente porque el efecto
  // del demo y la vista previa ya usan `streamingMsgId`.
  const { piezasDelPrompt, composeSettings } = useSystemPrompt();

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

  const {
    runGeneration,
    runConsensus,
    runOrquesta,
    sendImage,
    setModelKey,
    streamingMsgId,
    setStreamingMsgId,
    abortRef,
  } = useGeneration({
    composeSettings,
    piezasDelPrompt,
    updateProjectMap,
    sandboxInitial,
    stickToBottomRef,
    aplicarArchivosAgenteRef,
    reglasAutorizadasRef,
    undoMapRef,
    forzarUndoRender,
    setRadarOpen,
    setSettingsOpen,
    setFocusProvider,
    numDocs: docs.length,
    numAdjuntos: attachments.length,
  });

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  const modelKey = activeSession?.modelKey ?? settings.defaultModelKey;

  // La conversación que se activa (por mensaje nuevo, sidebar o failover)
  // pasa a ser una pestaña abierta. En un useEffect y no dentro de los
  // manejadores: hay muchos caminos que cambian la activa y todos
  // tendrían que acordarse de abrir la pestaña.
  useEffect(() => {
    if (activeId) setTabsAbiertas((t) => abrirTab(t, activeId));
  }, [activeId]);

  /** Última conversación con mensajes (D3, PLAN-V7): la que el welcome
   * ofrece retomar. Sin mensajes no hay nada que retomar y la fila no
   * se pinta: no se ofrece «continuar» una conversación que no existe. */
  const reciente = useMemo(() => {
    const conMensajes = sessions.filter((s) => s.messages.length > 0);
    if (!conMensajes.length) return null;
    const ultima = conMensajes.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
    return { id: ultima.id, title: ultima.title };
  }, [sessions]);


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

  /** v3.32 — Recoge el proyecto tal y como lo deja el agente al final de
   * cada tanda de herramientas (escribe, edita, restaura snapshots).
   *
   * Hasta ahora lo que el agente escribía con write_file vivía solo en
   * la memoria de ESA vuelta del bucle: ni llegaba al Sandbox ni
   * sobrevivía a la iteración siguiente. Ahora el bucle comparte un
   * contexto y este callback lo vuelca.
   *
   * Sandbox CERRADO → seed normal: al abrirlo, está lo último del agente.
   * Sandbox ABIERTO → no se machaca el editor debajo del usuario: se
   * guarda como pendiente y se ofrece con un toast con botón. */
  const aplicarArchivosAgente = useCallback(
    (files: Record<string, string>) => {
      const entradas = Object.entries(files);
      if (!entradas.length) return;
      const seed: SandboxSeed = {
        name: sandboxInitial?.name ?? "proyecto del agente",
        files: entradas.map(([path, content]) => ({ path, content })),
      };
      if (sandboxOpen) {
        // no se machaca el editor por debajo del usuario: se ofrece y él decide
        toast.info("El agente actualizó el proyecto", {
          description: `${entradas.length} archivo(s) listos para el Sandbox.`,
          action: {
            label: "Cargar",
            onClick: () => setSandboxInitial(seed),
          },
        });
      } else {
        setSandboxInitial(seed);
      }
    },
    [sandboxOpen, sandboxInitial?.name]
  );
  aplicarArchivosAgenteRef.current = aplicarArchivosAgente;

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

      // ——— Memoria negativa: gate ANTES de ejecutar (plan técnico §3) ———
      // Si el encargo nombra archivos protegidos por una regla, se pausa y se
      // pregunta: [Cancelar] [Autorizar una vez] [Autorizar y desactivar].
      // Antes esto solo pasaba cuando el agente YA había chocado contra la
      // regla — tarde y con tokens gastados.
      reglasAutorizadasRef.current = [];
      const proceder = () => {
        addMessage(sessionId, {
          id: uid(),
          role: "user",
          content: text,
          createdAt: Date.now(),
          ...(attachments.length ? { attachments } : {}),
          ...(docs.length ? { docTexts: docs } : {}),
        });
        setInput("");
        clearDraft();
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
        if (orquestaArmada) {
          setOrquestaArmada(false);
          // Un encargo de tres palabras no se reparte: serían seis llamadas para
          // no ganar nada, y dos de ellas del modelo que pagas.
          if (mereceOrquesta(text)) {
            void runOrquesta(sessionId, text);
            return;
          }
          toast.info("Ese encargo es demasiado corto para repartirlo", {
            description: "Se responde de la forma normal: repartirlo costaría más de lo que aporta.",
          });
        }
        if (usePrism.getState().settings.consensus) {
          void runConsensus(sessionId, text);
          return;
        }
        void runGeneration(sessionId);
      };
      if (
        usePrism.getState().settings.agentMode &&
        text &&
        !esTurnoTrivial(text) &&
        session?.reglasNo?.length
      ) {
        const pathsMencionados = [
          ...(text.match(/[\w./-]+\.(html?|css|js|jsx|ts|tsx|json|md|svg|py|mjs|cjs)/g) ?? []),
          ...(sandboxInitial?.files ?? []).map((f) => f.path),
        ];
        const afectadas: { id: string; patron: string; motivo: string; path: string }[] = [];
        const vistosR = new Set<string>();
        for (const p of pathsMencionados) {
          const r = reglaQueBloquea(session.reglasNo, p);
          if (r && !vistosR.has(r.id)) {
            vistosR.add(r.id);
            afectadas.push({ id: r.id, patron: r.patron, motivo: r.motivo, path: p });
          }
        }
        if (afectadas.length) {
          setModalReglas({
            afectadas,
            decidir: (opcion) => {
              setModalReglas(null);
              if (opcion === "una-vez") {
                reglasAutorizadasRef.current = afectadas.map((a) => a.id);
                proceder();
              } else if (opcion === "desactivar") {
                for (const a of afectadas) removeReglaNo(sessionId, a.id);
                reglasAutorizadasRef.current = [];
                proceder();
              }
            },
          });
          return;
        }
      }

      proceder();
    },
    [input, attachments, docs, imageMode, agentSugerido, ensureSession, addMessage, runGeneration, runConsensus, runOrquesta, orquestaArmada, sendImage, setSettings, sandboxInitial, removeReglaNo]
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
        case "orquesta":
          setOrquestaArmada(true);
          toast.success("Modo director armado", {
            description:
              "Escribe el encargo. Tu modelo actual lo repartirá entre modelos gratis, revisará lo que vuelva y cerrará. Vale para este envío.",
            duration: 8_000,
          });
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
        case "snip":
          setSnippetsOpen(true);
          break;
        case "plantillas":
          setTemplatesOpen(true);
          break;
        case "wrapped":
          setWrappedOpen(true);
          break;
        case "repaso":
          setRepasoOpen(true);
          break;
        case "ofertas":
          setOfertasOpen(true);
          break;
        case "presentar": {
          if (!previewCode) {
            toast.error("Nada que presentar todavía", {
              description: "Genera primero una página en la vista previa.",
            });
            break;
          }
          setPresentationOpen(true);
          break;
        }
      }
    },
    [imageMode, setSettings, summarizeHere, createSession, previewCode]
  );

  /** Guarda en la biblioteca de repaso las tarjetas que trae una respuesta
   * (bloque prism-repaso). Las propuestas ya vienen filtradas y deduplicadas
   * por `extraerTarjetas`; las duplicadas no tocan el progreso de la vieja. */
  const guardarRepaso = useCallback(
    (msgId: string) => {
      const msg = activeSession?.messages.find((m) => m.id === msgId);
      if (!msg) return;
      const propuestas = extraerTarjetas(msg.content);
      if (!propuestas.length) return;
      const { guardadas, duplicadas } = useRepaso.getState().añadir(propuestas, activeSession?.title);
      if (guardadas > 0) {
        toast.success(
          guardadas === 1 ? "1 tarjeta guardada" : `${guardadas} tarjetas guardadas`,
          {
            description:
              duplicadas > 0
                ? `${duplicadas} ${duplicadas === 1 ? "duplicada saltada" : "duplicadas saltadas"}. Escribe /repaso para estudiarlas.`
                : "Escribe /repaso para estudiarlas el día que toca.",
          }
        );
      } else {
        toast.info("Nada nuevo que guardar", {
          description: `Las ${duplicadas} ${duplicadas === 1 ? "tarjeta ya estaba" : "tarjetas ya estaban"} en tu biblioteca.`,
        });
      }
    },
    [activeSession]
  );

  /** La cola de vencidas para la insignia de la barra lateral. Se recalcula
   * cuando cambia la biblioteca: en la práctica basta (se mueve al calificar
   * o al guardar), y evita re-render por un reloj que casi nadie mira. */
  const tarjetasRepaso = useRepaso((s) => s.tarjetas);
  const repasoVencidas = useMemo(
    () => resumenRepaso(tarjetasRepaso, fechaHoy()).vencidas,
    [tarjetasRepaso]
  );

  /** Del diálogo vacío al compositor: deja listo el encargo de examen. */
  const prepararRepaso = useCallback(() => {
    setInput(PROMPT_REPASO);
    setRepasoOpen(false);
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  }, []);

  /** Caza de ofertas: novedades sin ver para la insignia de la barra lateral. */
  const ofertasNuevas = useOfertas((s) => s.nuevasIds.length);

  /** Comprobación diaria de la Caza de ofertas, UNA vez por día local. Dif
   * contra lo ya conocido: lo nuevo entra en la insignia y en el toast, lo
   * que está por expirar avisa solo una vez (el store recuerda a quién ya
   * avisó). Si hay permiso del navegador, el aviso sale también fuera de la
   * pestaña. Con las ofertas solo en localStorage y sin servidor, aquí no
   * sale del dispositivo nada. */
  useEffect(() => {
    const st = useOfertas.getState();
    const hoy = fechaHoy();
    if (st.ultimaComprobacion === hoy) return;
    const todas = fusionarOfertas(OFERTAS_BASE, st.ofertasFeed);
    const { nuevas, porExpirar } = novedadesOfertas(
      new Set(st.conocidasIds),
      new Set(st.avisadasIds),
      todas,
      hoy,
      st.ajustes.diasAviso
    );
    st.registrarComprobacion({
      idsActuales: todas.map((o) => o.id),
      nuevas: nuevas.map((o) => o.id),
      porExpirar: porExpirar.map((o) => o.id),
      hoy,
    });
    if (!nuevas.length && !porExpirar.length) return;
    const lineas = [
      ...nuevas.map((o) => `Nueva: ${o.proveedor} — ${o.titulo}`),
      ...porExpirar.map((o) => `Termina pronto: ${o.proveedor} — ${o.titulo}`),
    ]
      .slice(0, 3)
      .join("\n");
    toast.info(
      nuevas.length === 1 ? "Nueva oferta cazada" : `${nuevas.length} ofertas cazadas`,
      { description: lineas }
    );
    if (st.ajustes.notificaciones && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Prism AI · Caza de ofertas", { body: lineas });
      } catch {
        // en algunos navegadores móviles el constructor exige service worker:
        // el toast dentro de la app ya avisó
      }
    }
    // Solo al montar: la cadencia la manda `ultimaComprobacion`, no el reloj.
  }, []);

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

  // ——— Deshacer una respuesta del agente (Pilar 1.3) ———
  // Cada respuesta del agente con archivos delante tiene su checkpoint
  // automático. Restaurarlo es UN clic en la burbuja; el toast avisa de que
  // se puede volver a rehacer porque el checkpoint del estado roto también
  // queda guardado en el panel de puntos de restauración.
  const deshacerMensaje = useCallback(
    (msgId: string) => {
      const snapId = undoMapRef.current[msgId];
      if (!snapId) return;
      const snap = obtenerSnapshot(snapId);
      if (!snap) {
        toast.error("Ese punto de restauración ya no existe", {
          description: "Puede que se haya sustituido por checkpoints más recientes.",
        });
        return;
      }
      // checkpoint del estado ACTUAL antes de deshacer: deshacer es reversible
      const actual = Object.fromEntries(
        (sandboxInitial?.files ?? []).map((f) => [f.path, f.content])
      );
      if (Object.keys(actual).length) {
        checkpointAuto(actual, "estado antes de deshacer", activeId ?? undefined);
      }
      aplicarArchivosAgenteRef.current(archivosDeSnapshot(snap));
      toast.success("Cambio deshecho", {
        description: `Proyecto vuelto a: ${snap.mensaje}`,
      });
    },
    [sandboxInitial, activeId]
  );

  // ——— Recomendación de modelo con porqué (Pilar 4) ———
  // Se calcula de lo que hay en el compositor mientras escribes. Sin llamada
  // extra: la clasificación es local y la razón sale del historial real.
  const hasMessages = !!activeSession && activeSession.messages.length > 0;
  const recomendacion = useMemo(() => {
    const t = input.trim();
    if (t.length < 25 || esTurnoTrivial(t) || !hasMessages) return null;
    return recomendarModelo(t, providers, {
      keyless: ["ollama", "lmstudio", "llamacpp", "jan", "vllm", "mlx", "llamafile"],
      historialUso: useUsage.getState().byModel,
      memoria: activeId ? leerMemoria(activeId) : null,
    });
  }, [input, providers, activeId, hasMessages]);

  // ——— Auto Context: resumen pre-envío (plan técnico §2.4) ———
  const contextoPre = useMemo(() => {
    const t = input.trim();
    if (t.length < 10 || !activeSession) return null;
    const c = buscarContextoTurno(t, {
      archivosDisponibles: (activeSession.projectMap?.files ?? []).map((f) => f.name),
      mapa: activeSession.projectMap ?? null,
      memoria: activeId ? leerMemoria(activeId) : null,
      reglas: activeSession.reglasNo ?? [],
    });
    return hayContextoTurnoFn(c) ? c : null;
  }, [input, activeSession, activeId]);

  // archivos reales del Sandbox, para las citas de evidencia (Evidence Mode)
  const sandboxFilesMap = useMemo(
    () =>
      Object.fromEntries((sandboxInitial?.files ?? []).map((f) => [f.path, f.content])),
    [sandboxInitial]
  );
  const sessionModelKey = activeSession?.modelKey ?? settings.defaultModelKey ?? null;

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
        {/* Puntos de restauración (Pilar 1.3): checkpoints automáticos del
            agente y restauración de un clic con diff antes de aceptar. */}
        {hasMessages && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-8 lg:inline-flex"
            onClick={() => setSnapshotsOpen(true)}
            aria-label="Puntos de restauración"
            title="Puntos de restauración del proyecto: deshacer cambios del agente"
          >
            <History className="size-4" />
          </Button>
        )}
        {/* Memoria del proyecto (Pilar 3): decisiones, errores, tareas y
            diseño — lo que el agente sabe de este proyecto. */}
        {hasMessages && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-8 lg:inline-flex"
            onClick={() => setMemoriaOpen(true)}
            aria-label="Memoria del proyecto"
            title="Memoria del proyecto: decisiones, errores, tareas y diseño"
          >
            <Brain className="size-4" />
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

      {/* Pestañas de conversación (D2, PLAN-V7): solo escritorio, solo
          cuando hay alguna abierta. Cerrar la pestaña NO borra la
          conversación: la cierra, como un navegador. */}
      <ConvoTabs
        sessions={sessions.map((s) => ({ id: s.id, title: s.title }))}
        tabs={tabsAbiertas}
        activeId={activeId}
        onSelect={setActiveSession}
        onClose={(id) => {
          const r = cerrarTab(tabsAbiertas, id, activeId);
          setTabsAbiertas(r.tabs);
          if (r.cambioActivo) setActiveSession(r.siguiente);
        }}
        onNew={() => setActiveSession(null)}
      />

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
        style={{
          /* Fondo del chat: degradado sutil del tema activo. Usa los
           * acentos de marca (violeta y cian) muy diluidos sobre el
           * fondo, así cambia con el acento que el usuario elija en
           * Ajustes (esmeralda, ámbar, rosa, cian, naranja…) y queda
           * bien en claro y oscuro. La dirección diagonal le da vida
           * sin distraer de los mensajes. */
          background:
            "linear-gradient(160deg, color-mix(in oklab, var(--prism-violet) 6%, transparent) 0%, transparent 38%, color-mix(in oklab, var(--prism-cyan) 5%, transparent) 100%)",
        }}
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
            recent={reciente}
            onResume={(id) => setActiveSession(id)}
            onOpenRadar={() => setRadarOpen(true)}
            onFill={(t) => {
              setInput(t);
              requestAnimationFrame(() => {
                document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
              });
            }}
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
                    onGuardarRepaso={
                      m.role === "assistant" &&
                      !m.error &&
                      streamingMsgId !== m.id &&
                      extraerTarjetas(m.content).length > 0
                        ? () => guardarRepaso(m.id)
                        : undefined
                    }
                    onTranslate={
                      m.role === "assistant" && !m.error && !streamingMsgId
                        ? (lang) => translateMessage(m.id, lang)
                        : undefined
                    }
                    onDeshacer={
                      m.role === "assistant" && undoMapRef.current[m.id] && !streamingMsgId
                        ? () => deshacerMensaje(m.id)
                        : undefined
                    }
                    sandboxFiles={sandboxFilesMap}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Entrada */}
      {/* ——— Pre-envío: Auto Context y recomendación (Pilares 2 y 4) ——— */}
      {(contextoPre || recomendacion) && (
        <div className="mx-auto w-full max-w-3xl px-3 sm:px-6">
          {contextoPre && (
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium">Contexto que se usará:</span>
              {contextoPre.archivos.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {contextoPre.archivos.length} archivo(s)
                </span>
              )}
              {contextoPre.decisiones.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {contextoPre.decisiones.length} decisión(es)
                </span>
              )}
              {contextoPre.errores.length > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                  {contextoPre.errores.length} error(es) previo(s)
                </span>
              )}
              {contextoPre.reglas.length > 0 && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-600 dark:text-red-400">
                  {contextoPre.reglas.length} regla(s) «no tocar»
                </span>
              )}
              {contextoPre.notas.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {contextoPre.notas.length} nota(s)
                </span>
              )}
            </div>
          )}
          {recomendacion?.modelKey && (
            <div className="mb-1 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-[11px]">
              <span className="font-medium">
                Tarea: {recomendacion.etiquetaTarea}
              </span>
              <span className="text-muted-foreground">→</span>
              <code className="font-mono">{recomendacion.modelo}</code>
              <span className="text-muted-foreground" title={recomendacion.razon}>
                {recomendacion.razon}
              </span>
              {sessionModelKey !== recomendacion.modelKey && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-[11px]"
                  onClick={() => {
                    setModelKey(recomendacion.modelKey);
                    toast.success(`Modelo cambiado a ${recomendacion.modelo}`);
                  }}
                >
                  Usar
                </Button>
              )}
            </div>
          )}
        </div>
      )}
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
        hudCtx={{
          tokens: estimarTokensConversacion(activeSession?.messages ?? [], input.length),
          ventana: settings.ventanaCtx || VENTANA_DEFECTO,
        }}
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
          onOpenPanel={() => setSystemOpen(true)}
          onOpenGuide={() => setOnboardingOpen(true)}
          onOpenRepos={() => setReposOpen(true)}
          onOpenSandbox={() => setSandboxOpen(true)}
          onOpenUsage={() => setUsageOpen(true)}
          onOpenFailures={() => setFailuresOpen(true)}
          onOpenRepaso={() => setRepasoOpen(true)}
          repasoVencidas={repasoVencidas}
          onOpenOfertas={() => setOfertasOpen(true)}
          ofertasNuevas={ofertasNuevas}
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
            onOpenFailures={() => {
              setFailuresOpen(true);
              setSidebarOpen(false);
            }}
            onOpenRepaso={() => {
              setRepasoOpen(true);
              setSidebarOpen(false);
            }}
            repasoVencidas={repasoVencidas}
            onOpenOfertas={() => {
              setOfertasOpen(true);
              setSidebarOpen(false);
            }}
            ofertasNuevas={ofertasNuevas}
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
            onOpenPanel={() => {
              setSystemOpen(true);
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
              reglas={activeSession?.reglasNo ?? []}
              archivosDelProyecto={rutasDelSandbox}
              onAddRegla={(patron, motivo) =>
                activeSession && addReglaNo(activeSession.id, patron, motivo)
              }
              onRemoveRegla={(id) => activeSession && removeReglaNo(activeSession.id, id)}
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
              reglas={activeSession?.reglasNo ?? []}
              archivosDelProyecto={rutasDelSandbox}
              onAddRegla={(patron, motivo) =>
                activeSession && addReglaNo(activeSession.id, patron, motivo)
              }
              onRemoveRegla={(id) => activeSession && removeReglaNo(activeSession.id, id)}
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
        initialZipUrl={sandboxInitialZipUrl}
        onInitialZipConsumed={() => setSandboxInitialZipUrl(null)}
        onPublish={(seed) => {
          // del Sandbox a la subida: el proyecto ya corregido, sin pasar por el disco
          setSandboxOpen(false);
          setGithubInitial(seed);
          setGithubOpen(true);
        }}
      />
      <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
      <ModelArenaDialog open={arenaOpen} onOpenChange={setArenaOpen} />

      <SystemPanel open={systemOpen} onOpenChange={setSystemOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <UsagePanel open={usageOpen} onOpenChange={setUsageOpen} />
      <FailuresPanel open={failuresOpen} onOpenChange={setFailuresOpen} />
      {/* Puntos de restauración y memoria del proyecto (Pilares 1 y 3) */}
      <SnapshotsPanel
        open={snapshotsOpen}
        onOpenChange={setSnapshotsOpen}
        sessionId={activeId}
        archivosActuales={sandboxFilesMap}
        onRestaurar={(files) => {
          aplicarArchivosAgenteRef.current(files);
          toast.success("Proyecto restaurado", {
            description: "Los archivos del punto elegido vuelven al Sandbox.",
          });
        }}
      />
      <MemoriaPanel
        open={memoriaOpen}
        onOpenChange={setMemoriaOpen}
        sessionId={activeId}
        sesionTitulo={activeSession?.title}
        sandboxFiles={Object.fromEntries((sandboxInitial?.files ?? []).map((f) => [f.path, f.content]))}
      />
      <RepasoDialog open={repasoOpen} onOpenChange={setRepasoOpen} onPreparar={prepararRepaso} />
      <OfertasDialog open={ofertasOpen} onOpenChange={setOfertasOpen} />
      {/* Modal de memoria negativa: la acción del agente choca con una regla */}
      <Dialog open={!!modalReglas} onOpenChange={(o) => !o && modalReglas?.decidir("cancelar")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-500" />
              Acción que choca con una regla
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  El encargo parece afectar archivos que protejiste. El agente no podrá
                  tocarlos a menos que lo autorices:
                </p>
                {modalReglas?.afectadas.map((a) => (
                  <div key={a.id} className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                    <code className="font-mono">{a.path}</code>
                    <div className="mt-1 text-muted-foreground">
                      Regla «{a.patron}» — {a.motivo}
                    </div>
                  </div>
                ))}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" size="sm" onClick={() => modalReglas?.decidir("cancelar")}>
                Cancelar envío
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => modalReglas?.decidir("desactivar")}
              >
                Autorizar y desactivar regla
              </Button>
              <Button size="sm" onClick={() => modalReglas?.decidir("una-vez")}>
                Autorizar una vez
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {vaultEnabled && !vaultUnlocked && <VaultLockDialog open />}

      {/* U2-U6 (PLAN-V7): diálogos de utilidad que abre el slash. */}
      <SnippetsDialog
        open={snippetsOpen}
        onOpenChange={setSnippetsOpen}
        onPick={(text) => setInput(text)}
      />
      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onPick={(tpl) => {
          setSandboxInitialZipUrl(tpl.zipPath);
          setSandboxOpen(true);
        }}
      />
      <WrappedDialog open={wrappedOpen} onOpenChange={setWrappedOpen} />
      <PresentationDialog
        open={presentationOpen}
        onOpenChange={setPresentationOpen}
        html={previewCode ?? ""}
      />

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
