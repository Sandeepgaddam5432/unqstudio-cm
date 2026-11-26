// Autonomous self-healing build loop (pure orchestration — all I/O is injected so it is fully unit-testable).
// Flow: AI turn applied → wait for the REAL esbuild-wasm result (+ a brief runtime-error window) → if red and attempts < max,
// feed exact error messages + offending file excerpts back to the model → repeat until GREEN / max / abort / no progress.

export interface HealError { message: string; file?: string; line?: number; column?: number; snippet?: string; source?: string }

export type HealStatus = 'green' | 'gave-up' | 'stopped' | 'no-progress'
export interface HealPhase { attempt: number; max: number; phase: 'waiting' | 'healing' }
export interface HealDeps {
  /** Resolve once the latest build has finished AND the runtime-error window has elapsed. */
  getErrors: () => Promise<HealError[]>
  /** Run one surgical heal turn with `prompt`; resolves with how many file ops were actually applied. */
  runTurn: (prompt: string, attempt: number) => Promise<{ applied: number }>
  readFile: (path: string) => string | undefined
  isAborted: () => boolean
  onPhase?: (p: HealPhase) => void
}

export const clampHealSteps = (n: unknown): number => { const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 3; return Math.min(3, Math.max(1, v)) }

/** Numbered lines around `line` (1-based) — the offending excerpt fed back to the model. */
export function excerpt(content: string, line: number | undefined, ctx = 6): { from: number; to: number; text: string } {
  const lines = content.split('\n')
  const at = Math.min(Math.max(1, line ?? 1), Math.max(1, lines.length))
  const from = Math.max(1, at - ctx), to = Math.min(lines.length, at + ctx)
  const width = String(to).length
  const text = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(width)}${from + i === at ? '>' : '|'} ${l}`).join('\n')
  return { from, to, text }
}

const norm = (p: string) => (p.startsWith('/') ? p : '/' + p)

export function buildHealPrompt(errors: HealError[], readFile: (p: string) => string | undefined, opts: { attempt?: number; max?: number; maxFiles?: number } = {}): string {
  const list = errors.slice(0, 6)
  const head = `The build is failing${opts.attempt ? ` (auto-heal attempt ${opts.attempt}/${opts.max ?? 3})` : ''}. Fix it with the SMALLEST possible change — touch only what the errors require and do not rewrite unrelated code. Output only the changed files using the standard file protocol.`
  const errs = list.map((e, i) => `${i + 1}. [${e.source ?? 'build'}] ${e.file ? `${norm(e.file)}${e.line ? `:${e.line}${e.column ? ':' + e.column : ''}` : ''} — ` : ''}${e.message}${e.snippet ? `\n   code: ${e.snippet.trim().split('\n')[0]}` : ''}`).join('\n')
  const seen = new Set<string>()
  const ex: string[] = []
  for (const e of list) {
    if (!e.file) continue
    const p = norm(e.file)
    if (seen.has(p) || seen.size >= (opts.maxFiles ?? 3)) continue
    const c = readFile(p)
    if (c === undefined) continue
    seen.add(p)
    const x = excerpt(c, e.line)
    ex.push(`--- ${p} (lines ${x.from}-${x.to}) ---\n${x.text}`)
  }
  return `${head}\n\n## Errors\n${errs}${ex.length ? `\n\n## Offending excerpts\n${ex.join('\n\n')}` : ''}`
}

const sig = (errs: HealError[]) => errs.map((e) => `${e.file ?? ''}:${e.line ?? ''}:${e.message}`).sort().join('|')

export async function selfHealLoop(deps: HealDeps, maxSteps: number): Promise<{ status: HealStatus; attempts: number; remaining: HealError[] }> {
  const max = clampHealSteps(maxSteps)
  let attempts = 0
  let prev = ''
  for (;;) {
    deps.onPhase?.({ attempt: attempts, max, phase: 'waiting' })
    const errors = await deps.getErrors()
    if (deps.isAborted()) return { status: 'stopped', attempts, remaining: errors }
    if (!errors.length) return { status: 'green', attempts, remaining: [] }
    if (attempts >= max) return { status: 'gave-up', attempts, remaining: errors }
    const s = sig(errors)
    if (attempts > 0 && s === prev) return { status: 'no-progress', attempts, remaining: errors }
    prev = s
    attempts++
    deps.onPhase?.({ attempt: attempts, max, phase: 'healing' })
    const res = await deps.runTurn(buildHealPrompt(errors, deps.readFile, { attempt: attempts, max }), attempts)
    if (deps.isAborted()) return { status: 'stopped', attempts, remaining: errors }
    if (res.applied === 0) return { status: 'no-progress', attempts, remaining: errors }
  }
}

/** Poll helper used by the store to wait for esbuild-wasm to finish; injectable clock for tests. */
export async function pollUntil(cond: () => boolean, timeoutMs: number, intervalMs = 200, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  let waited = 0
  while (waited <= timeoutMs) { if (cond()) return true; await sleep(intervalMs); waited += intervalMs }
  return cond()
}
