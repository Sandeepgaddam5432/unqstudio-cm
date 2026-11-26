import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIMode = 'build' | 'plan' | 'ask'

export interface CustomPrompt { id: string; name: string; content: string; enabled: boolean }
export interface PluginTheme { id: string; name: string; accent: string; bg: string; surface: string; fg: string; radius: number; font: string }
export interface PluginTemplate { id: string; name: string; description: string; files: Record<string, string> }
export interface PluginProvider { id: string; name: string; baseUrl: string; models: string[] }
export interface McpConnector { id: string; name: string; url: string; transport: 'http' | 'sse'; headers: Record<string, string>; enabled: boolean }
export interface PluginRegistry { themes: PluginTheme[]; templates: PluginTemplate[]; providers: PluginProvider[]; mcp: McpConnector[] }

export interface FeatureFlags {
  approvalTray: boolean
  autoCheckpoint: boolean
  showTokenMeter: boolean
  autoFixErrors: boolean
  /** v2.1: autonomous self-healing build loop (default on in Build mode). */
  autoHeal: boolean
  /** v3.0: bounded multi-step agent loop (read/search tools + verify_build self-heal) replaces the plain heal loop. */
  agentLoop: boolean
  reasoningUI: boolean
  includeAllFiles: boolean
}

export const DEFAULT_FLAGS: FeatureFlags = {
  approvalTray: false, autoCheckpoint: true, showTokenMeter: true, autoFixErrors: false, autoHeal: true, agentLoop: true, reasoningUI: true, includeAllFiles: true,
}

export interface SettingsState {
  activeProvider: string
  activeModel: string
  enabled: Record<string, boolean>
  baseUrls: Record<string, string>
  userModels: Record<string, string[]>
  /** v2.1: max automatic heal rounds (1–3). */
  maxAutoHealSteps: number
  /** v3.0: max agent loop steps (1–5, default 3). */
  agentMaxSteps: number
  aiMode: AIMode
  flags: FeatureFlags
  customPrompts: CustomPrompt[]
  plugins: PluginRegistry
  onboarded: boolean
  vaultEncrypted: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
  setFlag: (k: keyof FeatureFlags, v: boolean) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      activeProvider: 'openrouter',
      activeModel: 'anthropic/claude-sonnet-4.5',
      enabled: {},
      baseUrls: {},
      userModels: {},
      maxAutoHealSteps: 3,
      agentMaxSteps: 3,
      aiMode: 'build',
      flags: DEFAULT_FLAGS,
      customPrompts: [],
      plugins: { themes: [], templates: [], providers: [], mcp: [] },
      onboarded: false,
      vaultEncrypted: false,
      set: (patch) => set(patch),
      setFlag: (k, v) => set((s) => ({ flags: { ...s.flags, [k]: v } })),
    }),
    { name: 'unq.settings.v1', version: 1, merge: (p, cur) => ({ ...cur, ...(p as object), flags: { ...DEFAULT_FLAGS, ...((p as SettingsState | undefined)?.flags ?? {}) } }) },
  ),
)
