"use client";
/** Prism AI — Store global (zustand + persistencia localStorage, 100% local) */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppSettings,
  Attachment,
  ChatMessage,
  ProjectMap,
  PromptItem,
  ProviderConfig,
  ProviderId,
  Session,
  SkillItem,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { analyzeSkillPermissions } from "./skill-permissions";
import { PROVIDERS } from "./providers";
import { BUILTIN_PROMPTS } from "./prompts-data";
import { BUILTIN_SKILLS } from "./skills-data";
import type { FotoGratis } from "./cambio-gratis";
import {
  beginBranch,
  dropBranch,
  keepOnlyActive,
  pruneForks,
  removeThread as removeThreadIn,
  renameThread as renameThreadIn,
  startNewThread as startNewThreadIn,
  switchBranch as switchBranchIn,
  switchThread as switchThreadIn,
} from "./branches";
import { deleteBlob, clearAllBlobs } from "./attachment-blob";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function initialProviders(): Record<ProviderId, ProviderConfig> {
  return Object.fromEntries(
    PROVIDERS.map((p) => [
      p.id,
      {
        apiKey: "",
        baseUrl: p.baseUrl,
        enabled: false,
        models: [...p.defaultModels],
        useProxy: !p.directByDefault,
      } satisfies ProviderConfig,
    ])
  ) as Record<ProviderId, ProviderConfig>;
}

function newSession(): Session {
  const now = Date.now();
  return { id: uid(), title: "Nueva conversación", createdAt: now, updatedAt: now, messages: [] };
}

/** Recoge los `blobId` de todos los adjuntos de un mensaje (los que viven en
 * IndexedDB). Se usa al borrar mensajes/conversaciones para limpiar IDB en
 * segundo plano y no dejar binarios huérfanos ocupando espacio. */
function blobIdsOf(msg: ChatMessage): string[] {
  return (msg.attachments ?? [])
    .map((a) => a.blobId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Limpieza fire-and-forget: si falla, queda un huérfano en IDB, pero el
 * store sigue adelante. El usuario puede purgar todo con «Borrar todos
 * los datos» (que llama a `clearAllBlobs`). */
function purgeBlobs(ids: string[]): void {
  for (const id of ids) {
    // No await: el store es síncrono y no podemos bloquear la UI.
    void deleteBlob(id);
  }
}

/** Devuelve una copia del attachment SIN `dataUrl` (el binario vive en
 * IndexedDB bajo `blobId`). Solo se llama cuando `a.blobId` existe: si
 * no, conservamos el `dataUrl` para no perder el adjunto en sesiones
 * antiguas sin migrar o si IndexedDB falló. */
function stripDataUrl(a: Attachment): Attachment {
  const { dataUrl: _drop, ...rest } = a;
  void _drop;
  return rest;
}

/** Envoltura de localStorage que captura errores de cuota. Si `setItem`
 * lanza `QuotaExceededError` (el store entero ya no cabe), el
 * comportamiento por defecto de zustand es dejar la Promise rechazada y
 * NO reintentar — la app se queda «media rota» creyendo que persiste.
 *
 * Aquí tragamos el error: el store sigue en memoria y el usuario no
 * pierde la sesión actual. La próxima vez que algo cambie se vuelve a
 * intentar; si la cuota se alivió (p. ej. porque `partialize` ya strippó
 * un `dataUrl` grande), la escritura entra.
 *
 * Si localStorage está bloqueado del todo (modo privado estricto),
 * `getStorage` lanza: `createJSONStorage` lo atrapa y cae a memoria. */
export function safeLocalStorage(): Storage {
  // Probe: si `getItem` lanza, `createJSONStorage` captura y devuelve
  // `undefined` (almacenamiento en memoria). Es el mismo mecanismo que
  // usaba el `createJSONStorage(() => localStorage)` original, pero con
  // el `setItem` blindado contra cuota.
  void localStorage.getItem("prism-ai-v1");
  return {
    getItem: (name: string): string | null => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: string): void => {
      try {
        localStorage.setItem(name, value);
      } catch (e) {
        // Cuota llena: el usuario no pierde la sesión en curso (vive en
        // memoria), pero sí las próximas escrituras. La consola es lo
        // único que podemos mostrar sin romper la promesa del producto
        // (sin servidor, sin cuentas, sin telemetría).
        console.warn(
          "[prism] No se pudo persistir el estado en localStorage (¿cuota llena?). " +
            "Los adjuntos viven en IndexedDB; revisa la papelera de conversaciones.",
          e
        );
      }
    },
    removeItem: (name: string): void => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* noop */
      }
    },
    clear: (): void => {
      try {
        localStorage.clear();
      } catch {
        /* noop */
      }
    },
    key: (index: number): string | null => {
      try {
        return localStorage.key(index);
      } catch {
        return null;
      }
    },
    get length(): number {
      try {
        return localStorage.length;
      } catch {
        return 0;
      }
    },
  } as Storage;
}

interface PrismState {
  sessions: Session[];
  activeSessionId: string | null;
  providers: Record<ProviderId, ProviderConfig>;
  settings: AppSettings;
  favorites: string[];
  /** biblioteca de prompts */
  prompts: PromptItem[];
  /** skills instaladas */
  skills: SkillItem[];
  /** ids de novedades del radar ya vistas (badge de notificaciones) */
  radarSeenIds: string[];
  /** guía inicial ya completada (asistente de primera ejecución) */
  onboardingDone: boolean;
  hydrated: boolean;

  // sesiones
  createSession: () => string;
  ensureSession: () => string;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  clearMessages: (id: string) => void;

  // mensajes
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  updateMessage: (sessionId: string, msgId: string, patch: Partial<ChatMessage>) => void;
  deleteMessage: (sessionId: string, msgId: string) => void;
  truncateAfter: (sessionId: string, msgId: string) => void;

  // ramas: regenerar y editar bifurcan en vez de borrar
  /** Archiva la conversación desde msgId como rama; devuelve el ancla */
  branchFrom: (sessionId: string, msgId: string) => string | null;
  switchBranch: (sessionId: string, anchor: string, index: number) => void;
  dropBranch: (sessionId: string, anchor: string) => void;
  keepBranch: (sessionId: string, anchor: string) => void;

  // hilos: varios temas dentro de una misma conversación
  startThread: (sessionId: string) => void;
  switchThread: (sessionId: string, threadId: string) => void;
  removeThread: (sessionId: string, threadId: string) => void;
  renameThread: (sessionId: string, threadId: string | null, name: string) => void;
  /** guarda/actualiza el mapa del proyecto de la sesión */
  setProjectMap: (sessionId: string, map: ProjectMap | null) => void;

  // proveedores y ajustes
  setProviderConfig: (id: ProviderId, patch: Partial<ProviderConfig>) => void;
  setSettings: (patch: Partial<AppSettings>) => void;
  toggleFavorite: (modelKey: string) => void;

  // biblioteca de prompts
  addPrompt: (p: Omit<PromptItem, "id">) => string;
  updatePrompt: (id: string, patch: Partial<Omit<PromptItem, "id">>) => void;
  deletePrompt: (id: string) => void;

  // skills
  addSkill: (s: Omit<SkillItem, "id" | "enabled">) => string;
  updateSkill: (id: string, patch: Partial<Omit<SkillItem, "id">>) => void;
  removeSkill: (id: string) => void;
  toggleSkill: (id: string) => void;

  // radar de modelos gratis
  markRadarSeen: (ids: string[]) => void;
  /** añade un modelo a un proveedor sin duplicar; devuelve true si se añadió */
  addModelToProvider: (providerId: ProviderId, modelId: string) => boolean;
  /** foto del catálogo gratis (Tarea 1 del plan V6): base para avisar de lo que dejó de serlo */
  fotoGratis: FotoGratis | null;
  setFotoGratis: (f: FotoGratis) => void;
  /** orden de preferencia del failover (T2, plan V6): lista de ProviderId, no
   *  un objeto de pesos — una preferencia es un orden, no puntuaciones. Vacío
   *  = orden por defecto del código. Se sanea AL LEERLO (sanearOrdenFallback). */
  fallbackOrder: ProviderId[];
  setFallbackOrder: (orden: ProviderId[]) => void;

  // guía inicial
  setOnboardingDone: (v: boolean) => void;

  // datos
  exportData: (opts?: { includeSessions?: boolean }) => string;
  importData: (json: string) => boolean;
  /** Aplica de una vez lo recibido de otro dispositivo (ya fusionado). */
  applyTransfer: (data: {
    providers: Record<ProviderId, ProviderConfig>;
    sessions: Session[];
    settings: AppSettings;
  }) => void;
  resetAll: () => void;
  setHydrated: (v: boolean) => void;
}

export const usePrism = create<PrismState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      providers: initialProviders(),
      settings: { ...DEFAULT_SETTINGS },
      favorites: [],
      prompts: [...BUILTIN_PROMPTS],
      skills: BUILTIN_SKILLS.map((s) => ({ ...s })),
      radarSeenIds: [],
      onboardingDone: false,
      fotoGratis: null,
      setFotoGratis: (f) => set({ fotoGratis: f }),
      fallbackOrder: [],
      setFallbackOrder: (orden) => set({ fallbackOrder: orden }),
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),

      /** «Nueva conversación» ya no persiste nada: deja el lienzo en blanco y la
       * sesión se crea de verdad al enviar el primer mensaje (ensureSession).
       * Antes cada clic dejaba una «Nueva conversación» vacía en la lista. */
      createSession: () => {
        // se reaprovecha la conversación vacía que ya estuviera abierta
        const st = get();
        const vacia = st.sessions.find((s) => !s.messages.length && !s.threads?.length);
        if (vacia) {
          set({ activeSessionId: vacia.id });
          return vacia.id;
        }
        set({ activeSessionId: null });
        return "";
      },

      ensureSession: () => {
        const st = get();
        if (st.activeSessionId && st.sessions.some((s) => s.id === st.activeSessionId))
          return st.activeSessionId;
        const s = newSession();
        set({ sessions: [s, ...st.sessions], activeSessionId: s.id });
        return s.id;
      },

      deleteSession: (id) =>
        set((st) => {
          const removed = st.sessions.find((s) => s.id === id);
          // Limpia los binarios IDB de todos los mensajes de la sesión borrada.
          if (removed) {
            const ids = removed.messages.flatMap(blobIdsOf);
            if (ids.length) purgeBlobs(ids);
          }
          const sessions = st.sessions.filter((s) => s.id !== id);
          const activeSessionId =
            st.activeSessionId === id ? sessions[0]?.id ?? null : st.activeSessionId;
          return { sessions, activeSessionId };
        }),

      renameSession: (id, title) =>
        set((st) => ({
          sessions: st.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
        })),

      togglePin: (id) =>
        set((st) => ({
          sessions: st.sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
        })),

      setActiveSession: (id) => set({ activeSessionId: id }),

      clearMessages: (id) =>
        set((st) => ({
          sessions: st.sessions.map((s) => {
            if (s.id !== id) return s;
            const ids = s.messages.flatMap(blobIdsOf);
            if (ids.length) purgeBlobs(ids);
            return { ...s, messages: [], updatedAt: Date.now() };
          }),
        })),

      addMessage: (sessionId, msg) =>
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [...s.messages, msg],
                  updatedAt: Date.now(),
                  title:
                    s.messages.length === 0 && msg.role === "user"
                      ? msg.content.slice(0, 48).replace(/\s+/g, " ").trim() || s.title
                      : s.title,
                }
              : s
          ),
        })),

      updateMessage: (sessionId, msgId, patch) =>
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
                }
              : s
          ),
        })),

      deleteMessage: (sessionId, msgId) =>
        set((st) => ({
          sessions: st.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const removed = s.messages.find((m) => m.id === msgId);
            if (removed) {
              const ids = blobIdsOf(removed);
              if (ids.length) purgeBlobs(ids);
            }
            return pruneForks({ ...s, messages: s.messages.filter((m) => m.id !== msgId) });
          }),
        })),

      branchFrom: (sessionId, msgId) => {
        let anchor: string | null = null;
        set((st) => ({
          sessions: st.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const r = beginBranch(s, msgId);
            anchor = r.anchor;
            return r.session;
          }),
        }));
        return anchor;
      },

      switchBranch: (sessionId, anchor, index) =>
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === sessionId ? switchBranchIn(s, anchor, index) : s
          ),
        })),

      dropBranch: (sessionId, anchor) =>
        set((st) => ({
          sessions: st.sessions.map((s) => (s.id === sessionId ? dropBranch(s, anchor) : s)),
        })),

      keepBranch: (sessionId, anchor) =>
        set((st) => ({
          sessions: st.sessions.map((s) => (s.id === sessionId ? keepOnlyActive(s, anchor) : s)),
        })),

      startThread: (sessionId) =>
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === sessionId ? startNewThreadIn(s, uid()) : s
          ),
        })),

      switchThread: (sessionId, threadId) =>
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === sessionId ? switchThreadIn(s, threadId, uid()) : s
          ),
        })),

      removeThread: (sessionId, threadId) =>
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === sessionId ? removeThreadIn(s, threadId) : s
          ),
        })),

      renameThread: (sessionId, threadId, name) =>
        set((st) => ({
          sessions: st.sessions.map((s) =>
            s.id === sessionId ? renameThreadIn(s, threadId, name) : s
          ),
        })),

      truncateAfter: (sessionId, msgId) =>
        set((st) => ({
          sessions: st.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            const idx = s.messages.findIndex((m) => m.id === msgId);
            if (idx < 0) return s;
            const descartados = s.messages.slice(idx + 1);
            const ids = descartados.flatMap(blobIdsOf);
            if (ids.length) purgeBlobs(ids);
            return { ...s, messages: s.messages.slice(0, idx + 1) };
          }),
        })),

      setProjectMap: (sessionId, map) =>
        set((st) => ({
          sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, projectMap: map } : s)),
        })),

      setProviderConfig: (id, patch) =>
        set((st) => ({
          providers: { ...st.providers, [id]: { ...st.providers[id], ...patch } },
        })),

      setSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch } })),

      toggleFavorite: (modelKey) =>
        set((st) => ({
          favorites: st.favorites.includes(modelKey)
            ? st.favorites.filter((k) => k !== modelKey)
            : [modelKey, ...st.favorites].slice(0, 24),
        })),

      // ——— biblioteca de prompts ———
      addPrompt: (p) => {
        const id = "p-" + uid();
        set((st) => ({ prompts: [{ ...p, id }, ...st.prompts] }));
        return id;
      },
      updatePrompt: (id, patch) =>
        set((st) => ({
          prompts: st.prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deletePrompt: (id) =>
        set((st) => ({ prompts: st.prompts.filter((p) => p.id !== id) })),

      // ——— skills ———
      //
      // Los permisos se recalculan AQUÍ, no en la pantalla que instala.
      // El análisis corría solo al instalar desde URL: cualquier otro camino
      // —editar el texto, importar un backup, una migración— dejaba unos
      // permisos que ya no describían lo que la skill manda hacer. Un permiso
      // desactualizado es peor que no tenerlo: se enseña como si fuera cierto.
      // Poniéndolo en el store, ningún camino se lo puede saltar.
      addSkill: (s) => {
        const id = "skill-" + uid();
        set((st) => ({
          skills: [
            ...st.skills,
            { ...s, id, enabled: false, permissions: analyzeSkillPermissions(s.instructions) },
          ],
        }));
        return id;
      },
      updateSkill: (id, patch) =>
        set((st) => ({
          skills: st.skills.map((s) => {
            if (s.id !== id) return s;
            const next = { ...s, ...patch };
            // si cambió el texto, los permisos se rehacen sobre el texto nuevo
            return patch.instructions !== undefined && patch.instructions !== s.instructions
              ? { ...next, permissions: analyzeSkillPermissions(next.instructions) }
              : next;
          }),
        })),
      removeSkill: (id) =>
        set((st) => ({ skills: st.skills.filter((s) => s.id !== id) })),
      toggleSkill: (id) =>
        set((st) => ({
          skills: st.skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
        })),

      // ——— radar de modelos gratis ———
      markRadarSeen: (ids) =>
        set((st) => ({
          radarSeenIds: Array.from(new Set([...st.radarSeenIds, ...ids])),
        })),
      addModelToProvider: (providerId, modelId) => {
        const cfg = get().providers[providerId];
        if (!cfg || cfg.models.includes(modelId)) return false;
        set((st) => ({
          providers: {
            ...st.providers,
            [providerId]: { ...st.providers[providerId], models: [modelId, ...st.providers[providerId].models] },
          },
        }));
        return true;
      },

      // ——— guía inicial ———
      setOnboardingDone: (v) => set({ onboardingDone: v }),

      exportData: (opts) => {
        const { sessions, providers, settings, favorites, prompts, skills, radarSeenIds } = get();
        const includeSessions = opts?.includeSessions !== false;
        return JSON.stringify(
          {
            app: "prism-ai",
            version: 3,
            exportedAt: new Date().toISOString(),
            ...(includeSessions ? { sessions } : {}),
            providers,
            settings,
            favorites,
            prompts,
            skills,
            radarSeenIds,
          },
          null,
          2
        );
      },
      /* Se aplica en UNA sola escritura: hacerlo en tres dejaba estados
       * intermedios visibles (ajustes nuevos con las claves aún viejas). La
       * decisión de qué se pisa y qué no vive en transfer.ts, no aquí. */
      applyTransfer: ({ providers, sessions, settings }) =>
        set((st) => ({
          providers,
          sessions,
          settings,
          activeSessionId:
            st.activeSessionId && sessions.some((s) => s.id === st.activeSessionId)
              ? st.activeSessionId
              : (sessions[0]?.id ?? null),
        })),

      importData: (json) => {
        try {
          const data = JSON.parse(json);
          if (data.app !== "prism-ai") return false;
          const sessions: Session[] | undefined = Array.isArray(data.sessions) ? data.sessions : undefined;
          if (!sessions && data.version === 2) return false;

          // prompts: conserva las integradas del código y restaura las tuyas del backup
          const backupPrompts: PromptItem[] = Array.isArray(data.prompts) ? data.prompts : [];
          const builtinPrompts = get().prompts.filter((p) => p.builtin);
          const customPrompts = backupPrompts.filter((p) => !p.builtin);

          // skills: ídem — las integradas siempre frescas del código
          const backupSkills: SkillItem[] = Array.isArray(data.skills) ? data.skills : [];
          const builtinIds = new Set(BUILTIN_SKILLS.map((s) => s.id));
          const currentSkills = get().skills;
          const builtinSkills = BUILTIN_SKILLS.map((s) => ({
            ...s,
            enabled: currentSkills.find((c) => c.id === s.id)?.enabled ?? s.enabled,
          }));
          const customSkills = backupSkills.filter((s) => !builtinIds.has(s.id));

          set({
            ...(sessions ? { sessions, activeSessionId: sessions[0]?.id ?? null } : {}),
            providers: { ...initialProviders(), ...(data.providers ?? {}) },
            settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
            favorites: Array.isArray(data.favorites) ? data.favorites : [],
            prompts: [...builtinPrompts, ...customPrompts],
            skills: [...builtinSkills, ...customSkills],
            ...(Array.isArray(data.radarSeenIds) ? { radarSeenIds: data.radarSeenIds } : {}),
          });
          return true;
        } catch {
          return false;
        }
      },

      resetAll: () => {
        // Purga también los binarios de IndexedDB: el «Borrar todos los datos»
        // de Ajustes tiene que dejar el dispositivo como si la app nunca se
        // hubiera abierto, y eso incluye el almacén de adjuntos.
        void clearAllBlobs();
        set({
          sessions: [],
          activeSessionId: null,
          providers: initialProviders(),
          settings: { ...DEFAULT_SETTINGS },
          favorites: [],
          fotoGratis: null,
          fallbackOrder: [],
        });
      },
    }),
    {
      name: "prism-ai-v1",
      storage: createJSONStorage(safeLocalStorage),
      partialize: (st) => {
        // Con la bóveda activa, las claves NO se guardan en disco: viven cifradas
        // en `prism-vault-v1` (ver vault.ts). Aquí se dejan vacías.
        let vaultOn = false;
        try {
          vaultOn = !!localStorage.getItem("prism-vault-v1");
        } catch {
          /* ignore */
        }
        const providers = vaultOn
          ? (Object.fromEntries(
              Object.entries(st.providers).map(([id, cfg]) => [id, { ...cfg, apiKey: "" }])
            ) as typeof st.providers)
          : st.providers;
        // Los binarios de los adjuntos viven en IndexedDB desde la v3.14:
        // aquí se quita el `dataUrl` del snapshot cuando ya hay un `blobId`
        // que lo recupera. Si no hay `blobId` (IDB aún no migrado o caído),
        // se conserva el `dataUrl` para no perder el adjunto.
        const sessions = st.sessions.map((s) =>
          s.messages.some((m) => m.attachments?.some((a) => a.blobId && a.dataUrl))
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.attachments?.some((a) => a.blobId && a.dataUrl)
                    ? {
                        ...m,
                        attachments: m.attachments.map((a) =>
                          a.blobId && a.dataUrl
                            ? stripDataUrl(a)
                            : a
                        ) as Attachment[],
                      }
                    : m
                ),
              }
            : s
        );
        return {
          sessions,
          activeSessionId: st.activeSessionId,
          providers,
          settings: st.settings,
          favorites: st.favorites,
          radarSeenIds: st.radarSeenIds,
          onboardingDone: st.onboardingDone,
          fotoGratis: st.fotoGratis,
          fallbackOrder: st.fallbackOrder,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
      // mezcla profunda de ajustes para no perder claves nuevas al actualizar
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PrismState>;
        return {
          ...current,
          ...p,
          providers: { ...current.providers, ...(p.providers ?? {}) },
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        };
      },
    }
  )
);

/** Selector: sesiones ordenadas (fijadas primero, luego updatedAt) */
export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}
