"use client";
/** Prism AI — App principal: chat + vista previa en vivo + agente con bucles + mapa del proyecto
 * + Arena A/B, modo imagen, documentos (PDF), atajos de teclado, bóveda PIN y lista virtualizada. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileDown, FileText, Globe, Menu, Settings, Swords } from "lucide-react";
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
import type { SandboxSeed } from "@/lib/prism/sandbox";
import { OnboardingDialog } from "./onboarding";
import { PreviewPanel } from "./preview-panel";
import { Welcome } from "./welcome";
import { ThemeToggle } from "./theme-toggle";
import { InstallButton, registerServiceWorker } from "./pwa";
import { PrismLogo } from "./logo";
import { ModelArenaDialog } from "./model-arena";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { UsagePanel } from "./usage-panel";
import { VaultLockDialog } from "./vault-lock";
import { usePrism, uid } from "@/lib/prism/store";
import { streamChat } from "@/lib/prism/chat-client";
import { fileToAttachment } from "@/lib/prism/attachments";
import { extractPreviewHtml } from "@/lib/prism/preview";
import { agentPrompt, parseAgentTrace } from "@/lib/prism/agent-loop";
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
import {
  splitModelKey,
  makeModelKey,
  isAutoKey,
  type Attachment,
  type DocText,
  type ProviderId,
} from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { isQuotaError, pickFailoverCandidate, buildAutoChain } from "@/lib/prism/free-models";
import { useHealth, cooldownRemaining, statusFromError, retryAfterFromError } from "@/lib/prism/health";
import { useUsage } from "@/lib/prism/usage";
import { compressHistory, savingsPercent, type CompressionMode } from "@/lib/prism/compress";
import { maskPII, PII_LABELS } from "@/lib/prism/pii";
import { unseenRadarCount } from "@/lib/prism/free-radar";
import { cn } from "@/lib/utils";

export function ChatApp() {
  // hidratación
  const hydrated = usePrism((s) => s.hydrated);

  const sessions = usePrism((s) => s.sessions);
  const activeId = usePrism((s) => s.activeSessionId);
  const providers = usePrism((s) => s.providers);
  const settings = usePrism((s) => s.settings);

  const ensureSession = usePrism((s) => s.ensureSession);
  const createSession = usePrism((s) => s.createSession);
  const setActiveSession = usePrism((s) => s.setActiveSession);
  const addMessage = usePrism((s) => s.addMessage);
  const updateMessage = usePrism((s) => s.updateMessage);
  const deleteMessage = usePrism((s) => s.deleteMessage);
  const truncateAfter = usePrism((s) => s.truncateAfter);
  const setProjectMap = usePrism((s) => s.setProjectMap);
  const setSettings = usePrism((s) => s.setSettings);

  const [input, setInput] = useState("");
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [reposOpen, setReposOpen] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [sandboxInitial, setSandboxInitial] = useState<SandboxSeed | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [focusProvider, setFocusProvider] = useState<ProviderId | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  // adjuntos del borrador actual
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [docs, setDocs] = useState<DocText[]>([]);
  const [attaching, setAttaching] = useState(false);

  // bóveda de claves (PIN)
  const vaultEnabled = useVault((s) => s.enabled);
  const vaultUnlocked = useVault((s) => s.unlocked);

  // vista previa
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const autoOpenedForRef = useRef<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** referencia fresca a runGeneration para reintentos de failover (evita dependencia circular) */
  const runGenRef = useRef<((sessionId: string, depth?: number) => Promise<void>) | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  const modelKey = activeSession?.modelKey ?? settings.defaultModelKey;

  const setModelKey = useCallback(
    (key: string) => {
      const state = usePrism.getState();
      if (state.activeSessionId) {
        state.sessions
          .filter((s) => s.id === state.activeSessionId)
          .forEach((s) => {
            usePrism.setState((st) => ({
              sessions: st.sessions.map((x) => (x.id === s.id ? { ...x, modelKey: key } : x)),
            }));
          });
      }
      state.setSettings({ defaultModelKey: key });
    },
    []
  );

  // Registrar SW al montar + arrancar la bóveda (desbloqueo silencioso si toca)
  useEffect(() => {
    registerServiceWorker();
    initVault();
  }, []);

  // Tema de acento: aplica el elegido en Ajustes → Apariencia
  useEffect(() => {
    if (!hydrated) return;
    applyAccent(settings.accent, settings.accentCustom);
  }, [hydrated, settings.accent, settings.accentCustom]);

  // Notificación del radar: avisa de novedades de modelos gratis al abrir la app
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      // en la primera visita lo manda el asistente de bienvenida, no el radar
      if (!usePrism.getState().onboardingDone) return;
      const unseen = unseenRadarCount(usePrism.getState().radarSeenIds);
      if (unseen > 0) {
        toast(`Radar de gratis: ${unseen} novedad${unseen > 1 ? "es" : ""}`, {
          description: "Kimi K3 gratis en AiHubMix y más ofertas vigentes.",
          action: { label: "Ver radar", onClick: () => setRadarOpen(true) },
          duration: 9000,
        });
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [hydrated]);

  // Guía inicial: se abre sola en la primera visita
  useEffect(() => {
    if (!hydrated) return;
    if (usePrism.getState().onboardingDone) return;
    const t = setTimeout(() => setOnboardingOpen(true), 600);
    return () => clearTimeout(t);
  }, [hydrated]);

  // Atajo: acción=nueva desde el manifest
  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "new") {
      ensureSession();
      history.replaceState(null, "", "/");
    }
  }, [ensureSession]);

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

  // auto-abrir al aparecer HTML nuevo; cerrar si ya no hay
  useEffect(() => {
    if (previewMsg && previewMsg.id !== autoOpenedForRef.current) {
      autoOpenedForRef.current = previewMsg.id;
      setPreviewOpen(true);
    }
    if (!previewMsg) setPreviewOpen(false);
  }, [previewMsg]);

  // ——— Adjuntos (imágenes) y documentos (PDF/TXT) ———
  const attachFiles = useCallback(
    async (files: File[]) => {
      setAttaching(true);
      try {
        const images = files.filter((f) => f.type.startsWith("image/"));
        const documents = files.filter(
          (f) => f.type === "application/pdf" || f.type === "text/plain" || /\.(txt|md)$/i.test(f.name)
        );

        // documentos: extrae el texto localmente (pdf.js / texto plano)
        const docRoom = Math.max(0, 3 - docs.length);
        for (const f of documents.slice(0, docRoom)) {
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
        if (documents.length > docRoom) {
          toast.info(`Máximo 3 documentos por mensaje`);
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
    setAttachments((cur) => cur.filter((a) => a.id !== id));
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

  /** Instrucciones finales = system prompt + estilo de salida + skills + agente + mapa */
  const composeSettings = useCallback((sessionId?: string) => {
    const st = usePrism.getState();
    let systemPrompt = st.settings.systemPrompt.trim();

    // Estilos de salida (output styles de OmniRoute)
    if (st.settings.outputStyle === "conciso") {
      systemPrompt +=
        "\n\n[Estilo: conciso] Responde TERSE y directo: sin relleno, sin preámbulos ni despedidas, sin repetir la pregunta. Frases cortas. El código y los datos técnicos se conservan exactos.";
    } else if (st.settings.outputStyle === "detallado") {
      systemPrompt +=
        "\n\n[Estilo: detallado] Responde de forma completa y pedagógica: explica el razonamiento paso a paso, incluye ejemplos y advierte los errores comunes.";
    }

    const activeSkills = st.skills.filter((s) => s.enabled);
    if (activeSkills.length) {
      const skillsBlock = activeSkills
        .map((s) => `### Skill activa: ${s.name}\n${s.instructions}`)
        .join("\n\n");
      systemPrompt += `\n\n${skillsBlock}`;
    }

    if (st.settings.agentMode) {
      systemPrompt += `\n\n${agentPrompt(st.settings.agentMaxLoops)}`;
    }

    // Mapa del proyecto: memoria compacta para que la IA no relea todo el código
    const session = sessionId ? st.sessions.find((s) => s.id === sessionId) : null;
    if (session) {
      const map = session.projectMap ?? deriveMapFromMessages(session.messages);
      const mapBlock = renderMapForPrompt(map);
      if (mapBlock) systemPrompt += `\n\n${mapBlock}`;
    }

    return { ...st.settings, systemPrompt };
  }, []);

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
  /** Failover gratis: si un proveedor agotó su cuota, reintenta con otro modelo gratis conectado.
   * Los modelos en cooldown (salud) se saltan automáticamente. */
  const attemptFailover = useCallback(
    (sessionId: string, failedProviderId: ProviderId, failedAssistantId: string) => {
      const st = usePrism.getState();
      const candidate = pickFailoverCandidate(st.providers, failedProviderId, (pid, mid) => {
        const h = useHealth.getState().entries[makeModelKey(pid, mid)];
        return cooldownRemaining(h) > 0;
      });
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
      toast.warning(`Cuota gratis agotada en ${failedName}`, {
        description: `Reintentando automáticamente con ${candidate.modelId} · ${targetName}. El modelo quedó cambiado.`,
        duration: 10000,
      });
      deleteMessage(sessionId, failedAssistantId);
      setModelKey(makeModelKey(candidate.providerId, candidate.modelId));
      void runGenRef.current?.(sessionId, 1);
    },
    [deleteMessage, setModelKey]
  );

  /** Ejecuta una generación a partir del estado actual de la sesión.
   * Con el modelo «Auto» recorre una cadena de candidatos gratis (LKGP primero)
   * saltando los que estén en cooldown y avanzando al siguiente si fallan. */
  const runGeneration = useCallback(
    async (sessionId: string, depth = 0) => {
      const state = usePrism.getState();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session) return;

      // clave fresca del store (importante tras un failover que cambió el modelo)
      const freshKey = session.modelKey ?? state.settings.defaultModelKey ?? undefined;
      const auto = isAutoKey(freshKey);

      // ——— cadena de candidatos ———
      type Candidate = { providerId: ProviderId; modelId: string };
      let chain: Candidate[] = [];
      if (auto) {
        const health = useHealth.getState();
        chain = buildAutoChain(
          state.providers,
          health.lastGood?.key ?? null,
          (pid, mid) => cooldownRemaining(health.entries[makeModelKey(pid, mid)]) > 0
        );
        if (chain.length === 0) {
          toast.error("Auto no tiene modelos disponibles", {
            description: "Conecta al menos un proveedor gratis (Gemini, Groq, OpenRouter…) en Ajustes.",
            action: { label: "Abrir", onClick: () => { setFocusProvider("gemini"); setSettingsOpen(true); } },
          });
          return;
        }
      } else {
        const resolved = resolveModel(freshKey);
        if (!resolved) return;
        chain = [resolved];
      }

      const assistantId = uid();
      addMessage(sessionId, {
        id: assistantId,
        role: "assistant",
        content: "",
        model: `${chain[0].providerId}::${chain[0].modelId}`,
        createdAt: Date.now(),
      });
      setStreamingMsgId(assistantId);

      // ——— historial + escudo PII + compresión de contexto ———
      const history = session.messages
        .filter((m) => m.role !== "system" && !m.error)
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
      const trimmed = comp.messages;
      const origChars = base.reduce((a, m) => a + m.content.length, 0);
      const savedPct =
        comp.savedChars > 400 && origChars > 0 ? savingsPercent(origChars, comp.savedChars) : 0;

      const controller = new AbortController();
      abortRef.current = controller;
      const startedAt = Date.now();

      let content = "";
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
          content = "";
          reasoning = "";
          if (ci > 0) {
            // reutiliza la misma burbuja con el nuevo modelo
            updateMessage(sessionId, assistantId, {
              content: "",
              reasoning: undefined,
              model: `${candidate.providerId}::${candidate.modelId}`,
              error: false,
            });
          }
          try {
            await streamChat({
              providerId: candidate.providerId,
              config: usePrism.getState().providers[candidate.providerId],
              modelId: candidate.modelId,
              messages: trimmed,
              settings: composeSettings(sessionId),
              signal: controller.signal,
              onDelta: (text) => {
                content = text;
                paint();
              },
              onReasoning: (r) => {
                reasoning = r;
                paint();
              },
              onDone: () => {},
            });
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
            const hasNext = ci + 1 < chain.length;
            // Auto avanza en cualquier fallo; modelo manual solo en 5xx/408/red (failover de cuota va aparte)
            const transient = status === 0 || status === 408 || status >= 500;
            if (auto && hasNext) {
              toast.warning(`Auto: ${candidate.modelId} falló`, {
                description: `Saltando a ${chain[ci + 1].modelId} · ${PROVIDER_MAP[chain[ci + 1].providerId]?.name ?? ""}`,
                duration: 6000,
              });
              continue;
            }
            if (!auto && hasNext && transient && depth === 0) {
              toast.warning(`${candidate.modelId} no respondió`, {
                description: `Reintentando con ${chain[ci + 1].modelId}.`,
                duration: 6000,
              });
              continue;
            }
            updateMessage(sessionId, assistantId, {
              content: msg,
              error: true,
              elapsedMs: Date.now() - attemptStart,
            });
            if (status === 402 || (isQuotaError(msg) && depth === 0 && !content)) {
              attemptFailover(sessionId, candidate.providerId, assistantId);
            }
            break;
          }

          // ——— éxito del stream ———
          paint(true);
          const finalSplit = splitThinkTags(content, reasoning);
          content = finalSplit.content;
          reasoning = finalSplit.reasoning;
          const elapsed = Date.now() - attemptStart;

          // Failover: algunos proveedores responden 200 con el aviso de cuota como texto
          const quotaInText = content.length > 0 && content.length < 600 && isQuotaError(content);
          if (quotaInText) {
            const key = makeModelKey(candidate.providerId, candidate.modelId);
            useHealth.getState().recordFailure(key, 402);
            settle(candidate, false, elapsed);
            const hasNext = ci + 1 < chain.length;
            if (hasNext && (auto || depth === 0)) {
              updateMessage(sessionId, assistantId, { content: "", reasoning: undefined });
              toast.warning(
                `${auto ? "Auto" : candidate.modelId}: cuota agotada`,
                {
                  description: `Saltando a ${chain[ci + 1].modelId}.`,
                  duration: 6000,
                }
              );
              continue;
            }
            attemptFailover(sessionId, candidate.providerId, assistantId);
            return;
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
    [addMessage, updateMessage, deleteMessage, resolveModel, composeSettings, updateProjectMap, attemptFailover]
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

  const send = useCallback(
    (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text && attachments.length === 0 && docs.length === 0) return;
      const sessionId = ensureSession();
      const state = usePrism.getState();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (text && !docs.length && session?.messages.some((m) => m.role === "user" && m.content === text && !m.attachments?.length)) {
        // evitar doble envío accidental (solo texto idéntico sin adjuntos)
        setInput("");
        return;
      }
      if (imageMode && text) {
        setInput("");
        void sendImage(text);
        return;
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
      void runGeneration(sessionId);
    },
    [input, attachments, docs, imageMode, ensureSession, addMessage, runGeneration, sendImage]
  );

  const regenerate = useCallback(
    (msgId: string) => {
      if (!activeSession || streamingMsgId) return;
      // elimina la respuesta y regenera desde el historial truncado
      truncateAfter(activeSession.id, msgId);
      deleteMessage(activeSession.id, msgId);
      void runGeneration(activeSession.id);
    },
    [activeSession, streamingMsgId, truncateAfter, deleteMessage, runGeneration]
  );

  const editUserMessage = useCallback(
    (msgId: string, newContent: string) => {
      if (!activeSession) return;
      updateMessage(activeSession.id, msgId, { content: newContent });
      truncateAfter(activeSession.id, msgId);
      void runGeneration(activeSession.id);
    },
    [activeSession, updateMessage, truncateAfter, runGeneration]
  );

  const stop = () => {
    abortRef.current?.abort();
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
  const showPreviewPane = previewOpen && !!previewCode;

  const chatArea = (
    <main className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* Cabecera */}
      <header className="glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 lg:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir conversaciones"
        >
          <Menu className="size-4.5" />
        </Button>
        <ModelPicker value={modelKey} onChange={setModelKey} />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setArenaOpen(true)}
          aria-label="Arena de modelos"
          title="Arena: compara 2-3 modelos gratis (Ctrl+Shift+A)"
        >
          <Swords className="size-4" />
        </Button>
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
                  downloadSessionHtml(activeSession);
                  toast.success("Prism Link creado — comparte el .html con quien quieras");
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
                  printSessionPdf(activeSession);
                  toast.info("Elige «Guardar como PDF» en el diálogo");
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
        {previewCode && (
          <Button
            variant="ghost"
            size="icon"
            className="relative size-8 lg:hidden"
            onClick={() => setMobilePreviewOpen(true)}
            aria-label="Ver vista previa"
          >
            <Eye className={cn("size-4", previewStreaming && "text-prism-cyan")} />
            {previewStreaming && (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-prism-cyan" />
            )}
          </Button>
        )}
        <InstallButton compact />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ajustes"
        >
          <Settings className="size-4" />
        </Button>
      </header>

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
                    onRegenerate={m.role === "assistant" ? () => regenerate(m.id) : undefined}
                    onDelete={
                      streamingMsgId !== m.id ? () => deleteMessage(activeSession!.id, m.id) : undefined
                    }
                    onEdit={m.role === "user" ? (c) => editUserMessage(m.id, c) : undefined}
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
        imageMode={imageMode}
        onToggleImageMode={() => setImageMode((v) => !v)}
        docs={docs}
        onRemoveDoc={removeDoc}
        placeholder={
          imageMode
            ? "Describe la imagen que quieres generar…"
            : previewOpen
              ? "Pide cambios para la página… se verán en la vista previa"
              : settings.agentMode
                ? "Agente activo: planear → ejecutar → revisar en bucles…"
                : undefined
        }
      />
    </main>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar escritorio */}
      <aside className="hidden w-[280px] shrink-0 border-r border-border/60 lg:block">
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
          <ResizablePanel defaultSize={45} minSize={25}>
            <PreviewPanel
              code={previewCode}
              streaming={previewStreaming}
              onClose={() => setPreviewOpen(false)}
              map={activeSession?.projectMap ?? null}
              onClearMap={() => activeSession && setProjectMap(activeSession.id, null)}
              onAddNote={(t) => activeSession && addProjectNote(activeSession.id, t)}
              onRemoveNote={(i) => activeSession && removeProjectNote(activeSession.id, i)}
              onRestoreSnapshot={(i) => activeSession && restoreMapSnapshot(activeSession.id, i)}
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
              streaming={previewStreaming}
              onClose={() => setMobilePreviewOpen(false)}
              map={activeSession?.projectMap ?? null}
              onClearMap={() => activeSession && setProjectMap(activeSession.id, null)}
              onAddNote={(t) => activeSession && addProjectNote(activeSession.id, t)}
              onRemoveNote={(i) => activeSession && removeProjectNote(activeSession.id, i)}
              onRestoreSnapshot={(i) => activeSession && restoreMapSnapshot(activeSession.id, i)}
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
      <GitHubDialog open={githubOpen} onOpenChange={setGithubOpen} />
      <RepoStudioDialog
        open={reposOpen}
        onOpenChange={setReposOpen}
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
      />
      <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
      <ModelArenaDialog open={arenaOpen} onOpenChange={setArenaOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <UsagePanel open={usageOpen} onOpenChange={setUsageOpen} />
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
