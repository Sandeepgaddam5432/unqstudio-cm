import { useEffect, useMemo, useRef, useState } from 'react'
import { BookText, Database, GitBranch, Menu, Search, Upload, Wand2 } from 'lucide-react'
import { Badge, Button, ConfirmModal, Input, Logo, Modal, Spinner, type MenuItem } from '@/ui/primitives'
import { getConn, isConnected } from '@/store/connections'
import { importGitHubRepo, parseRepoUrl } from '@/core/deploy/github'
import { Composer } from '@/ui/chat/Composer'
import { ProjectCard } from './ProjectCard'
import { AccountAvatarButton, WorkspaceSwitcherPill } from '@/ui/layout/WorkspaceSwitcher'
import { useIsMobile } from '@/lib/useMedia'
import { AuroraBackdrop } from './AuroraBackdrop'
import { AboutFaq } from './AboutFaq'
import { TemplateCard, TemplatePreviewFrame } from './TemplateCard'
import { SHOWCASE_CATEGORIES, filterShowcase, showcaseItems, type ShowcaseCategory, type ShowcaseItem } from '@/templates/showcase'
import { useSettings } from '@/store/settings'
import { matchesProject } from '@/lib/projectFilters'
import { TemplateIcon } from '@/ui/TemplateIcon'
import { getAllTemplates, getTemplate } from '@/templates'
import { useProjects } from '@/store/projects'
import { navigateToProject, useApp } from '@/store/app'
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
  const mobile = useIsMobile()
  const openSettings = useApp((s) => s.openSettings)
  const [importOpen, setImportOpen] = useState(false)
  const [composerH, setComposerH] = useState(130)
  const composerWrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = composerWrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setComposerH(Math.round(el.getBoundingClientRect().height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [mobile])

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

  const plusItems: MenuItem[] = [
    { label: 'Import project', hint: 'From GitHub or a ZIP file', icon: <Upload size={14} />, onSelect: () => setImportOpen(true) },
    { label: 'Add context', hint: 'Start the prompt with context', icon: <BookText size={14} />, onSelect: () => { setPrompt((v) => (v ? v + '\n\n' : '') + 'Context: '); setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(), 60) } },
    { label: 'Databases', hint: 'Supabase & connections', icon: <Database size={14} />, onSelect: () => openSettings('connections') },
  ]
  const composerEl = (
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
              autoFocus={!mobile}
              plusItems={plusItems}
              mode={aiMode}
              onMode={(m) => setSettings({ aiMode: m })}
              placeholder="A pricing page with three tiers, a monthly/yearly toggle and a FAQ…"
            />
  )

  return (
    <div className="flex min-h-full flex-col">
      {mobile ? (
        <header role="banner" data-mobile-home-header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-2" style={{ paddingTop: 'calc(var(--sat, 0px) + 8px)' }}>
          <WorkspaceSwitcherPill />
          <AccountAvatarButton />
        </header>
      ) : (
        <header role="banner" className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/80 px-3 pb-2 backdrop-blur-xl sm:px-6" style={{ paddingTop: 'calc(var(--sat, 0px) + 8px)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-subtle md:hidden"><Menu size={20} /></button>
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">UnQStudio</span>
          <Badge tone="accent" className="hidden sm:inline-flex">v3.1</Badge>
        </div>
        <AccountAvatarButton />
      </header>
      )}

      <main className={cn('mx-auto w-full max-w-6xl flex-1 sm:px-8', mobile ? 'px-0 pb-32' : 'px-4 pb-24')}>
        <section className={cn('relative isolate overflow-hidden text-center', mobile ? 'h-[100dvh] min-h-[560px]' : '-mx-4 flex flex-col items-center rounded-b-[2.5rem] px-4 pb-12 pt-12 sm:-mx-8 sm:px-8 sm:pt-20')} data-hero data-launchpad={mobile ? '' : undefined} style={mobile ? ({ '--composer-height': `${composerH}px` } as React.CSSProperties) : undefined}>
          <AuroraBackdrop className="-z-10" />
          {mobile ? (
            <>
              <div className="absolute inset-x-0 mx-auto flex w-full max-w-[672px] flex-col items-center px-4" style={{ bottom: 'calc(55dvh - var(--composer-height) - 14px)' }} data-launch-stack>
                <h1 className="t-headline mb-4 max-w-[320px] text-balance font-semibold">What should we <span className="bg-gradient-to-r from-accent to-fuchsia-500 bg-clip-text text-transparent">build</span> today?</h1>
                <div ref={composerWrap} className="composer-float w-full text-left" data-hero-composer>{composerEl}</div>
              </div>
              <div className="scrollbar-none absolute inset-x-0 flex gap-2 overflow-x-auto px-4" style={{ bottom: 'calc(55dvh - var(--composer-height) - 14px - 52px)' }} data-starter-chips>
                {STARTERS.map((c) => (
                  <button key={c.label} onClick={() => void start(c.prompt)} title={c.prompt} className="press flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary/90 px-3.5 text-xs font-medium text-fg-secondary shadow-xs-surface backdrop-blur"><Wand2 size={12} className="text-accent" />{c.label}</button>
                ))}
              </div>
              <div className="scrollbar-none absolute inset-x-0 flex items-center gap-2 overflow-x-auto px-4" style={{ bottom: 'calc(55dvh - var(--composer-height) - 14px - 100px)' }} data-template-chips>
                <span className="shrink-0 text-xs text-fg-quaternary">Start from</span>
                {templates.map((t) => (
                  <button key={t.id} onClick={() => setTplId(t.id)} title={t.description} aria-pressed={tplId === t.id} className={cn('press flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium', tplId === t.id ? 'bg-fg-primary text-base' : 'bg-primary/90 text-fg-secondary shadow-xs-surface')}><TemplateIcon name={t.icon} size={13} />{t.name}</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 className="t-headline max-w-3xl text-balance font-semibold">What should we <span className="bg-gradient-to-r from-accent to-fuchsia-500 bg-clip-text text-transparent">build</span> today?</h1>
              <p className="t-label mt-3 max-w-xl text-balance text-fg-tertiary">Describe an app and watch it appear. Bring your own model key — your code and keys never leave your device.</p>
              <div ref={composerWrap} className="composer-float mt-9 w-full max-w-[672px] text-left" data-hero-composer>{composerEl}</div>
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
            </>
          )}
        </section>

        {!mobile && <section>
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
        </section>}

        <section id="showcase" className={cn('mt-14', mobile && 'px-4')} data-showcase>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Templates &amp; Showcase</h2>
            <div className="scrollbar-none -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-1" role="group" aria-label="Template categories">
              {SHOWCASE_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c} className={cn('press min-h-[36px] shrink-0 rounded-full border px-3.5 text-xs font-medium', category === c ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-muted hover:text-fg')}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {showcase.map((it) => <TemplateCard key={it.template.id} item={it} busy={busy} onPreview={() => setPreviewing(it)} onRemix={() => void remix(it)} />)}
            {showcase.length === 0 && <p className="col-span-full rounded-2xl border border-dashed border-line-strong py-10 text-center text-sm text-muted">No templates in this category yet.</p>}
          </div>
        </section>
      </main>
      <AboutFaq />

      <Modal open={!!previewing} onClose={() => setPreviewing(null)} title={previewing?.template.name} description={previewing?.template.description} size="lg"
        footer={<><Button variant="ghost" onClick={() => setPreviewing(null)}>Close</Button><Button variant="accent" onClick={() => previewing && void remix(previewing)} disabled={busy}>Remix this template</Button></>}>
        {previewing && (
          <div className="space-y-3" data-template-preview>
            <TemplatePreviewFrame template={previewing.template} interactive className="w-full overflow-hidden rounded-2xl border border-line" />
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
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import project" description="Bring an existing project into UnQStudio." size="sm">
        <div className="space-y-2" data-import-chooser>
          <button className="press flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] shadow-xs-surface hover:shadow-md-surface" onClick={() => { setImportOpen(false); setGhOpen(true) }}><GitBranch size={16} />From a GitHub repository</button>
          <button className="press flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] shadow-xs-surface hover:shadow-md-surface" onClick={() => { setImportOpen(false); zipInput.current?.click() }}><Upload size={16} />From a ZIP file</button>
        </div>
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
