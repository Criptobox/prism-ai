"use client";
/** Prism AI — Store global (zustand + persistencia localStorage, 100% local) */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppSettings,
  ChatMessage,
  ProjectMap,
  PromptItem,
  ProviderConfig,
  ProviderId,
  Session,
  SkillItem,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { PROVIDERS } from "./providers";
import { BUILTIN_PROMPTS } from "./prompts-data";
import { BUILTIN_SKILLS } from "./skills-data";
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

  // guía inicial
  setOnboardingDone: (v: boolean) => void;

  // datos
  exportData: (opts?: { includeSessions?: boolean }) => string;
  importData: (json: string) => boolean;
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
          sessions: st.sessions.map((s) =>
            s.id === id ? { ...s, messages: [], updatedAt: Date.now() } : s
          ),
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
          sessions: st.sessions.map((s) =>
            s.id === sessionId
              ? pruneForks({ ...s, messages: s.messages.filter((m) => m.id !== msgId) })
              : s
          ),
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
            return idx >= 0 ? { ...s, messages: s.messages.slice(0, idx + 1) } : s;
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
      addSkill: (s) => {
        const id = "skill-" + uid();
        set((st) => ({ skills: [...st.skills, { ...s, id, enabled: false }] }));
        return id;
      },
      updateSkill: (id, patch) =>
        set((st) => ({
          skills: st.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
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

      resetAll: () =>
        set({
          sessions: [],
          activeSessionId: null,
          providers: initialProviders(),
          settings: { ...DEFAULT_SETTINGS },
          favorites: [],
        }),
    }),
    {
      name: "prism-ai-v1",
      storage: createJSONStorage(() => localStorage),
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
        return {
          sessions: st.sessions,
          activeSessionId: st.activeSessionId,
          providers,
          settings: st.settings,
          favorites: st.favorites,
          radarSeenIds: st.radarSeenIds,
          onboardingDone: st.onboardingDone,
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
