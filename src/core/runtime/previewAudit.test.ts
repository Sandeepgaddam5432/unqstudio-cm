// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_SCRIPT } from './bridgeScript'
import { auditFindings, formatObservation, isFailedRequest, isNetworkMessage, observePreview, type DomAuditReport, type NetworkEntry } from './previewAudit'

const bridgeMsgs: any[] = []
const onMsg = (e: MessageEvent) => { if (e.data?.__unq) bridgeMsgs.push(e.data) }
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))
/** Poll until the bridge has emitted a matching message (jsdom postMessage is async; never rely on a fixed delay). */
const until = async (pred: () => boolean, ms = 2000) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await tick(5) }

function boot() {
  bridgeMsgs.length = 0
  window.addEventListener('message', onMsg)
  // The bridge runs as plain script inside the preview document; in jsdom window.parent === window so we can observe its messages.
  new Function(BRIDGE_SCRIPT)()
}
afterEach(() => { window.removeEventListener('message', onMsg); document.body.innerHTML = '' })

describe('bridge: network interception (fetch)', () => {
  it('reports success and failure with method/url/status/ok/durationMs/error', async () => {
    const real = window.fetch
    window.fetch = vi.fn(async (u: any) => (String(u).includes('bad') ? Promise.reject(new TypeError('Failed to fetch')) : new Response('x', { status: String(u).includes('404') ? 404 : 200 }))) as any
    boot()
    await window.fetch('/ok'); await window.fetch('/missing-404', { method: 'post' }); await window.fetch('/bad').catch(() => {})
    await until(() => bridgeMsgs.filter((m) => m.type === 'network').length >= 3)
    const net = bridgeMsgs.filter((m) => m.type === 'network')
    expect(net.map((n) => [n.method, n.url, n.status, n.ok])).toEqual([['GET', '/ok', 200, true], ['POST', '/missing-404', 404, false], ['GET', '/bad', 0, false]])
    expect(net[2].error).toMatch(/Failed to fetch/)
    expect(typeof net[0].durationMs).toBe('number')
    expect(net.every((n) => isNetworkMessage(n))).toBe(true)
    expect(isFailedRequest(net[1] as NetworkEntry)).toBe(true)
    window.fetch = real
  })
})

describe('bridge: audit:run → audit:result', () => {
  it('detects a blank #root and broken images', async () => {
    document.body.innerHTML = '<div id="root"></div><img src="/nope.png">'
    const img = document.images[0]
    Object.defineProperty(img, 'complete', { value: true }) // jsdom never loads images; model a finished-but-failed load
    Object.defineProperty(img, 'naturalWidth', { value: 0 })
    boot()
    window.postMessage({ __unq: true, type: 'audit:run', id: 'a1' }, '*')
    await until(() => bridgeMsgs.some((m) => m.type === 'audit:result' && m.id === 'a1'))
    const res = bridgeMsgs.find((m) => m.type === 'audit:result' && m.id === 'a1')
    expect(res).toBeTruthy()
    expect(res.report.blank).toBe(true)
    expect(res.report.brokenImages).toEqual(['/nope.png'])
    const f = auditFindings(res.report)
    expect(f.map((x) => x.id)).toEqual(expect.arrayContaining(['blank', 'broken-image']))
  })
  it('flags horizontal overflow with offender selectors (scrollWidth > innerWidth + 2)', async () => {
    document.body.innerHTML = '<div id="root"><p>Hello</p><div id="wide" class="banner">x</div></div>'
    const wide = document.getElementById('wide')!
    wide.getBoundingClientRect = () => ({ left: 0, right: 2000, width: 2000, height: 20, top: 0, bottom: 20, x: 0, y: 0, toJSON() {} }) as DOMRect
    Object.defineProperty(document.documentElement, 'scrollWidth', { value: 2000, configurable: true })
    boot()
    window.postMessage({ __unq: true, type: 'audit:run', id: 'a2' }, '*')
    await until(() => bridgeMsgs.some((m) => m.type === 'audit:result' && m.id === 'a2'))
    const r = bridgeMsgs.find((m) => m.type === 'audit:result' && m.id === 'a2').report
    expect(r.overflowX).toBe(true)
    expect(r.overflowOffenders).toContain('div#wide')
    expect(r.blank).toBe(false)
    expect(auditFindings(r).find((x) => x.id === 'overflow')!.message).toMatch(/2000px wide.*div#wide/)
  })
})

const okReport: DomAuditReport = { blank: false, rootTextLength: 10, rootHeight: 100, overflowX: false, scrollWidth: 390, innerWidth: 390, overflowOffenders: [], brokenImages: [], noStyles: false, badInteractive: [], title: '' }

describe('observePreview (observation window, instant trigger)', () => {
  it('waits the whole window when everything is healthy', async () => {
    let t = 0
    const r = await observePreview({ getConsoleErrors: () => [], getNetwork: () => [], runAudit: async () => okReport, observeMs: 1000, pollMs: 100, now: () => t, sleep: async (ms) => { t += ms } })
    expect(r.earlyExit).toBe(false)
    expect(r.observedMs).toBeGreaterThanOrEqual(1000)
    expect(r.findings).toEqual([])
  })
  it('exits immediately on the first console error or failed request', async () => {
    let t = 0
    const errs: string[] = []
    const r = await observePreview({ getConsoleErrors: () => errs, getNetwork: () => [], runAudit: async () => okReport, observeMs: 10_000, pollMs: 100, now: () => t, sleep: async (ms) => { t += ms; if (t >= 300) errs.push('TypeError: x is undefined') } })
    expect(r.earlyExit).toBe(true)
    expect(r.observedMs).toBeLessThan(1000)
    const net: NetworkEntry = { method: 'GET', url: '/api', status: 500, ok: false, durationMs: 5 }
    const r2 = await observePreview({ getConsoleErrors: () => [], getNetwork: () => [net], runAudit: async () => okReport })
    expect(r2.earlyExit).toBe(true)
    expect(r2.failedNetwork).toHaveLength(1)
  })
  it('caps the window at 10 s and reports a silent preview honestly', async () => {
    let t = 0
    const r = await observePreview({ getConsoleErrors: () => [], getNetwork: () => [], runAudit: async () => null, observeMs: 999_999, pollMs: 1000, now: () => t, sleep: async (ms) => { t += ms } })
    expect(r.observedMs).toBeLessThanOrEqual(11_000)
    expect(r.findings[0].id).toBe('audit-error')
  })
  it('formats an agent-readable report incl. the vision statement', () => {
    const txt = formatObservation({ consoleErrors: ['boom'], network: [{ method: 'GET', url: '/a', status: 500, ok: false, durationMs: 3 }], failedNetwork: [{ method: 'GET', url: '/a', status: 500, ok: false, durationMs: 3 }], findings: auditFindings({ ...okReport, blank: true }), observedMs: 120, earlyExit: true }, 'unsupported')
    expect(txt).toMatch(/Console errors \(1\)/)
    expect(txt).toMatch(/GET \/a → 500/)
    expect(txt).toMatch(/Blank screen/)
    expect(txt).toMatch(/no vision support/)
  })
})
