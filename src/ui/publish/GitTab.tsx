import { useState } from 'react'
import { GitBranch, Globe, Upload } from 'lucide-react'
import { Button, Input, Section, Segmented, Select, Spinner, Switch } from '@/ui/primitives'
import { Field, LogBox, NotConnected, ResultLink, useConnected } from './shared'
import { useWorkspace } from '@/store/workspace'
import { getConn } from '@/store/connections'
import { enablePages, pushToGitHub, PAGES_WORKFLOW } from '@/core/deploy/github'
import { pushToGitLab } from '@/core/deploy/gitlab'
import { snapshotToDeployFiles } from '@/core/deploy/static'
import { slugify } from '@/lib/util'
import { logEvent } from '@/store/events'
import { toast } from '@/store/toast'

export function GitTab() {
  const vfs = useWorkspace((s) => s.vfs)
  const [host, setHost] = useState<'github' | 'gitlab'>('github')
  const gh = useConnected('github')
  const gl = useConnected('gitlab')
  const [repo, setRepo] = useState(() => slugify(vfs?.meta.name ?? 'my-app'))
  const [owner, setOwner] = useState('')
  const [project, setProject] = useState('')
  const [branch, setBranch] = useState('main')
  const [priv, setPriv] = useState(true)
  const [create, setCreate] = useState(true)
  const [vis, setVis] = useState<'private' | 'public'>('private')
  const [message, setMessage] = useState('Update from UnQStudio')
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<{ href: string; label: string } | null>(null)
  if (!vfs) return null
  const addLog = (m: string) => setLog((l) => [...l, m])

  const run = async (kind: 'push' | 'pages') => {
    setBusy(kind); setLog([]); setResult(null)
    try {
      const t0 = performance.now()
      if (host === 'github') {
        const c = getConn('github')
        const extra: Record<string, string> = kind === 'pages' ? { '/.github/workflows/deploy.yml': PAGES_WORKFLOW } : {}
        const res = await pushToGitHub({ token: c.token, owner: owner.trim() || undefined, repo, branch, message, files: snapshotToDeployFiles(vfs.snapshot(), vfs.meta.name, extra), create: create ? { private: priv } : undefined, onLog: addLog }, fetch)
        if (kind === 'pages') {
          addLog('Enabling GitHub Pages (build from workflow)…')
          const url = await enablePages(c.token, res.owner, res.repo)
          setResult({ href: url, label: `Site will be live at ${url} after the workflow finishes (see the Actions tab)` })
        } else setResult({ href: res.commitUrl, label: `Pushed to ${res.owner}/${res.repo}@${res.branch}` })
        logEvent('deploy', `github ${kind} ${res.owner}/${res.repo}`, { durationMs: Math.round(performance.now() - t0) })
      } else {
        const c = getConn('gitlab')
        const res = await pushToGitLab({ token: c.token, baseUrl: c.baseUrl, project, branch: branch === 'main' ? undefined : branch, message, files: snapshotToDeployFiles(vfs.snapshot(), vfs.meta.name), create: create ? { visibility: vis } : undefined, onLog: addLog })
        setResult({ href: res.commitUrl, label: `Committed to ${res.projectUrl}` })
        logEvent('deploy', `gitlab push ${project}`, { durationMs: Math.round(performance.now() - t0) })
      }
      toast.success('Done')
    } catch (e) {
      addLog('✗ ' + (e instanceof Error ? e.message : String(e)))
      toast.error('Publish failed', e instanceof Error ? e.message : String(e))
      logEvent('error', `git publish failed: ${e instanceof Error ? e.message : e}`)
    } finally { setBusy(null) }
  }

  return (
    <div>
      <Segmented<'github' | 'gitlab'> className="mb-5" value={host} onChange={(h) => { setHost(h); setResult(null); setLog([]) }} items={[{ id: 'github', label: 'GitHub', icon: <GitBranch size={13} /> }, { id: 'gitlab', label: 'GitLab', icon: <GitBranch size={13} /> }]} />
      {host === 'github' ? (
        !gh ? <NotConnected service="github" name="GitHub" /> : (
          <Section title="Push to GitHub" description="Creates blobs → tree → commit → ref through the Git Data API, entirely from your browser.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Repository name"><Input value={repo} onChange={(e) => setRepo(slugify(e.target.value))} /></Field>
              <Field label="Owner" hint="blank = your account"><Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="your-username" /></Field>
              <Field label="Branch"><Input value={branch} onChange={(e) => setBranch(e.target.value)} /></Field>
              <Field label="Commit message"><Input value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
              <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-xs sm:col-span-1"><span>Create the repo if it doesn’t exist</span><Switch checked={create} onChange={setCreate} label="Create repo" /></label>
              <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-xs"><span>Private repository</span><Switch checked={priv} onChange={setPriv} label="Private" disabled={!create} /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => run('push')} disabled={!!busy || !repo}>{busy === 'push' ? <Spinner size={13} /> : <Upload size={14} />}Push to GitHub</Button>
              <Button onClick={() => run('pages')} disabled={!!busy || !repo}>{busy === 'pages' ? <Spinner size={13} /> : <Globe size={14} />}Push + GitHub Pages workflow</Button>
            </div>
            <p className="mt-2 text-[11px] text-faint">The Pages option adds <code>.github/workflows/deploy.yml</code> (needs the token’s <b>workflow</b> scope) and enables Pages.</p>
          </Section>
        )
      ) : !gl ? <NotConnected service="gitlab" name="GitLab" /> : (
        <Section title="Push to GitLab" description="Commits every file in one request through the Repository Commits API.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project path" hint="namespace/name"><Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="your-user/my-app" /></Field>
            <Field label="Branch" hint="main = project default"><Input value={branch} onChange={(e) => setBranch(e.target.value)} /></Field>
            <Field label="Commit message"><Input value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
            <Field label="If the project is missing"><Select value={create ? vis : 'none'} onChange={(e) => { if (e.target.value === 'none') setCreate(false); else { setCreate(true); setVis(e.target.value as 'private' | 'public') } }}><option value="private">Create (private)</option><option value="public">Create (public)</option><option value="none">Do not create</option></Select></Field>
          </div>
          <Button className="mt-4" variant="primary" onClick={() => run('push')} disabled={!!busy || !project.includes('/')}>{busy ? <Spinner size={13} /> : <Upload size={14} />}Push to GitLab</Button>
        </Section>
      )}
      <LogBox lines={log} />
      {result && <ResultLink href={result.href} label={result.label} />}
    </div>
  )
}
