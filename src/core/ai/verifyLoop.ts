/**
 * Honest `✓ Verified` receipts + the bounded autonomous verify loop (Edit → Typecheck → Build → Inspect → Fix → ✓).
 * A receipt says `verified` ONLY when every real check ran and passed; anything skipped can never be "verified".
 */
export interface VerifyCheck {
  build?: { ok: boolean; ms: number; errors: number }
  ts?: { errors: number; warnings?: number; skipped?: string }
  runtime?: { consoleErrors: number; networkFailures: number } | null
  dom?: { ok: boolean; issues: number; skipped?: string } | null
  visual?: 'ok' | 'issues' | 'skipped' | 'unsupported'
}
export type ReceiptStatus = 'verified' | 'needs-attention' | 'unverified'
export interface ReceiptRow { label: string; value: string; state: 'pass' | 'fail' | 'skip' }
export interface VerifyReceipt { status: ReceiptStatus; rows: ReceiptRow[]; summary: string; at: number }

export function buildReceipt(c: VerifyCheck, at = Date.now()): VerifyReceipt {
  const rows: ReceiptRow[] = []
  const row = (label: string, value: string, state: ReceiptRow['state']) => rows.push({ label, value, state })
  if (!c.build) row('Build', 'not run', 'skip'); else row('Build', c.build.ok ? `${c.build.ms}ms` : `${c.build.errors} error${c.build.errors === 1 ? '' : 's'}`, c.build.ok ? 'pass' : 'fail')
  if (!c.ts || c.ts.skipped) row('TypeScript', c.ts?.skipped ? `skipped (${c.ts.skipped})` : 'not run', 'skip'); else row('TypeScript', `${c.ts.errors} TS error${c.ts.errors === 1 ? '' : 's'}`, c.ts.errors === 0 ? 'pass' : 'fail')
  if (!c.runtime) row('Console / Network', 'not observed', 'skip'); else row('Console / Network', `${c.runtime.consoleErrors + c.runtime.networkFailures} error${c.runtime.consoleErrors + c.runtime.networkFailures === 1 ? '' : 's'}`, c.runtime.consoleErrors + c.runtime.networkFailures === 0 ? 'pass' : 'fail')
  if (!c.dom || c.dom.skipped) row('DOM / Layout', c.dom?.skipped ? `skipped (${c.dom.skipped})` : 'not run', 'skip'); else row('DOM / Layout', c.dom.ok ? 'OK' : `${c.dom.issues} issue${c.dom.issues === 1 ? '' : 's'}`, c.dom.ok ? 'pass' : 'fail')
  row('Visual check', c.visual === 'ok' ? 'OK' : c.visual === 'issues' ? 'issues found' : c.visual === 'unsupported' ? 'skipped (model has no vision)' : 'skipped', c.visual === 'ok' ? 'pass' : c.visual === 'issues' ? 'fail' : 'skip')
  const failed = rows.filter((r) => r.state === 'fail')
  const required = rows.filter((r) => r.label !== 'Visual check')
  const skippedRequired = required.filter((r) => r.state === 'skip')
  const status: ReceiptStatus = failed.length ? 'needs-attention' : skippedRequired.length ? 'unverified' : 'verified'
  const summary = rows.map((r) => `${r.label} ${r.value}`).join(' · ')
  return { status, rows, summary, at }
}

export const clampVerifySteps = (n: unknown, def = 5): number => { const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : def; return Math.min(8, Math.max(1, v)) }

export interface VerifyLoopDeps {
  /** Run build + typecheck + preview inspection and return the combined result. */
  verify: () => Promise<{ check: VerifyCheck; problems: string[] }>
  /** One model turn that tries to fix the listed problems; returns how many edits were applied. */
  fix: (problems: string[], step: number) => Promise<{ applied: number }>
  isAborted?: () => boolean
  onStep?: (s: { step: number; phase: 'verify' | 'fix'; problems: number }) => void
}
export interface VerifyLoopResult { status: 'verified' | 'needs-attention' | 'unverified' | 'aborted' | 'max-steps' | 'no-progress'; steps: number; receipt: VerifyReceipt | null; remaining: string[] }

/** Verify → (problems? fix → verify)… bounded by `maxSteps` fixes; stops on abort, on a fix that changes nothing, and on a repeated identical problem set. */
export async function runVerifyLoop(deps: VerifyLoopDeps, maxStepsIn?: number): Promise<VerifyLoopResult> {
  const max = clampVerifySteps(maxStepsIn)
  let receipt: VerifyReceipt | null = null
  let remaining: string[] = []
  let prev = ''
  for (let step = 0; step <= max; step++) {
    if (deps.isAborted?.()) return { status: 'aborted', steps: step, receipt, remaining }
    deps.onStep?.({ step, phase: 'verify', problems: remaining.length })
    const r = await deps.verify()
    receipt = buildReceipt(r.check)
    remaining = r.problems
    if (!remaining.length) return { status: receipt.status, steps: step, receipt, remaining }
    if (step === max) return { status: 'max-steps', steps: step, receipt, remaining }
    const sig = remaining.join('\n')
    if (sig === prev) return { status: 'no-progress', steps: step, receipt, remaining }
    prev = sig
    if (deps.isAborted?.()) return { status: 'aborted', steps: step, receipt, remaining }
    deps.onStep?.({ step: step + 1, phase: 'fix', problems: remaining.length })
    const f = await deps.fix(remaining, step + 1)
    if (f.applied === 0) return { status: 'no-progress', steps: step + 1, receipt, remaining }
  }
  return { status: 'max-steps', steps: max, receipt, remaining }
}
