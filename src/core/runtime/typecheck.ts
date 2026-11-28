/** Client for the lazy TypeScript worker. Returns `skipped` (never throws) where Workers are unavailable (SSR / jsdom). */
import type { TsDiagnostic } from './tsCheck'

export interface TypecheckResult { ok: boolean; diagnostics: TsDiagnostic[]; ms: number; skipped?: string }

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, (r: TypecheckResult) => void>()

function ensureWorker(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined') return null
  worker = new Worker(new URL('./typecheckWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; diagnostics?: TsDiagnostic[]; ms?: number; error?: string }>) => {
    const done = waiting.get(e.data.id)
    if (!done) return
    waiting.delete(e.data.id)
    if (e.data.error) done({ ok: false, diagnostics: [], ms: 0, skipped: e.data.error })
    else done({ ok: !(e.data.diagnostics ?? []).some((d) => d.severity === 'error'), diagnostics: e.data.diagnostics ?? [], ms: e.data.ms ?? 0 })
  }
  worker.onerror = () => { for (const d of waiting.values()) d({ ok: false, diagnostics: [], ms: 0, skipped: 'TypeScript worker failed to start' }); waiting.clear(); worker = null }
  return worker
}

/** Type-check `files` (path → source). Resolves within `timeoutMs`; a timeout or missing Worker yields `skipped`, never a hang. */
export function typecheckProject(files: Record<string, string>, timeoutMs = 45_000): Promise<TypecheckResult> {
  const w = ensureWorker()
  if (!w) return Promise.resolve({ ok: false, diagnostics: [], ms: 0, skipped: 'Workers unavailable in this environment' })
  const id = ++seq
  return new Promise((resolve) => {
    const t = setTimeout(() => { waiting.delete(id); resolve({ ok: false, diagnostics: [], ms: timeoutMs, skipped: 'TypeScript check timed out' }) }, timeoutMs)
    waiting.set(id, (r) => { clearTimeout(t); resolve(r) })
    w.postMessage({ id, files })
  })
}
