import { useState } from 'react'
import { Cloud, Rocket, Triangle } from 'lucide-react'
import { Button, Input, Spinner } from '@/ui/primitives'
import { Field, LogBox, NotConnected, ResultLink, useConnected } from './shared'
import { useWorkspace } from '@/store/workspace'
import { getConn } from '@/store/connections'
import { getRuntime } from '@/core/runtime'
import { staticSiteFiles } from '@/core/deploy/static'
import { CLOUDFLARE_FALLBACK_STEPS, deployCloudflare, deployNetlify, deployVercel } from '@/core/deploy/hosts'
import { DeployError, type StaticFile } from '@/core/deploy/common'
import { slugify } from '@/lib/util'
import { logEvent } from '@/store/events'
import { toast } from '@/store/toast'

type Target = 'netlify' | 'vercel' | 'cloudflare'

export function DeployTab({ goto, onUrl }: { goto: (t: 'git') => void; onUrl?: (href: string) => void }) {
  const vfs = useWorkspace((s) => s.vfs)
  const nl = useConnected('netlify')
  const vc = useConnected('vercel')
  const cf = useConnected('cloudflare')
  const [name, setName] = useState(() => slugify(vfs?.meta.name ?? 'my-app'))
  const [busy, setBusy] = useState<Target | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<{ href: string; label: string } | null>(null)
  const [showCf, setShowCf] = useState(false)
  if (!vfs) return null
  const addLog = (m: string) => setLog((l) => [...l, m])

  const build = async (): Promise<StaticFile[]> => {
    addLog('Compiling production bundle…')
    const engine = await getRuntime()
    await engine.init()
    const res = await engine.build({ files: vfs.textFiles(), binary: vfs.binaryFiles(), production: true })
    if (!res.ok || !res.html) throw new DeployError(`Build failed: ${res.errors[0]?.message ?? 'unknown error'}`)
    addLog(`Built (${Math.round(res.html.length / 1024)} KB) in ${res.durationMs}ms`)
    return staticSiteFiles(res.html, vfs.snapshot())
  }

  const run = async (t: Target) => {
    setBusy(t); setLog([]); setResult(null); setShowCf(false)
    const t0 = performance.now()
    try {
      const files = await build()
      let url: string
      if (t === 'netlify') {
        const c = getConn('netlify')
        const key = `deploy:${vfs.projectId}:netlify`
        const prev = await vfs.adapter.kvGet<{ siteId: string }>(key)
        const r = await deployNetlify({ token: c.token, siteId: prev?.siteId, siteName: name, files, onLog: addLog })
        await vfs.adapter.kvSet(key, { siteId: r.siteId })
        url = r.url
      } else if (t === 'vercel') {
        const c = getConn('vercel')
        url = (await deployVercel({ token: c.token, teamId: c.teamId, name, files, onLog: addLog })).url
      } else {
        const c = getConn('cloudflare')
        url = (await deployCloudflare({ token: c.token, accountId: c.accountId, project: name, files, onLog: addLog })).url
      }
      setResult({ href: url, label: `Live: ${url}` })
      onUrl?.(url)
      logEvent('deploy', `${t} deployed ${url}`, { durationMs: Math.round(performance.now() - t0) })
      toast.success('Deployed', url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog('✗ ' + msg)
      toast.error('Deploy failed', msg)
      logEvent('error', `${t} deploy failed: ${msg}`)
      if (t === 'cloudflare') setShowCf(true)
    } finally { setBusy(null) }
  }

  return (
    <div>
      <p className="mb-4 text-xs text-muted">Builds a minified production bundle with the in-browser compiler and uploads it with the token from Settings → Connections. Tailwind classes are resolved at runtime by the Tailwind browser build (loaded from a CDN); for a fully pre-built site, push to Git and let your host run <code>npm run build</code>.</p>
      <Field label="Site / project name"><Input value={name} onChange={(e) => setName(slugify(e.target.value))} className="max-w-sm" /></Field>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {([
          ['netlify', 'Netlify', nl, <Rocket size={15} key="n" />, 'Digest deploy via /sites/{id}/deploys'],
          ['vercel', 'Vercel', vc, <Triangle size={15} key="v" />, 'POST /v13/deployments with inline files'],
          ['cloudflare', 'Cloudflare Pages', cf, <Cloud size={15} key="c" />, 'Direct upload (browser CORS may block it)'],
        ] as const).map(([id, label, ok, icon, hint]) => (
          <div key={id} className="rounded-2xl border border-line p-4">
            <p className="flex items-center gap-2 text-sm font-medium">{icon}{label}</p>
            <p className="mt-1 min-h-8 text-xs text-muted">{hint}</p>
            {ok ? <Button className="mt-3 w-full" variant="primary" disabled={!!busy || !name} onClick={() => run(id)}>{busy === id && <Spinner size={13} />}Deploy to {label}</Button> : <NotConnected service={id} name={label} />}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-xs"><span>Prefer GitHub Pages? Push with the generated Actions workflow.</span><Button size="sm" onClick={() => goto('git')}>Open Git tab</Button></div>
      <LogBox lines={log} />
      {result && <ResultLink href={result.href} label={result.label} />}
      {showCf && (
        <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/5 p-4 text-xs">
          <p className="mb-2 font-medium text-warn">Cloudflare’s API is usually blocked for browsers (no CORS). Use the Git-connect route instead:</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">{CLOUDFLARE_FALLBACK_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
    </div>
  )
}
