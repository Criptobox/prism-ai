"use client";
/** Prism AI — App principal: chat + vista previa en vivo + agente con bucles + mapa del proyecto */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileDown, FileText, Menu, Settings } from "lucide-react";
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
import { OnboardingDialog } from "./onboarding";
import { PreviewPanel } from "./preview-panel";
import { Welcome } from "./welcome";
import { ThemeToggle } from "./theme-toggle";
import { InstallButton, registerServiceWorker } from "./pwa";
import { PrismLogo } from "./logo";
import { usePrism, uid } from "@/lib/prism/store";
import { streamChat } from "@/lib/prism/chat-client";
import { fileToAttachment } from "@/lib/prism/attachments";
import { extractPreviewHtml } from "@/lib/prism/preview";
import { agentPrompt, parseAgentTrace } from "@/lib/prism/agent-loop";
import { applyAccent } from "@/lib/prism/accent";
import { downloadSessionMarkdown, printSessionPdf } from "@/lib/prism/export-chat";
import { speak, stopSpeaking } from "@/lib/prism/speech";
import {
  deriveProjectMap,
  deriveMapFromMessages,
  mergeProjectMap,
  parseMapJson,
  renderMapForPrompt,
} from "@/lib/prism/project-map";
import { splitModelKey, makeModelKey, type Attachment, type ProviderId } from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { isQuotaError, pickFailoverCandidate } from "@/lib/prism/free-models";
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
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [focusProvider, setFocusProvider] = useState<ProviderId | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // adjuntos del borrador actual
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);

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

  // Registrar SW al montar
  useEffect(() => {
    registerServiceWorker();
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

  // ——— Adjuntos ———
  const attachFiles = useCallback(async (files: File[]) => {
    setAttaching(true);
    try {
      const room = Math.max(0, 6 - attachments.length);
      if (room === 0) {
        toast.error("Máximo 6 imágenes por mensaje");
        return;
      }
      const slice = files.slice(0, room);
      const converted: Attachment[] = [];
      for (const f of slice) {
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
  }, [attachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((cur) => cur.filter((a) => a.id !== id));
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
      if (!cfg.apiKey.trim() && split.providerId !== "ollama") {
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

  /** Instrucciones finales = system prompt + skills + agente (bucles) + mapa del proyecto */
  const composeSettings = useCallback((sessionId?: string) => {
    const st = usePrism.getState();
    let systemPrompt = st.settings.systemPrompt.trim();

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
          setProjectMap(sessionId, map);
        }
      } catch {
        /* el mapa es best-effort: nunca rompe el chat */
      }
    },
    [setProjectMap]
  );

  /** Failover gratis: si un proveedor agotó su cuota, reintenta con otro modelo gratis conectado */
  const attemptFailover = useCallback(
    (sessionId: string, failedProviderId: ProviderId, failedAssistantId: string) => {
      const st = usePrism.getState();
      const candidate = pickFailoverCandidate(st.providers, failedProviderId);
      const failedName = PROVIDER_MAP[failedProviderId]?.name ?? failedProviderId;
      if (!candidate) {
        toast.error(`${failedName} se quedó sin cuota gratis`, {
          description: "No hay otro proveedor conectado. Conecta Gemini, Groq u OpenRouter (gratis) en Ajustes.",
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

  /** Ejecuta una generación a partir del estado actual de la sesión */
  const runGeneration = useCallback(
    async (sessionId: string, depth = 0) => {
      const state = usePrism.getState();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session) return;

      // clave fresca del store (importante tras un failover que cambió el modelo)
      const freshKey = session.modelKey ?? state.settings.defaultModelKey ?? undefined;
      const resolved = resolveModel(freshKey);
      if (!resolved) return;

      const assistantId = uid();
      addMessage(sessionId, {
        id: assistantId,
        role: "assistant",
        content: "",
        model: `${resolved.providerId}::${resolved.modelId}`,
        createdAt: Date.now(),
      });
      setStreamingMsgId(assistantId);

      const history = session.messages
        .filter((m) => m.role !== "system" && !m.error)
        .map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        }));
      const cw = usePrism.getState().settings.contextWindow;
      const trimmed = cw > 0 ? history.slice(-cw) : history;

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
        updateMessage(sessionId, assistantId, {
          content,
          reasoning: reasoning || undefined,
        });
      };

      try {
        await streamChat({
          providerId: resolved.providerId,
          config: usePrism.getState().providers[resolved.providerId],
          modelId: resolved.modelId,
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
        paint(true);
        updateMessage(sessionId, assistantId, {
          content,
          reasoning: reasoning || undefined,
          elapsedMs: Date.now() - startedAt,
        });
        // Failover: algunos proveedores responden 200 con el aviso de cuota como texto
        if (depth === 0 && content.length > 0 && content.length < 600 && isQuotaError(content)) {
          attemptFailover(sessionId, resolved.providerId, assistantId);
          return;
        }
        updateProjectMap(sessionId, content);
        // Lectura automática de la respuesta (Ajustes → Chat)
        if (usePrism.getState().settings.autoSpeak && content.trim()) {
          speak({ text: content });
        }
      } catch (err) {
        paint(true);
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        if (aborted) {
          if (content) {
            updateMessage(sessionId, assistantId, {
              content: content + "\n\n_(detenido)_",
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
          // Failover automático en errores de cuota/límite (ej. AiHubMix «solo 10 intentos»)
          if (depth === 0 && !content && isQuotaError(msg)) {
            attemptFailover(sessionId, resolved.providerId, assistantId);
          }
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

  const send = useCallback(
    (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text && attachments.length === 0) return;
      const sessionId = ensureSession();
      const state = usePrism.getState();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (text && session?.messages.some((m) => m.role === "user" && m.content === text && !m.attachments?.length)) {
        // evitar doble envío accidental (solo texto idéntico sin adjuntos)
        setInput("");
        return;
      }
      addMessage(sessionId, {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
        ...(attachments.length ? { attachments } : {}),
      });
      setInput("");
      setAttachments([]);
      stickToBottomRef.current = true;
      void runGeneration(sessionId);
    },
    [input, attachments, ensureSession, addMessage, runGeneration]
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

  const lastAssistantId = useMemo(() => {
    if (!activeSession) return null;
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      if (activeSession.messages[i].role === "assistant") return activeSession.messages[i].id;
    }
    return null;
  }, [activeSession]);

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
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-3 py-6 sm:px-6">
            {activeSession!.messages.map((m) => (
              <MessageItem
                key={m.id}
                msg={m}
                streaming={streamingMsgId === m.id}
                isLastAssistant={m.id === lastAssistantId && !streamingMsgId}
                onRegenerate={
                  m.role === "assistant" ? () => regenerate(m.id) : undefined
                }
                onDelete={streamingMsgId !== m.id ? () => deleteMessage(activeSession!.id, m.id) : undefined}
                onEdit={m.role === "user" ? (c) => editUserMessage(m.id, c) : undefined}
              />
            ))}
            <div className="h-2" />
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
        placeholder={
          previewOpen
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
          onOpenGuide={() => setOnboardingOpen(true)}
          onOpenRepos={() => setReposOpen(true)}
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
            onOpenGuide={() => {
              setOnboardingOpen(true);
              setSidebarOpen(false);
            }}
            onOpenRepos={() => {
              setReposOpen(true);
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
      <RepoStudioDialog open={reposOpen} onOpenChange={setReposOpen} />
      <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />

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
