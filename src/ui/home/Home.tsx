import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, Eye, GitBranch, Menu, MoreHorizontal, Pencil, Pin, PinOff, Search, SlidersHorizontal, Star, Trash2, Upload, Wand2 } from 'lucide-react'
import { Badge, Button, ConfirmModal, Dropdown, Input, Logo, Modal, Spinner } from '@/ui/primitives'
import { getConn, isConnected } from '@/store/connections'
import { importGitHubRepo, parseRepoUrl } from '@/core/deploy/github'
import { Composer } from '@/ui/chat/Composer'
import { AboutFaq } from './AboutFaq'
import { TemplateArt } from './TemplateArt'
import { SHOWCASE_CATEGORIES, filterShowcase, showcaseItems, type ShowcaseCategory, type ShowcaseItem } from '@/templates/showcase'
import { projectSnapshot } from '@/core/vfs/projects'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { useSettings } from '@/store/settings'
import { downloadBlob, slugify } from '@/lib/util'
import { matchesProject } from '@/lib/projectFilters'
import { TemplateIcon } from '@/ui/TemplateIcon'
import { getAllTemplates, getTemplate } from '@/templates'
import { useProjects } from '@/store/projects'
import { navigateToProject, useApp } from '@/store/app'
import { timeAgo } from '@/lib/util'
import { cn } from '@/lib/cn'
import { toast } from '@/store/toast'
import type { ProjectMeta } from '@/core/vfs/types'

function deriveName(prompt: string) {
  const words = prompt.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).slice(0, 5).join(' ')
  return words ? words[0].toUpperCase() + words.slice(1) : 'Untitled project'
}

const STARTERS = [
  { label: 'Pricing page', prompt: 'A pricing page with three tiers, a monthly/yearly toggle and a FAQ' },
  { label: 'Habit tracker', prompt: 'A habit tracker with streaks, a weekly heatmap and dark mode' },
  { label: 'Kanban board', prompt: 'A kanban board with drag-and-drop columns, labels and due dates' },
  { label: 'Portfolio', prompt: 'A modern personal portfolio with project gallery and contact form' },
  { label: 'AI chat UI', prompt: 'A polished AI chat interface with conversation list and markdown replies' },
]

function ProjectCard({ p, onRename, onDelete }: { p: ProjectMeta; onRename: () => void; onDelete: () => void }) {
  const projects = useProjects()
  const openSettings = useApp((s) => s.openProjectSettings)
  const initial = p.name.trim()[0]?.toUpperCase() ?? '?'
  const exportZip = async () => {
    try {
      const { exportZip: zip } = await import('@/core/vfs/zip')
      downloadBlob(await zip(await projectSnapshot(getAdapter(), p.id), p.name, { scaffold: true }), `${slugify(p.name)}.zip`)
      toast.success('ZIP exported')
    } catch (e) { toast.error('Export failed', e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div data-project-card onClick={() => navigateToProject(p.id)} className="group surface-1 relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-line transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
      <div className="dot-grid relative flex aspect-[16/10] items-center justify-center overflow-hidden border-b border-line bg-subtle">
        {p.thumbnail ? <img src={p.thumbnail} alt={`${p.name} preview`} loading="lazy" className="h-full w-full object-cover object-top" /> : <span className="text-4xl font-semibold tracking-tight text-faint">{initial}</span>}
        <button onClick={(e) => { e.stopPropagation(); void projects.update(p.id, { starred: !p.starred, updatedAt: p.updatedAt }) }} aria-label={p.starred ? 'Unstar project' : 'Star project'} aria-pressed={!!p.starred} className="press absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-panel/85 shadow-sm backdrop-blur"><Star size={15} className={p.starred ? 'fill-accent text-accent' : 'text-muted'} /></button>
      </div>
      <div className="flex items-start justify-between gap-2 p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">{p.pinned && <Pin size={11} className="shrink-0 text-accent" />}<h3 className="truncate text-sm font-semibold">{p.name}</h3></div>
          <p className="mt-0.5 text-xs text-muted">Edited {timeAgo(p.updatedAt)}{p.forkOf ? ' · remix' : ''}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown align="end" width={210} mobileSheet sheetTitle={p.name} trigger={<Button variant="ghost" size="icon" aria-label="Project actions"><MoreHorizontal size={16} /></Button>}
            items={[
              { label: 'Open', icon: <Eye size={14} />, onSelect: () => navigateToProject(p.id) },
              { label: 'Rename', icon: <Pencil size={14} />, onSelect: onRename },
              { label: 'Fork / Remix', icon: <Copy size={14} />, onSelect: async () => { const c = await projects.duplicate(p.id); toast.success('Remixed', c.name) } },
              { label: 'Project settings', icon: <SlidersHorizontal size={14} />, onSelect: () => { navigateToProject(p.id); openSettings() } },
              { label: 'Export ZIP', icon: <Download size={14} />, onSelect: exportZip },
              { label: p.pinned ? 'Unpin' : 'Pin to top', icon: p.pinned ? <PinOff size={14} /> : <Pin size={14} />, onSelect: () => projects.update(p.id, { pinned: !p.pinned, updatedAt: p.updatedAt }) },
              { separator: true },
              { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
            ]} />
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const projects = useProjects()
  const { setPendingPrompt, setSidebarOpen } = useApp()
  const aiMode = useSettings((x) => x.aiMode)
  const setSettings = useSettings((x) => x.set)
  const [category, setCategory] = useState<ShowcaseCategory>('All')
  const [previewing, setPreviewing] = useState<ShowcaseItem | null>(null)
  const [prompt, setPrompt] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [tplId, setTplId] = useState('blank')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null)
  const zipInput = useRef<HTMLInputElement>(null)
  const [ghOpen, setGhOpen] = useState(false)
  const [ghUrl, setGhUrl] = useState('')
  const [ghBusy, setGhBusy] = useState(false)
  const [ghLog, setGhLog] = useState('')
  const importGh = async () => {
    const ref = parseRepoUrl(ghUrl)
    if (!ref) return toast.error('Enter a repository like owner/name or a github.com URL')
    setGhBusy(true)
    try {
      const token = isConnected('github') ? getConn('github').token : undefined // includes the GitHub OAuth token (see store/connections)
      const r = await importGitHubRepo({ ...ref, token, onLog: setGhLog })
      if (!Object.keys(r.files).length) throw new Error('No importable files found in that repository')
      const p = await projects.create({ name: r.name, files: r.files, description: r.description, sourceRepo: `${ref.owner}/${ref.repo}`, checkpointLabel: `Imported ${ref.owner}/${ref.repo}@${r.ref}` })
      toast.success('Repository imported', `${Object.keys(r.files).length} files${r.skipped ? ` · ${r.skipped} skipped` : ''}`)
      setGhOpen(false)
      navigateToProject(p.id)
    } catch (e) {
      toast.error('GitHub import failed', e instanceof Error ? e.message : String(e))
    } finally { setGhBusy(false) }
  }
  const onZip = async (f: File) => {
    try {
      const { importZip } = await import('@/core/vfs/zip')
      const r = await importZip(f)
      if (!Object.keys(r.files).length) throw new Error('The archive has no importable files')
      const p = await projects.create({ name: r.name ?? f.name.replace(/\.zip$/i, ''), files: r.files, checkpointLabel: 'Imported from ZIP' })
      toast.success('Project imported', r.skipped.length ? `${r.skipped.length} oversized/binary files skipped` : `${Object.keys(r.files).length} files`)
      navigateToProject(p.id)
    } catch (e) {
      toast.error('Import failed', e instanceof Error ? e.message : String(e))
    }
  }
  const templates = getAllTemplates()

  useEffect(() => { void projects.refresh() }, [])

  const filtered = useMemo(() => projects.projects.filter((p) => matchesProject(p, query)), [projects.projects, query])
  const showcase = useMemo(() => filterShowcase(showcaseItems(templates), category), [templates, category])

  const start = async (override?: string) => {
    if (busy) return
    const text = (override ?? prompt).trim()
    setBusy(true)
    try {
      const tpl = getTemplate(tplId)
      const p = await projects.create({ name: text ? deriveName(text) : tpl.name, files: tpl.files, templateId: tpl.id })
      if (text) setPendingPrompt({ text, images })
      navigateToProject(p.id)
    } catch (e) {
      toast.error('Could not create project', e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  const remix = async (item: ShowcaseItem) => {
    if (busy) return
    setBusy(true)
    try {
      const p = await projects.create({ name: item.template.name, files: item.template.files, templateId: item.template.id })
      toast.success('Remixed template', item.template.name)
      setPreviewing(null)
      navigateToProject(p.id)
    } catch (e) { toast.error('Could not remix', e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header role="banner" className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/80 px-3 pb-2 backdrop-blur-xl sm:px-6" style={{ paddingTop: 'calc(var(--sat, 0px) + 8px)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-subtle md:hidden"><Menu size={20} /></button>
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">UnQStudio</span>
          <Badge tone="accent" className="hidden sm:inline-flex">v3.0</Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-8">
        <section className="bg-mesh -mx-4 flex flex-col items-center rounded-b-[2.5rem] px-4 pb-12 pt-12 text-center sm:-mx-8 sm:px-8 sm:pt-20" data-hero>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            What should we <span className="bg-gradient-to-r from-accent to-fuchsia-500 bg-clip-text text-transparent">build</span> today?
          </h1>
          <p className="mt-4 max-w-xl text-balance text-sm text-muted sm:text-base">
            Describe an app and watch it appear. Bring your own model key — your code and keys never leave your device.
          </p>

          <div className="composer-float mt-9 w-full max-w-2xl text-left" data-hero-composer>
            <Composer
              variant="hero"
              value={prompt}
              onChange={setPrompt}
              images={images}
              onImages={setImages}
              onSubmit={() => void start()}
              busy={busy}
              allowEmptySubmit
              submitLabel="Create project"
              autoFocus
              mode={aiMode}
              onMode={(m) => setSettings({ aiMode: m })}
              placeholder="A pricing page with three tiers, a monthly/yearly toggle and a FAQ…"
            />
          </div>

          <div className="mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2" data-starter-chips>
            {STARTERS.map((c) => (
              <button key={c.label} onClick={() => void start(c.prompt)} title={c.prompt} className="press flex min-h-[40px] items-center gap-1.5 rounded-full border border-line bg-panel/80 px-3.5 text-xs font-medium text-muted backdrop-blur hover:border-line-strong hover:text-fg"><Wand2 size={12} className="text-accent" />{c.label}</button>
            ))}
          </div>
          <div className="mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-xs text-faint">Start from</span>
            {templates.map((t) => (
              <button key={t.id} onClick={() => setTplId(t.id)} title={t.description} className={cn('press flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition', tplId === t.id ? 'border-fg bg-fg text-bg' : 'border-line bg-panel/70 text-muted hover:border-line-strong hover:text-fg')}>
                <TemplateIcon name={t.icon} size={13} />{t.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Recent projects <span data-project-count className="ml-1 font-normal text-faint">{projects.projects.length}</span></h2>
            <div className="flex items-center gap-2">
              <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onZip(f) }} />
              <Button size="sm" onClick={() => zipInput.current?.click()}><Upload size={13} />Import ZIP</Button>
              <Button size="sm" onClick={() => setGhOpen(true)}><GitBranch size={13} />From GitHub</Button>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" className="h-8 w-44 pl-8 text-xs sm:w-56" aria-label="Search projects" />
              </div>
            </div>
          </div>
          {!projects.loaded ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="animate-pulse-soft h-48 rounded-2xl border border-line bg-panel" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong py-16 text-center text-sm text-muted">
              {projects.projects.length ? 'No projects match your search.' : 'No projects yet — describe an idea above or pick a template.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => (
                <ProjectCard key={p.id} p={p} onRename={() => { setRenaming(p); setRenameVal(p.name) }} onDelete={() => setDeleting(p)} />
              ))}
            </div>
          )}
        </section>

        <section id="showcase" className="mt-14" data-showcase>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Templates &amp; Showcase</h2>
            <div className="scrollbar-none -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-1" role="group" aria-label="Template categories">
              {SHOWCASE_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c} className={cn('press min-h-[36px] shrink-0 rounded-full border px-3.5 text-xs font-medium', category === c ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-muted hover:text-fg')}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {showcase.map((it) => (
              <div key={it.template.id} data-showcase-card={it.category} className="surface-1 flex flex-col overflow-hidden rounded-3xl border border-line">
                <TemplateArt kind={it.art} hue={it.hue} className="aspect-[16/10] w-full border-b border-line" />
                <div className="flex flex-1 flex-col gap-3 p-3.5">
                  <div className="min-w-0"><div className="flex items-center justify-between gap-2"><h3 className="truncate text-sm font-semibold">{it.template.name}</h3><Badge>{it.category}</Badge></div><p className="mt-1 line-clamp-2 text-xs text-muted">{it.template.description}</p></div>
                  <div className="mt-auto flex gap-2">
                    <Button size="sm" className="min-h-[40px] flex-1" onClick={() => setPreviewing(it)}><Eye size={13} />Preview</Button>
                    <Button size="sm" variant="accent" className="min-h-[40px] flex-1" onClick={() => void remix(it)} disabled={busy}>Remix</Button>
                  </div>
                </div>
              </div>
            ))}
            {showcase.length === 0 && <p className="col-span-full rounded-2xl border border-dashed border-line-strong py-10 text-center text-sm text-muted">No templates in this category yet.</p>}
          </div>
        </section>
      </main>
      <AboutFaq />

      <Modal open={!!previewing} onClose={() => setPreviewing(null)} title={previewing?.template.name} description={previewing?.template.description} size="lg"
        footer={<><Button variant="ghost" onClick={() => setPreviewing(null)}>Close</Button><Button variant="accent" onClick={() => previewing && void remix(previewing)} disabled={busy}>Remix this template</Button></>}>
        {previewing && (
          <div className="space-y-3" data-template-preview>
            <TemplateArt kind={previewing.art} hue={previewing.hue} className="aspect-[16/10] w-full overflow-hidden rounded-2xl border border-line" />
            <p className="text-xs text-muted">{Object.keys(previewing.template.files).length} files · {previewing.category} · fully editable after remixing</p>
            <div className="flex flex-wrap gap-1.5">{Object.keys(previewing.template.files).slice(0, 14).map((f) => <span key={f} className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-muted">{f}</span>)}</div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename project"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button><Button variant="primary" onClick={async () => { if (renaming && renameVal.trim()) { await projects.update(renaming.id, { name: renameVal.trim() }); setRenaming(null) } }}>Save</Button></>}
      >
        <Input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </Modal>
      <Modal open={ghOpen} onClose={() => setGhOpen(false)} title="Import from GitHub" description="Public repositories work without a token. Connect GitHub in Settings → Connections for private repos and higher rate limits." size="sm"
        footer={<><Button variant="ghost" onClick={() => setGhOpen(false)}>Cancel</Button><Button variant="primary" onClick={importGh} disabled={ghBusy || !ghUrl.trim()}>{ghBusy && <Spinner size={13} />}Import</Button></>}>
        <Input autoFocus value={ghUrl} onChange={(e) => setGhUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void importGh()} placeholder="owner/repo or https://github.com/owner/repo/tree/branch" spellCheck={false} />
        {ghLog && <p className="mt-2 text-xs text-muted">{ghLog}</p>}
      </Modal>
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        danger
        title="Delete project?"
        message={<>“{deleting?.name}” and all of its files, checkpoints and chat will be permanently removed from this browser.</>}
        confirmLabel="Delete"
        onConfirm={async () => { if (deleting) { await projects.remove(deleting.id); toast.success('Project deleted') } }}
      />
    </div>
  )
}
