/**
 * Host side of Preview Telemetry 2.0: typed network/audit messages from the bridge, audit → findings, a bounded
 * "observation window" (instant trigger on first error), and the agent-facing `inspect_preview` report.
 */
export interface NetworkEntry { method: string; url: string; status: number; ok: boolean; durationMs: number; error?: string; ts?: number }
export interface DomAuditReport {
  blank: boolean; rootTextLength: number; rootHeight: number
  overflowX: boolean; scrollWidth: number; innerWidth: number; overflowOffenders: string[]
  brokenImages: string[]; noStyles: boolean; badInteractive: { selector: string; reason: string }[]; title: string
  error?: string
}
export interface AuditFinding { id: 'blank' | 'overflow' | 'broken-image' | 'no-styles' | 'interactive' | 'audit-error'; severity: 'error' | 'warn'; message: string }

export const isNetworkMessage = (d: unknown): d is NetworkEntry & { type: 'network' } => !!d && (d as { type?: string }).type === 'network' && typeof (d as { url?: unknown }).url === 'string'
export const isFailedRequest = (n: NetworkEntry): boolean => !n.ok || n.status >= 400 || n.status === 0

export function auditFindings(r: DomAuditReport): AuditFinding[] {
  const f: AuditFinding[] = []
  if (r.error) return [{ id: 'audit-error', severity: 'warn', message: `Audit could not run: ${r.error}` }]
  if (r.blank) f.push({ id: 'blank', severity: 'error', message: 'Blank screen: #root renders no visible text or media (check the entry file mounts <App /> and that no render error occurred).' })
  if (r.overflowX) f.push({ id: 'overflow', severity: 'error', message: `Horizontal overflow: page is ${r.scrollWidth}px wide in a ${r.innerWidth}px viewport${r.overflowOffenders.length ? `; offenders: ${r.overflowOffenders.join(', ')}` : ''}.` })
  for (const src of r.brokenImages) f.push({ id: 'broken-image', severity: 'error', message: `Broken image: ${src}` })
  if (r.noStyles) f.push({ id: 'no-styles', severity: 'warn', message: 'No stylesheet is applied (missing /src/index.css import or Tailwind runtime).' })
  for (const b of r.badInteractive) f.push({ id: 'interactive', severity: 'warn', message: `Interactive element ${b.selector} is ${b.reason}.` })
  return f
}

export interface PreviewObservation { consoleErrors: string[]; network: NetworkEntry[]; failedNetwork: NetworkEntry[]; findings: AuditFinding[]; observedMs: number; earlyExit: boolean }

/**
 * Observe the preview for up to `observeMs` (default 4 s, capped at 10 s). Returns IMMEDIATELY on the first runtime/console error
 * or failed request (the agent can start fixing at once), otherwise after the window elapses.
 */
export async function observePreview(o: {
  getConsoleErrors: () => string[]; getNetwork: () => NetworkEntry[]; runAudit: () => Promise<DomAuditReport | null>
  observeMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number; isAborted?: () => boolean
}): Promise<PreviewObservation> {
  const budget = Math.min(10_000, Math.max(0, o.observeMs ?? 4000))
  const poll = o.pollMs ?? 150
  const sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = o.now ?? (() => Date.now())
  const t0 = now()
  let early = false
  while (now() - t0 < budget && !o.isAborted?.()) {
    if (o.getConsoleErrors().length || o.getNetwork().some(isFailedRequest)) { early = true; break }
    await sleep(poll)
  }
  const report = await o.runAudit()
  const network = o.getNetwork()
  return { consoleErrors: o.getConsoleErrors(), network, failedNetwork: network.filter(isFailedRequest), findings: report ? auditFindings(report) : [{ id: 'audit-error', severity: 'warn', message: 'Preview did not answer the audit request (not rendered yet?).' }], observedMs: now() - t0, earlyExit: early }
}

export function formatObservation(p: PreviewObservation, screenshot: 'attached' | 'skipped' | 'unsupported' = 'skipped'): string {
  const out: string[] = [`Preview inspection (${Math.round(p.observedMs)}ms${p.earlyExit ? ', stopped at first error' : ''})`]
  out.push(p.consoleErrors.length ? `Console errors (${p.consoleErrors.length}):\n${p.consoleErrors.slice(0, 8).map((e) => '- ' + e.slice(0, 240)).join('\n')}` : 'Console errors: none')
  out.push(p.failedNetwork.length ? `Failed network requests (${p.failedNetwork.length}/${p.network.length}):\n${p.failedNetwork.slice(0, 8).map((n) => `- ${n.method} ${n.url} → ${n.status || 'failed'}${n.error ? ' ' + n.error : ''}`).join('\n')}` : `Network: ${p.network.length} request(s), none failed`)
  out.push(p.findings.length ? `DOM/layout issues:\n${p.findings.map((f) => `- [${f.severity}] ${f.message}`).join('\n')}` : 'DOM/layout: OK')
  out.push(screenshot === 'attached' ? 'Screenshot attached — check alignment, spacing, contrast and broken layouts before concluding.' : screenshot === 'unsupported' ? 'Visual check skipped: the active model has no vision support.' : 'Visual check skipped.')
  return out.join('\n')
}
