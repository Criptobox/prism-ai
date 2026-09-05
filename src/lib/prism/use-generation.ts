"use client";
/** Prism AI — La tubería de generación: lo que convierte un envío en respuesta.
 *
 * Tercer corte de `chat-app.tsx` (PLAN-V8 punto 1) y el grande: aquí vive
 * `runGeneration` (la cadena de candidatos, el failover con rescate de trabajo
 * a medias, la continuación de código cortado, el bucle del agente vía
 * `useAgentTools`, el checkpoint automático, la memoria de tareas), y con él
 * sus dos variantes de reparto (`runConsensus`, `runOrquesta`), el failover,
 * el relanzador y la generación de imágenes.
 *
 * Por qué un solo hook y no varios: los tres caminos COMPARTEN la misma
 * burbuja en curso (`streamingMsgId`), el mismo `AbortController` y el mismo
 * `runGenRef` para los reintentos. Partirlos sería re-crear el acoplamiento
 * que hoy está a la vista.
 *
 * Lo que NO vive aquí: todo lo que toca la pantalla (compositor, sugerencias,
 * modal de reglas, diálogos). Eso se queda en `chat-app.tsx` y entra por
 * `CtxGeneracion`. El hook lee el estado del store FRESCO (`usePrism.getState()`)
 * dentro de cada corrida — igual que hacía el componente, que es lo que permite
 * que un failover que cambió el modelo en el store siga usándolo.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { usePrism, uid } from "./store";
import {
  splitModelKey,
  makeModelKey,
  isAutoKey,
  type ProviderId,
} from "./types";
import { PROVIDER_MAP } from "./providers";
import { streamChat } from "./chat-client";
import { isQuotaError, pickFailoverCandidate, sanearOrdenFallback } from "./free-models";
import {
  buildTaskChain,
  classifyTask,
  lastUserPrompt,
  pickTaskFailover,
} from "./task-router";
import {
  useHealth,
  cooldownRemaining,
  providerCooldownRemaining,
  statusFromError,
  retryAfterFromError,
} from "./health";
import { useUsage } from "./usage";
import { estaRoto, useModelosRotos } from "./modelos-rotos";
import { permitido } from "./vetados";
import {
  avisoPrevio,
  promptDeReparto,
  parseReparto,
  promptDeEjecutor,
  promptDeVeredicto,
  estadoOrquesta,
  repartoFallido,
  EJECUTORES_POR_DEFECTO,
  type Resultado,
} from "./orquesta";
import {
  estadoPanel,
  necesitaSintesis,
  pickPanel,
  pickSintetizador,
  synthesisPrompt,
  type Panelista,
  type RespuestaPanel,
} from "./consensus";
import type { EntradaPrompt } from "./presupuesto";
import { construirPrompt } from "./presupuesto";
import { estaCortadaPorLongitud, type MotivoParada } from "./finish-reason";
import {
  hayBotonesQueCorregir,
  promptDeBotones,
  reglaDeBotones,
  resumenBotones,
} from "./prueba-botones";
import {
  hayQueCorregir,
  promptDeCorreccion,
  proyectoDeLaRespuesta,
  reglaDeFallo,
  resumenRevision,
  MAX_REVISIONES,
} from "./auto-revision";
import { runProjectInMemory } from "./sandbox-runner";
import {
  decidirTrasCuotaEnTexto,
  decidirTrasError,
  decidirTrasVacio,
  motivoDelFallo,
  tituloFailover,
  tituloSinAlternativa,
  type MotivoFailover,
} from "./decisiones";
import {
  continuarCodigoPrompt,
  respuestaCortada,
  unirContinuacion,
  type CorteInfo,
} from "./continuar";
import { agentStalled, continuePrompt, parseAgentTrace } from "./agent-loop";
import { separarEtiquetasPensamiento } from "./razonamiento";
import { buildImageUrl, preloadImage } from "./images";
import { speak } from "./speech";
import { escudoHistorial, PII_LABELS } from "./pii";
import { soloAdjuntosDelTurno } from "./adjuntos-historial";
import { esTurnoTrivial } from "./turno-trivial";
import { useFailures } from "./failures";
import { compressHistory, savingsPercent, type CompressionMode } from "./compress";
import { modoEfectivo, sumarUso, type UsoProveedor } from "./cache-prompt";
import { CONTEXTO_VACIO, hayContexto, type ContextoUsado } from "./contexto-usado";
import { checkpointAuto } from "./snapshots";
import {
  leerMemoria,
  guardarMemoria,
  addTarea as addTareaMemoria,
  addDecision as addDecisionMemoria,
  addDiseno as addDisenoMemoria,
} from "./memoria-proyecto";
import { useAgentTools } from "./use-agent-tools";
import { normalizarPermisos } from "./tool-permissions";
import type { AjustesGenerados } from "./use-system-prompt";
import type { SandboxSeed } from "./sandbox";


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
export interface SemillaFailover {
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

/** Cómo se llama cada forma de quedarse a medias en la memoria de fallos. */
const MOTIVO_PARADA: Record<string, string> = {
  "revision-pendiente": "revisión sin corregir",
  "sin-respuesta": "sin cerrar <answer>",
  cortado: "respuesta cortada a mitad de una etiqueta",
};

/** Lo que el hook necesita del componente y no puede conseguirse solo:
 * piezas que tocan la pantalla (avisos con botón, Sandbox abierto, refs cuyo
 * dueño es el marco). Todo lo demás se lo sirve el store. */
export interface CtxGeneracion {
  composeSettings: (sessionId?: string) => AjustesGenerados;
  piezasDelPrompt: (sessionId?: string) => EntradaPrompt;
  updateProjectMap: (sessionId: string, content: string) => void;
  /** seed del Sandbox abierto: checkpoint y continuación lo leen FRESCO de ctx
   * (antes quedaba clavado en la clausura del useCallback y podía ser viejo) */
  sandboxInitial: SandboxSeed | null;
  stickToBottomRef: { current: boolean };
  aplicarArchivosAgenteRef: { current: (files: Record<string, string>) => void };
  reglasAutorizadasRef: { current: string[] };
  undoMapRef: { current: Record<string, string> };
  forzarUndoRender: (update: (n: number) => number) => void;
  setRadarOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setFocusProvider: (p: ProviderId | null) => void;
  /** tamaño del borrador al contar el contexto usado (se cuenta lo ENVIADO) */
  numDocs: number;
  numAdjuntos: number;
}

export function useGeneration(ctx: CtxGeneracion) {
  const {
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
    numDocs,
    numAdjuntos,
  } = ctx;

  // mismo derivado que hacía el componente: clave del modelo en curso
  const sessions = usePrism((s) => s.sessions);
  const activeId = usePrism((s) => s.activeSessionId);
  const settings = usePrism((s) => s.settings);
  const providers = usePrism((s) => s.providers);
  const ensureSession = usePrism((s) => s.ensureSession);
  const addMessage = usePrism((s) => s.addMessage);
  const updateMessage = usePrism((s) => s.updateMessage);
  const deleteMessage = usePrism((s) => s.deleteMessage);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );
  const modelKey = activeSession?.modelKey ?? settings.defaultModelKey;

  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Bucle de tools del agente (PLAN-V4 punto 5): el probe + el bucle de
  // tool_calls + la reinyección, encapsulados. runGeneration lo llama igual
  // que lo hacía el componente.
  const { runWithTools } = useAgentTools();
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
    [modelKey, providers, setFocusProvider, setSettingsOpen]
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
      parcial = "",
      /** por qué se salta: el aviso decía siempre «cuota gratis agotada»,
       *  también con un 503 del proveedor y con una clave de pago */
      motivo: MotivoFailover = "otro"
    ) => {
      const st = usePrism.getState();
      const session = st.sessions.find((s) => s.id === sessionId);
      const task = classifyTask(lastUserPrompt(session?.messages ?? []));
      const rotos = useModelosRotos.getState().rotos;
      const vetados = st.settings.proveedoresVetados ?? [];
      const blocked = (pid: ProviderId, mid: string) => {
        const h = useHealth.getState();
        // Un proveedor vetado no recibe NADA, y el failover es el camino donde
        // más fácil se colaría: se salta solo, sin que nadie lo elija.
        if (!permitido(pid, vetados)) return true;
        // saltar a un modelo que ya sabemos que el proveedor no reconoce es
        // cambiar un error por otro
        if (estaRoto(rotos, makeModelKey(pid, mid))) return true;
        // cuota a dos niveles: el modelo enfriado Y el proveedor entero (429/402)
        if (cooldownRemaining(h.entries[makeModelKey(pid, mid)]) > 0) return true;
        return providerCooldownRemaining(h.providerEntries[pid]) > 0;
      };
      const candidate =
        pickTaskFailover(task.kind, st.providers, failedProviderId, blocked) ??
        // el orden del usuario decide la preferencia global; se sanea AL LEERLO
        // para que un orden guardado hace versiones no deje fuera a nadie
        pickFailoverCandidate(
          st.providers,
          failedProviderId,
          blocked,
          sanearOrdenFallback(st.fallbackOrder)
        );
      const failedName = PROVIDER_MAP[failedProviderId]?.name ?? failedProviderId;
      if (!candidate) {
        toast.error(tituloSinAlternativa(motivo, failedName), {
          description: "No hay otro proveedor conectado. Conecta Gemini, Groq u OpenRouter (gratis) en Ajustes, o prueba el modelo Auto.",
          action: { label: "Ver radar", onClick: () => setRadarOpen(true) },
          duration: 12000,
        });
        return;
      }
      const targetName = PROVIDER_MAP[candidate.providerId]?.name ?? candidate.providerId;
      const corte = parcial.trim().length >= MIN_RESCATE ? respuestaCortada(parcial) : null;
      const seguira = !!corte?.cortada;
      toast.warning(tituloFailover(motivo, failedName), {
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
    [deleteMessage, updateMessage, setModelKey, relanzar, setRadarOpen]
  );

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
        // …y un modelo que «Probar modelos» confirmó que el proveedor no
        // reconoce no entra en la cadena: Auto lo elegía igual y fallaba en el
        // primer intento, gastando un salto para nada.
        const rotos = useModelosRotos.getState().rotos;
        const bloqueado = (pid: ProviderId, mid: string) =>
          estaRoto(rotos, makeModelKey(pid, mid)) ||
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
      // la burbuja de la semilla se reinyecta aparte, con su instrucción de
      // continuar: si entrara aquí además, el modelo la vería dos veces
      const previos = session.messages.filter(
        (m) => m.role !== "system" && !m.error && m.id !== semilla?.assistantId
      );

      // Escudo PII (inspirado en OrcaRouter): enmascara correos/teléfonos/
      // tarjetas/IBAN/DNI en lo que ENVÍA — la burbuja que ves no cambia.
      //
      // Se aplica ANTES de pegar los adjuntos, y ese orden es el arreglo: al
      // hacerlo después, un correo dentro del HTML que subiste se enmascaraba
      // y el modelo te devolvía el archivo con el correo roto.
      const escudo = escudoHistorial(previos, usePrism.getState().settings.piiShield);

      const history = soloAdjuntosDelTurno(
        previos.map((m, i) => ({
          role: m.role,
          // los documentos adjuntos viajan como texto de contexto del mensaje,
          // tal cual: son archivos que mandaste a propósito
          content: m.docTexts?.length
            ? `${escudo.contenidos[i]}\n\n${m.docTexts.map((d) => `[Documento: ${d.name}]\n${d.text}`).join("\n\n")}`
            : escudo.contenidos[i],
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        }))
      );

      if (escudo.total > 0) {
        const tipos = escudo.tipos.map((t) => PII_LABELS[t]).join(", ");
        toast.info(
          `Escudo PII: ${escudo.total} ${escudo.total === 1 ? "dato enmascarado" : "datos enmascarados"}`,
          {
            // Decir DÓNDE: el aviso daba a entender que era en lo que acababas
            // de escribir aunque viniera de diez mensajes atrás, y con un
            // «hola» eso no hay quien lo entienda.
            description: escudo.enEsteMensaje
              ? `${tipos} en tu mensaje. Tu burbuja no cambia; solo lo que se envía.`
              : `${tipos} en mensajes anteriores de esta conversación, que viajan como contexto. Tu mensaje de ahora no tenía ninguno.`,
            duration: 6000,
          }
        );
      }
      const cw = usePrism.getState().settings.contextWindow;
      const base = cw > 0 ? history.slice(-cw) : history;
      // La compresión y la caché del prompt no pueden convivir: comprimir
      // reescribe el historial y la caché exige que el prefijo no cambie. Donde
      // hay caché gana la caché —el descuento del prefijo entero es mucho mayor
      // que unos caracteres recortados—, y se decide por el PRIMER candidato de
      // la cadena, que es el que va a responder salvo caída.
      const modoPedido: CompressionMode = usePrism.getState().settings.compression ?? "off";
      const protocoloDestino = PROVIDER_MAP[chain[0].providerId]?.protocol ?? "openai";
      const decision = modoEfectivo(modoPedido, protocoloDestino);
      const compMode: CompressionMode = decision.modo;
      // la pregunta viva (último mensaje user) no se comprime nunca
      let protectIdx = -1;
      for (let i = base.length - 1; i >= 0; i--) {
        if (base[i].role === "user") { protectIdx = i; break; }
      }
      const comp = compressHistory(base, compMode, protectIdx);

      // ——— Qué contexto viaja de verdad (PLAN-EVOLUCION §12, «Auto Context») ———
      // Las piezas del prompt ya vienen contadas de `entradaPromptActual`; aquí
      // se completa con lo que solo se sabe en este punto: cuántos mensajes
      // sobreviven al recorte y qué se adjuntó. Se cuenta lo que SE ENVÍA, no
      // lo que hay guardado: el historial puede tener cien mensajes y viajar
      // cuarenta.
      const piezas = piezasDelPrompt(sessionId);
      const contextoUsado: ContextoUsado = {
        ...(piezas.usado ?? CONTEXTO_VACIO),
        // sin contar el mensaje que el usuario acaba de escribir
        mensajes: Math.max(0, base.length - 1),
        documentos: numDocs,
        imagenes: numAdjuntos,
        chars: construirPrompt(piezas).prompt.length,
      };
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
        const s = separarEtiquetasPensamiento(content, reasoning);
        updateMessage(sessionId, assistantId, {
          content: s.contenido,
          reasoning: s.razonamiento || undefined,
        });
      };

      // Lo que el proveedor dice que gastó en ESTE intento. Se reinicia por
      // candidato: si el primero falla y responde el segundo, la cuenta del
      // caído no puede acabar sumada al que respondió.
      let usoDelIntento: UsoProveedor | null = null;

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
            uso: usoDelIntento,
            // el tipo de encargo viaja con la métrica: sin esto, el panel
            // puede decir cuánto gastó un modelo pero no EN QUÉ, que es lo
            // que se decide («esto lo hago con el gratis»)
            tarea: task.kind,
          });
        } else {
          useUsage
            .getState()
            .record({ modelKey: key, ok: false, charsIn: origChars, tarea: task.kind, uso: usoDelIntento });
        }
      };

      try {
        for (let ci = 0; ci < chain.length; ci++) {
          const candidate = chain[ci];
          const attemptStart = Date.now();
          content = base0;
          reasoning = "";
          usoDelIntento = null;
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
            // El modo agente NO se aplica a un saludo. Sin esto, «Hola» en
            // una conversación sobre una web se contestaba con el bucle
            // entero —plan, pasos y un «he actualizado index.html» que nadie
            // pidió—, porque el modelo recibía la plantilla y el catálogo de
            // herramientas igual que en un encargo. Aquí se le quitan las dos.
            const ultimoUsuario = [...(usePrism.getState().sessions.find((x) => x.id === sessionId)?.messages ?? [])]
              .reverse()
              .find((m) => m.role === "user");
            const agentOn =
              usePrism.getState().settings.agentMode &&
              !esTurnoTrivial(ultimoUsuario?.content ?? "");
            const maxLoops = Math.max(1, Math.min(8, usePrism.getState().settings.agentMaxLoops || 3));
            const cfg = usePrism.getState().providers[candidate.providerId];
            // ——— Checkpoint automático (Pilar 1.3) ———
            // Antes de CADA tarea del agente (la primera, no sus reintentos),
            // se guarda un punto de restauración con los archivos actuales.
            // Sin esto, «deshacer lo que hizo el agente» era rehacerlo a mano.
            if (agentOn && depth === 0 && revisiones === 0 && continuaciones === 0 && sandboxInitial?.files?.length) {
              const filesActuales = Object.fromEntries(
                sandboxInitial.files.map((f) => [f.path, f.content])
              );
              const cp = checkpointAuto(
                filesActuales,
                `antes de: ${(ultimoUsuario?.content ?? "tarea").slice(0, 60)}`,
                sessionId
              );
              if (cp) {
                undoMapRef.current[assistantId] = cp.id;
                forzarUndoRender((n) => n + 1);
              }
            }
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
                // La cuenta del proveedor (tokens y aciertos de caché). Es lo
                // único que no es estimación nuestra, y es lo que se enseña
                // para saber si la caché del prompt está sirviendo de algo.
                onUsage: (u) => {
                  // Se SUMA: cada vuelta del bucle del agente es una llamada
                  // aparte, y quedarse con la última reportaría el gasto de
                  // una sola.
                  usoDelIntento = sumarUso(usoDelIntento, u);
                },
                onDone: () => {},
              },
              agentOn,
              maxLoops,
              sandboxInitial,
              cfg,
              // v3.32: lo que el agente escribe/edita/restaura en el bucle
              // llega al Sandbox como seed. Va por ref (mismo patrón que
              // runGenRef) para que runGeneration no se re-crear cada vez
              // que cambia el estado del Sandbox.
              aplicarArchivosAgenteRef.current,
              // Mapa de la sesión para `ask_memory`: se lee del store en este
              // momento (no de una captura vieja) para que el agente consulte
              // lo que hay AHORA, incluidas las notas del turno anterior.
              usePrism.getState().sessions.find((x) => x.id === sessionId)?.projectMap ?? null,
              // Permisos del agente, también frescos del store: si el usuario
              // acaba de apagar «Salir a internet», este envío ya lo respeta.
              normalizarPermisos(usePrism.getState().settings.permisosAgente),
              // Y lo que ha prohibido tocar, también del store en este momento:
              // una regla que acaba de crear tiene que valer para este envío.
              // …salvo las que el usuario AUTORIZÓ en el modal de este turno.
              usePrism.getState().sessions.find((x) => x.id === sessionId)?.reglasNo ?? [],
              reglasAutorizadasRef.current
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
                content,
                motivoDelFallo(status, isQuotaError(msg))
              );
            }
            break;
          }

          // ——— éxito del stream ———
          paint(true);
          const finalSplit = separarEtiquetasPensamiento(content, reasoning);
          content = finalSplit.contenido;
          reasoning = finalSplit.razonamiento;
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
                base0,
                "cuota"
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
                base0,
                "otro"
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
            ...(escudo.total > 0 ? { piiMasked: escudo.total } : {}),
            ...(hayContexto(contextoUsado) ? { contexto: contextoUsado } : {}),
          });
          updateProjectMap(sessionId, content);
          // ——— Task DNA + memoria del proyecto (plan técnico §4, Pilar 3) ———
          // Cada encargo terminado se guarda como tarea estructurada: objetivo,
          // modelo, reintentos y archivos. Es lo que alimenta la recomendación
          // de modelo y lo que viaja a `.prism/tasks.json` al subir a GitHub.
          {
            const objetivo = lastUserPrompt(session.messages) || "(continuación)";
            const respuesta = parseAgentTrace(content);
            const infoAdelantada = agentStalled(respuesta, true);
            const archivosTocados = Array.from(
              new Set(
                [...respuesta.blocks.flatMap((b) => ("body" in b ? [b.body] : []))]
                  .join("\n")
                  .match(/[\w./-]+\.(html?|css|js|jsx|ts|tsx|json|md|svg|py|mjs|cjs)/g) ?? []
              )
            ).slice(0, 8);
            const mem = leerMemoria(sessionId);
            let memNueva = addTareaMemoria(mem, objetivo, {
              modelo: `${candidate.providerId}::${candidate.modelId}`,
              estado: infoAdelantada.stalled ? "failed" : "done",
              reintentos: revisiones,
              ...(archivosTocados.length ? { archivos: archivosTocados } : {}),
            });
            // Las decisiones del modelo (notas del <project-map>) entran en la
            // memoria: sin esto, «tema principal: azul» vivía solo en el mapa.
            if (respuesta.mapJson) {
              try {
                const parsed = JSON.parse(respuesta.mapJson) as { notes?: string[] };
                for (const nota of (parsed.notes ?? []).slice(0, 3)) {
                  memNueva = addDecisionMemoria(memNueva, nota, "modelo", "global");
                }
              } catch {
                /* mapa corrupto: la tarea ya quedó guardada, no rompe nada */
              }
            }
            // Y la dirección de diseño usada, si el turno era de UI nueva
            // (variación forzada: la próxima web no repetirá esta).
            const dirUsada = contextoUsado.diseno;
            if (dirUsada) {
              memNueva = addDisenoMemoria(
                memNueva,
                dirUsada,
                `usada en: ${objetivo.slice(0, 40)}`
              );
            }
            guardarMemoria(sessionId, memNueva);
          }
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
            const s = separarEtiquetasPensamiento(content, reasoning);
            updateMessage(sessionId, assistantId, {
              content: s.contenido + "\n\n_(detenido)_",
              reasoning: s.razonamiento || undefined,
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
    [addMessage, updateMessage, deleteMessage, resolveModel, composeSettings, piezasDelPrompt, updateProjectMap, attemptFailover, relanzar, sandboxInitial, numDocs, numAdjuntos, setFocusProvider, setSettingsOpen, aplicarArchivosAgenteRef, reglasAutorizadasRef, undoMapRef, forzarUndoRender, runWithTools]
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
    [ensureSession, addMessage, updateMessage, stickToBottomRef]
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
        vetados: st.settings.proveedoresVetados ?? [],
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
    [addMessage, updateMessage, composeSettings, runGeneration, stickToBottomRef]
  );

  /**
   * Un director reparte, varios ejecutan, el director da el veredicto.
   *
   * El director es TU modelo actual —el que hayas elegido, típicamente el
   * bueno— y los ejecutores salen del panel de gratis. Esa es la gracia: el
   * que razona y verifica es el que pagas; los baratos hacen trabajo acotado.
   *
   * El coste está acotado por diseño y no por suerte: `2 + n` llamadas y se
   * acabó. No hay bucle, no hay «una ronda más», y el número se dice ANTES de
   * arrancar (ver `orquesta.ts`).
   */
  const runOrquesta = useCallback(
    async (sessionId: string, encargo: string) => {
      const director = resolveModel();
      if (!director) {
        toast.error("Elige primero el modelo que va a dirigir", {
          description: "El director es el modelo que tengas seleccionado: normalmente, el mejor que tengas.",
        });
        return;
      }

      // Ejecutores: gratis y de OTROS proveedores. Repetir el del director
      // sería pagarle dos veces por el mismo sesgo.
      const h = useHealth.getState();
      const ejecutores = pickPanel(usePrism.getState().providers, {
        vetados: usePrism.getState().settings.proveedoresVetados ?? [],
        max: EJECUTORES_POR_DEFECTO,
        soloGratis: true,
        favoritos: usePrism.getState().favorites,
        enCooldown: (k) => {
          if (cooldownRemaining(h.entries[k]) > 0) return true;
          const split = splitModelKey(k);
          return split ? providerCooldownRemaining(h.providerEntries[split.providerId]) > 0 : false;
        },
      }).filter((e) => e.providerId !== director.providerId);

      if (!ejecutores.length) {
        toast.warning("No hay ejecutores disponibles", {
          description:
            "Hacen falta modelos gratis de OTRO proveedor distinto al del director. Conecta uno en Ajustes → Proveedores. Mientras tanto se responde de la forma normal.",
          duration: 10_000,
        });
        void runGeneration(sessionId);
        return;
      }

      const aviso = avisoPrevio(ejecutores.length, encargo);
      const assistantId = uid();
      addMessage(sessionId, {
        id: assistantId,
        role: "assistant",
        content: "",
        model: makeModelKey(director.providerId, director.modelId),
        createdAt: Date.now(),
      });
      setStreamingMsgId(assistantId);
      stickToBottomRef.current = true;
      // El número de llamadas se dice ANTES, no después: es lo que convierte
      // esto en una herramienta y no en una ruleta.
      toast.info(`Dirigiendo a ${ejecutores.length} modelos`, { description: aviso.texto });

      const controller = new AbortController();
      abortRef.current = controller;
      const empezó = Date.now();
      const pintar = (t: string) => updateMessage(sessionId, assistantId, { content: `_${t}_` });

      /** Una llamada suelta, sin streaming: aquí solo interesa el texto final. */
      const preguntar = async (
        quien: { providerId: ProviderId; modelId: string },
        prompt: string
      ): Promise<string> =>
        streamChat({
          providerId: quien.providerId,
          config: usePrism.getState().providers[quien.providerId],
          modelId: quien.modelId,
          messages: [{ role: "user", content: prompt }],
          settings: { ...composeSettings(sessionId), stream: false },
          signal: controller.signal,
          onDelta: () => {},
          onDone: () => {},
        });

      try {
        // ——— 1. El director reparte ———
        pintar(estadoOrquesta("repartiendo"));
        const repartoTexto = await preguntar(director, promptDeReparto(encargo, ejecutores.length));
        const subs = parseReparto(repartoTexto, ejecutores.length);

        // Un reparto ilegible no para el trabajo: se hace del tirón. Gastar la
        // llamada del director para acabar sin respuesta sería lo peor de los
        // dos mundos.
        if (repartoFallido(subs)) {
          toast.info("El director no pudo repartir el trabajo", {
            description: "Se responde de la forma normal, sin equipo.",
          });
          deleteMessage(sessionId, assistantId);
          setStreamingMsgId(null);
          abortRef.current = null;
          void runGeneration(sessionId);
          return;
        }

        // ——— 2. Los ejecutores, en paralelo ———
        let hechos = 0;
        pintar(estadoOrquesta("ejecutando", 0, subs.length));
        const resultados: Resultado[] = await Promise.all(
          subs.map(async (sub, i) => {
            const quien = ejecutores[i % ejecutores.length];
            const t0 = Date.now();
            try {
              // El ejecutor recibe SU trozo y nada más: ni la conversación, ni
              // lo de los demás. Más barato y menos superficie.
              const texto = await preguntar(quien, promptDeEjecutor(sub));
              useHealth.getState().recordSuccess(makeModelKey(quien.providerId, quien.modelId));
              return { sub, quien, texto, ms: Date.now() - t0 };
            } catch (err) {
              useHealth
                .getState()
                .recordFailure(makeModelKey(quien.providerId, quien.modelId), statusFromError(err));
              return {
                sub,
                quien,
                texto: "",
                error: err instanceof Error ? err.message : "no respondió",
                ms: Date.now() - t0,
              };
            } finally {
              hechos++;
              pintar(estadoOrquesta("ejecutando", hechos, subs.length));
            }
          })
        );

        // ——— 3. El director revisa y cierra ———
        pintar(estadoOrquesta("veredicto"));
        let salida = "";
        await streamChat({
          providerId: director.providerId,
          config: usePrism.getState().providers[director.providerId],
          modelId: director.modelId,
          messages: [{ role: "user", content: promptDeVeredicto(encargo, resultados) }],
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

        const entregaron = resultados.filter((r) => !r.error && r.texto.trim()).length;
        updateMessage(sessionId, assistantId, {
          content: salida,
          elapsedMs: Date.now() - empezó,
          orquesta: { ejecutores: subs.length, entregaron, llamadas: aviso.llamadas },
        });
        updateProjectMap(sessionId, salida);
      } catch (err) {
        const abortada = err instanceof DOMException && err.name === "AbortError";
        if (!abortada) {
          updateMessage(sessionId, assistantId, {
            content: err instanceof Error ? err.message : "Falló la dirección del equipo",
            error: true,
          });
        }
      } finally {
        setStreamingMsgId(null);
        abortRef.current = null;
      }
    },
    [addMessage, updateMessage, deleteMessage, composeSettings, resolveModel, runGeneration, updateProjectMap, stickToBottomRef]
  );

  return {
    runGeneration,
    runConsensus,
    runOrquesta,
    sendImage,
    setModelKey,
    streamingMsgId,
    setStreamingMsgId,
    abortRef,
  };
}
