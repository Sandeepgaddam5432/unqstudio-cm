// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildReceipt, clampVerifySteps, runVerifyLoop, type VerifyCheck } from './verifyLoop'

const green: VerifyCheck = { build: { ok: true, ms: 140, errors: 0 }, ts: { errors: 0 }, runtime: { consoleErrors: 0, networkFailures: 0 }, dom: { ok: true, issues: 0 }, visual: 'skipped' }

describe('✓ Verified receipt is honest', () => {
  it('verified only when build, TS, runtime and DOM all ran and passed (visual may be skipped)', () => {
    const r = buildReceipt(green, 1)
    expect(r.status).toBe('verified')
    expect(r.summary).toBe('Build 140ms · TypeScript 0 TS errors · Console / Network 0 errors · DOM / Layout OK · Visual check skipped')
  })
  it('anything skipped ⇒ unverified, never verified', () => {
    expect(buildReceipt({ ...green, ts: { errors: 0, skipped: 'Workers unavailable' } }).status).toBe('unverified')
    expect(buildReceipt({ ...green, dom: null }).status).toBe('unverified')
    expect(buildReceipt({ ...green, runtime: null }).status).toBe('unverified')
    expect(buildReceipt({}).status).toBe('unverified')
  })
  it('any failure ⇒ needs-attention with exact counts; vision issues also fail', () => {
    const r = buildReceipt({ ...green, ts: { errors: 3 }, runtime: { consoleErrors: 1, networkFailures: 1 } })
    expect(r.status).toBe('needs-attention')
    expect(r.rows.filter((x) => x.state === 'fail').map((x) => x.value)).toEqual(['3 TS errors', '2 errors'])
    expect(buildReceipt({ ...green, visual: 'issues' }).status).toBe('needs-attention')
    expect(buildReceipt({ ...green, visual: 'ok' }).rows.at(-1)).toMatchObject({ value: 'OK', state: 'pass' })
  })
})

describe('runVerifyLoop termination', () => {
  it('clamps the step budget to 1..8 (default 5)', () => { expect([clampVerifySteps(undefined), clampVerifySteps(0), clampVerifySteps(99), clampVerifySteps(3)]).toEqual([5, 1, 8, 3]) })
  it('stops immediately when already green (0 fixes)', async () => {
    const r = await runVerifyLoop({ verify: async () => ({ check: green, problems: [] }), fix: async () => { throw new Error('no fix expected') } })
    expect(r).toMatchObject({ status: 'verified', steps: 0 })
  })
  it('fixes then verifies until green', async () => {
    let n = 0
    const r = await runVerifyLoop({ verify: async () => (n >= 2 ? { check: green, problems: [] } : { check: { ...green, ts: { errors: 1 } }, problems: [`err${n}`] }), fix: async () => { n++; return { applied: 1 } } })
    expect(r.status).toBe('verified')
    expect(r.steps).toBe(2)
  })
  it('is bounded by maxSteps and returns the honest failing receipt', async () => {
    let i = 0
    const r = await runVerifyLoop({ verify: async () => ({ check: { ...green, ts: { errors: 1 } }, problems: [`new problem ${i++}`] }), fix: async () => ({ applied: 1 }) }, 3)
    expect(r.status).toBe('max-steps')
    expect(r.steps).toBe(3)
    expect(r.receipt?.status).toBe('needs-attention')
  })
  it('stops on no-progress (fix changes nothing / identical problems) and on abort', async () => {
    const bad = { check: { ...green, ts: { errors: 1 } }, problems: ['same'] }
    expect((await runVerifyLoop({ verify: async () => bad, fix: async () => ({ applied: 0 }) })).status).toBe('no-progress')
    expect((await runVerifyLoop({ verify: async () => bad, fix: async () => ({ applied: 1 }) })).status).toBe('no-progress')
    let stop = false
    const r = await runVerifyLoop({ verify: async () => ({ check: green, problems: ['x'] }), fix: async () => { stop = true; return { applied: 1 } }, isAborted: () => stop })
    expect(r.status).toBe('aborted')
  })
})
