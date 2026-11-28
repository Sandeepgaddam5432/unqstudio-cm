let frame: HTMLIFrameElement | null = null
export const setPreviewFrame = (f: HTMLIFrameElement | null) => { frame = f }
export const getPreviewFrame = () => frame

/** Send a message to the preview iframe (defaults to the currently mounted preview). */
export function postToPreview(target: HTMLIFrameElement | null, msg: Record<string, unknown>) {
  ;(target ?? frame)?.contentWindow?.postMessage({ __unq: true, ...msg }, '*')
}

/* ── v3.5 DOM/layout audit round-trip (audit:run → audit:result) ─────────────────────────────────────────────── */
import type { DomAuditReport } from '@/core/runtime/previewAudit'
const auditWaiters = new Map<string, (r: DomAuditReport | null) => void>()
/** Called by Preview.tsx for every `audit:result` bridge message. */
export const resolveAudit = (id: string, report: DomAuditReport | null) => { auditWaiters.get(id)?.(report); auditWaiters.delete(id) }
/** Ask the live preview to run its DOM & layout health audit. Resolves `null` if nothing answers within `timeoutMs`. */
export function requestAudit(timeoutMs = 5000): Promise<DomAuditReport | null> {
  const f = frame
  if (!f?.contentWindow) return Promise.resolve(null)
  const id = Math.random().toString(36).slice(2)
  return new Promise((resolve) => {
    const t = setTimeout(() => { auditWaiters.delete(id); resolve(null) }, timeoutMs)
    auditWaiters.set(id, (r) => { clearTimeout(t); resolve(r) })
    postToPreview(f, { type: 'audit:run', id })
  })
}
