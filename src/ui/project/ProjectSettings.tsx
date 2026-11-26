import { useEffect, useState } from 'react'
import { BookOpen, Bookmark, Copy, Download, GitBranch, History, Image as ImageIcon, RotateCcw, SlidersHorizontal, Trash2, Database, GitFork, RefreshCw } from 'lucide-react'
import { Badge, Button, ConfirmModal, Input, Label, Modal, Tabs, Textarea } from '@/ui/primitives'
import { navigateHome, navigateToProject, useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { useProjects } from '@/store/projects'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { forkFromCheckpoint } from '@/core/vfs/projects'
import { KNOWLEDGE_MAX } from '@/core/ai/prompts'
import { fallbackThumbnail, persistThumbnail } from '@/core/preview/thumbnail'
import { isConnected } from '@/store/connections'
import { getPreviewFrame, postToPreview } from '@/ui/preview/bridge'
import { downloadBlob, slugify, timeAgo } from '@/lib/util'
import { haptic } from '@/lib/haptics'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'
import type { CheckpointMeta, FileDiff } from '@/core/vfs/types'

type Tab = 'overview' | 'knowledge' | 'versions' | 'integrations'

export const KNOWLEDGE_SNIPPETS = [
  { id: 'mobile', label: 'Mobile-First Polish', text: '## Mobile-first polish\n- Design for 375px first, then scale up with sm:/md:/lg:.\n- Touch targets at least 44px; no horizontal scrolling.\n- Respect safe-area insets and use 100dvh instead of 100vh.' },
  { id: 'ts', label: 'Strict TypeScript', text: '## Strict TypeScript\n- Use TypeScript with strict mode; never use `any`.\n- Export prop interfaces next to each component.\n- Prefer small pure helper functions and discriminated unions.' },
  { id: 'brand', label: 'Brand Style Guide', text: '## Brand style guide\n- Primary colour: #6D5EF5, accent: #F97316, neutral: zinc scale.\n- Tone: friendly, concise, confident.\n- Rounded-2xl cards, soft shadows, Inter font.' },
] as const

/** Appends a snippet to existing knowledge, skipping duplicates and respecting the injection cap. */
export function addSnippet(current: string, snippet: string): string {
  if (current.includes(snippet.split('\n')[0]!)) return current
  const next = current.trim() ? `${current.trim()}\n\n${snippet}` : snippet
  return next.slice(0, KNOWLEDGE_MAX)
}

/** Version history rows: user-visible checkpoints (AI turns + manual), numbered oldest→newest, newest first. */
export function versionRows(cps: CheckpointMeta[], bookmarks: string[] = [], onlyBookmarked = false) {
  const numbered = cps.filter((c) => c.kind === 'ai' || c.kind === 'manual').sort((a, b) => a.seq - b.seq).map((c, i) => ({ cp: c, n: i + 1, starred: bookmarks.includes(c.id) }))
  return numbered.filter((r) => !onlyBookmarked || r.starred).reverse()
}

function Overview({ close }: { close: () => void }) {
  const vfs = useWorkspace((s) => s.vfs)!
  const projects = useProjects()
  const [name, setName] = useState(vfs.meta.name)
  const [desc, setDesc] = useState(vfs.meta.description ?? '')
  const [confirm, setConfirm] = useState(false)
  const [thumb, setThumb] = useState(vfs.meta.thumbnail)
  const save = async () => {
    if (name.trim() && name.trim() !== vfs.meta.name) await useWorkspace.getState().renameProject(name)
    if (desc !== (vfs.meta.description ?? '')) { vfs.meta.description = desc; await projects.update(vfs.meta.id, { description: desc, updatedAt: vfs.meta.updatedAt }) }
  }
  const refresh = async () => {
    if (getPreviewFrame()) { postToPreview(null, { type: 'thumb:capture', id: 'thumb' }); toast.info('Refreshing thumbnail…'); setTimeout(() => setThumb(vfs.meta.thumbnail), 1800); return }
    const url = fallbackThumbnail(vfs.meta.name)
    if (await persistThumbnail(getAdapter(), vfs.meta.id, url)) { vfs.meta.thumbnail = url; setThumb(url); toast.success('Thumbnail refreshed') }
  }
  const zip = async () => { const { exportZip } = await import('@/core/vfs/zip'); downloadBlob(await exportZip(vfs.snapshot(), vfs.meta.name, { scaffold: true }), `${slugify(vfs.meta.name)}.zip`); toast.success('Runnable ZIP downloaded') }
  return (
    <div className="space-y-5" data-ps-section="overview">
      <div><Label>Project name</Label><Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()} aria-label="Project name" /></div>
      <div><Label>Description</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => void save()} aria-label="Project description" /></div>
      <div className="flex items-center gap-3">
        <div className="dot-grid flex aspect-[16/10] w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-subtle">{thumb ? <img src={thumb} alt="Project thumbnail" className="h-full w-full object-cover object-top" /> : <ImageIcon className="text-faint" />}</div>
        <Button onClick={() => void refresh()}><RefreshCw size={13} />Refresh thumbnail</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={async () => { const c = await projects.duplicate(vfs.meta.id); toast.success('Remixed', c.name); close(); navigateToProject(c.id) }}><Copy size={13} />Fork / Remix</Button>
        <Button onClick={() => void zip()}><Download size={13} />Download runnable ZIP</Button>
      </div>
      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-3"><p className="mb-2 text-xs font-semibold text-danger">Danger zone</p><Button variant="danger" onClick={() => setConfirm(true)}><Trash2 size={13} />Delete project</Button></div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} danger title="Delete project?" message={<>“{vfs.meta.name}” and all of its files, checkpoints and chat will be permanently removed from this browser.</>} confirmLabel="Delete" onConfirm={async () => { await projects.remove(vfs.meta.id); close(); navigateHome(); toast.success('Project deleted') }} />
    </div>
  )
}

function Knowledge() {
  const vfs = useWorkspace((s) => s.vfs)!
  const [text, setText] = useState(vfs.meta.knowledge ?? '')
  const saved = (vfs.meta.knowledge ?? '') === text
  const save = async () => { vfs.meta.knowledge = text; await useProjects.getState().update(vfs.meta.id, { knowledge: text, updatedAt: vfs.meta.updatedAt }); haptic('success'); toast.success('Project Knowledge saved', 'Injected into every AI turn for this project.') }
  return (
    <div className="space-y-3" data-ps-section="knowledge">
      <p className="text-xs text-muted">Standing instructions for this project — brand colours, tone, audience, conventions, API shapes. They are added to the AI context on <strong>every</strong> turn.</p>
      <div className="flex flex-wrap gap-1.5">{KNOWLEDGE_SNIPPETS.map((s) => <button key={s.id} onClick={() => setText((t) => addSnippet(t, s.text))} className="press min-h-[36px] rounded-full border border-line bg-subtle px-3 text-xs font-medium hover:border-line-strong">+ {s.label}</button>)}</div>
      <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value.slice(0, KNOWLEDGE_MAX))} placeholder="# Brand&#10;Primary colour #6D5EF5…" aria-label="Project knowledge" className="font-mono text-[12.5px]" />
      <div className="flex items-center justify-between"><span className="text-[11px] text-faint">{text.length}/{KNOWLEDGE_MAX} characters</span><Button variant="primary" disabled={saved} onClick={() => void save()}>{saved ? 'Saved' : 'Save knowledge'}</Button></div>
    </div>
  )
}

function Versions({ close }: { close: () => void }) {
  const vfs = useWorkspace((s) => s.vfs)!
  useVfsVersion(vfs)
  const [only, setOnly] = useState(false)
  const [diff, setDiff] = useState<{ id: string; diffs: FileDiff[] } | null>(null)
  const [, bump] = useState(0)
  const rows = versionRows(vfs.listCheckpoints(), vfs.meta.bookmarks, only)
  const star = async (id: string) => { const cur = vfs.meta.bookmarks ?? []; const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; vfs.meta.bookmarks = next; await useProjects.getState().update(vfs.meta.id, { bookmarks: next, updatedAt: vfs.meta.updatedAt }); bump((x) => x + 1) }
  const restore = async (cp: CheckpointMeta, n: number) => { await vfs.checkpoint(`Safety checkpoint before restoring v${n}`, 'auto'); await vfs.restore(cp.id); haptic('success'); toast.success(`Restored v${n}`, 'A safety checkpoint was saved first.') }
  return (
    <div className="space-y-3" data-ps-section="versions">
      <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} aria-label="Bookmarked only" />Bookmarked only</label>
      {rows.length === 0 && <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">{only ? 'No bookmarked versions yet.' : 'Versions appear after each AI edit or manual checkpoint.'}</p>}
      <ol className="space-y-2">
        {rows.map(({ cp, n, starred }) => (
          <li key={cp.id} data-version-row={n} className="rounded-2xl border border-line bg-subtle/50 p-3">
            <div className="flex items-start gap-2.5"><Badge tone="accent" className="mt-0.5 shrink-0 text-[11px]">v{n}</Badge><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium" title={cp.label}>{cp.label}</p><p className="text-[11px] text-faint">{timeAgo(cp.createdAt)} · {cp.fileCount} files · {cp.kind}</p></div>
              <button onClick={() => void star(cp.id)} aria-pressed={starred} aria-label={starred ? `Remove bookmark from v${n}` : `Bookmark v${n}`} className="press flex h-9 w-9 items-center justify-center rounded-full hover:bg-subtle"><Bookmark size={15} className={cn(starred ? 'fill-accent text-accent' : 'text-muted')} /></button></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="xs" onClick={async () => setDiff(diff?.id === cp.id ? null : { id: cp.id, diffs: await vfs.diffAgainstCheckpoint(cp.id) })}>Compare</Button>
              <Button size="xs" onClick={async () => { const p = await forkFromCheckpoint(getAdapter(), vfs, cp.id); await useProjects.getState().refresh(); close(); navigateToProject(p.id) }}><GitFork size={11} />Fork</Button>
              <Button size="xs" variant="primary" onClick={() => void restore(cp, n)}><RotateCcw size={11} />Restore</Button>
            </div>
            {diff?.id === cp.id && <ul className="mt-2 space-y-0.5 font-mono text-[11px]">{diff.diffs.length === 0 ? <li className="text-muted">Identical to the current files.</li> : diff.diffs.slice(0, 30).map((d) => <li key={d.path} className="truncate text-muted"><span className={d.status === 'added' ? 'text-success' : d.status === 'removed' ? 'text-danger' : 'text-warn'}>{d.status === 'added' ? '+' : d.status === 'removed' ? '−' : '~'}</span> {d.path}</li>)}</ul>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Integrations({ close }: { close: () => void }) {
  const vfs = useWorkspace((s) => s.vfs)!
  const gh = isConnected('github'), sb = isConnected('supabase')
  const open = (tab: string) => { close(); useApp.getState().openPublish(tab) }
  const card = 'rounded-2xl border border-line bg-subtle/50 p-4'
  return (
    <div className="space-y-3" data-ps-section="integrations">
      <div className={card}><div className="flex items-center gap-2"><GitBranch size={16} /><h3 className="text-sm font-semibold">GitHub Sync</h3><Badge tone={gh ? 'success' : 'neutral'}>{gh ? 'connected' : 'not connected'}</Badge></div>
        <p className="mt-1 text-xs text-muted">{vfs.meta.sourceRepo ? <>Source repo <span className="font-mono">{vfs.meta.sourceRepo}</span>.</> : 'Push this project to a repository or import one.'}</p>
        <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => open('git')}>Push / pull</Button>{!gh && <Button size="sm" variant="ghost" onClick={() => { close(); useApp.getState().openSettings('connections') }}>Connect GitHub</Button>}</div></div>
      <div className={card}><div className="flex items-center gap-2"><Database size={16} /><h3 className="text-sm font-semibold">Supabase</h3><Badge tone={sb ? 'success' : 'neutral'}>{sb ? 'connected' : 'not connected'}</Badge></div>
        <p className="mt-1 text-xs text-muted">Explore tables and inject a typed client into <span className="font-mono">src/lib/supabase.ts</span>.</p>
        <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => open('supabase')}>Table explorer &amp; client</Button>{!sb && <Button size="sm" variant="ghost" onClick={() => { close(); useApp.getState().openSettings('connections') }}>Connect Supabase</Button>}</div></div>
    </div>
  )
}

/** Project Settings hub: Overview, Project Knowledge, Version History and Integrations (modal on desktop, sheet on phones). */
export function ProjectSettings() {
  const { projectSettingsOpen, projectSettingsTab, closeProjectSettings } = useApp()
  const vfs = useWorkspace((s) => s.vfs)
  const [tab, setTab] = useState<Tab>('overview')
  useEffect(() => { if (projectSettingsOpen) setTab((projectSettingsTab as Tab) || 'overview') }, [projectSettingsOpen, projectSettingsTab])
  if (!vfs) return null
  return (
    <Modal open={projectSettingsOpen} onClose={closeProjectSettings} title="Project settings" description={vfs.meta.name} size="lg">
      <Tabs size="sm" className="-mx-1 mb-4 border-b border-line" value={tab} onChange={setTab} items={[
        { id: 'overview', label: 'Overview', icon: <SlidersHorizontal size={13} /> }, { id: 'knowledge', label: 'Knowledge', icon: <BookOpen size={13} /> },
        { id: 'versions', label: 'Versions', icon: <History size={13} /> }, { id: 'integrations', label: 'Integrations', icon: <GitBranch size={13} /> },
      ]} />
      {tab === 'overview' && <Overview close={closeProjectSettings} />}
      {tab === 'knowledge' && <Knowledge />}
      {tab === 'versions' && <Versions close={closeProjectSettings} />}
      {tab === 'integrations' && <Integrations close={closeProjectSettings} />}
    </Modal>
  )
}
