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
  exportData: () => string;
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

      createSession: () => {
        const s = newSession();
        set((st) => ({ sessions: [s, ...st.sessions], activeSessionId: s.id }));
        return s.id;
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
            s.id === sessionId ? { ...s, messages: s.messages.filter((m) => m.id !== msgId) } : s
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

      exportData: () => {
        const { sessions, providers, settings, favorites, prompts, skills, radarSeenIds } = get();
        return JSON.stringify(
          { app: "prism-ai", version: 2, exportedAt: new Date().toISOString(), sessions, providers, settings, favorites, prompts, skills, radarSeenIds },
          null,
          2
        );
      },
      importData: (json) => {
        try {
          const data = JSON.parse(json);
          if (data.app !== "prism-ai" || !Array.isArray(data.sessions)) return false;
          set({
            sessions: data.sessions,
            providers: { ...initialProviders(), ...(data.providers ?? {}) },
            settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
            favorites: Array.isArray(data.favorites) ? data.favorites : [],
            activeSessionId: data.sessions[0]?.id ?? null,
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
      partialize: (st) => ({
        sessions: st.sessions,
        activeSessionId: st.activeSessionId,
        providers: st.providers,
        settings: st.settings,
        favorites: st.favorites,
        radarSeenIds: st.radarSeenIds,
        onboardingDone: st.onboardingDone,
      }),
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
