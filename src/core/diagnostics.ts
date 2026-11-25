import type { StorageStats } from '@/core/vfs/types'
import type { EventEntry } from '@/store/events'

export interface Capability { id: string; label: string; ok: boolean; detail?: string }

export function detectCapabilities(g: any = globalThis): Capability[] {
  const w = g as any
  const has = (v: unknown) => typeof v !== 'undefined'
  return [
    { id: 'idb', label: 'IndexedDB (project storage)', ok: has(w.indexedDB) },
    { id: 'wasm', label: 'WebAssembly (esbuild compiler)', ok: has(w.WebAssembly) },
    { id: 'worker', label: 'Web Workers', ok: has(w.Worker) },
    { id: 'crypto', label: 'Web Crypto (key vault)', ok: has(w.crypto?.subtle), detail: w.isSecureContext === false ? 'Needs HTTPS or localhost' : undefined },
    { id: 'compression', label: 'CompressionStream (checkpoints)', ok: has(w.CompressionStream), detail: has(w.CompressionStream) ? undefined : 'Checkpoints are stored uncompressed' },
    { id: 'fsa', label: 'File System Access API (folder sync)', ok: has(w.showDirectoryPicker), detail: has(w.showDirectoryPicker) ? undefined : 'Use Chrome/Edge/Brave for folder sync' },
    { id: 'speech', label: 'Speech recognition (voice input)', ok: has(w.SpeechRecognition) || has(w.webkitSpeechRecognition) },
    { id: 'clipboard', label: 'Async clipboard', ok: has(w.navigator?.clipboard) },
    { id: 'storage', label: 'Persistent storage API', ok: has(w.navigator?.storage?.persist) },
  ]
}

export function buildDiagnosticsReport(input: {
  settings: Record<string, unknown>
  stats?: StorageStats
  estimate?: { usage?: number; quota?: number }
  events: EventEntry[]
  capabilities: Capability[]
  env?: Record<string, unknown>
}) {
  // Never include vault contents, API keys or connection tokens.
  const s = input.settings as any
  return {
    generatedAt: new Date().toISOString(),
    app: 'UnQStudio 1.0.0',
    env: input.env ?? {},
    capabilities: input.capabilities,
    settings: {
      activeProvider: s.activeProvider, activeModel: s.activeModel, aiMode: s.aiMode, flags: s.flags, vaultEncrypted: s.vaultEncrypted,
      enabledProviders: Object.entries(s.enabled ?? {}).filter(([, v]) => v).map(([k]) => k),
      customPrompts: (s.customPrompts ?? []).length,
      plugins: { themes: s.plugins?.themes?.length ?? 0, templates: s.plugins?.templates?.length ?? 0, providers: s.plugins?.providers?.length ?? 0, mcp: s.plugins?.mcp?.length ?? 0 },
    },
    storage: { ...input.stats, ...input.estimate },
    events: input.events.slice(-200),
  }
}
