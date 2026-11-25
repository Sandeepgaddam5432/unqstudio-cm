import type { Snapshot } from '@/core/vfs/types'
import { ensureScaffold } from '@/core/vfs/scaffold'
import { b64ToBytes, utf8ToBytes, type DeployFile, type StaticFile } from './common'

/** Files for a Git push: a complete Vite project (with scaffolding) incl. binary assets. Paths have no leading slash. */
export function snapshotToDeployFiles(snap: Snapshot, name: string, extra: Record<string, string> = {}): DeployFile[] {
  const text: Record<string, string> = {}
  for (const [p, e] of Object.entries(snap)) if (e.e === 'utf8' && !p.endsWith('/.keep')) text[p] = e.c
  const full = { ...ensureScaffold(text, name), ...extra }
  const out: DeployFile[] = Object.entries(full).map(([p, c]) => ({ path: p.replace(/^\//, ''), content: c, encoding: 'utf8' as const }))
  for (const [p, e] of Object.entries(snap)) if (e.e === 'base64') out.push({ path: p.replace(/^\//, ''), content: e.c, encoding: 'base64' })
  return out
}

/** The deployable static bundle: the production-compiled index.html + /public assets + SPA fallback. */
export function staticSiteFiles(html: string, snap: Snapshot): StaticFile[] {
  const out: StaticFile[] = [{ path: 'index.html', bytes: utf8ToBytes(html) }, { path: '_redirects', bytes: utf8ToBytes('/* /index.html 200\n') }]
  for (const [p, e] of Object.entries(snap)) {
    if (!p.startsWith('/public/') || p.endsWith('/.keep')) continue
    out.push({ path: p.slice('/public/'.length), bytes: e.e === 'base64' ? b64ToBytes(e.c) : utf8ToBytes(e.c) })
  }
  return out
}
