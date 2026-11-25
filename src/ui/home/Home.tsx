import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Moon, MoreHorizontal, Pencil, Pin, PinOff, Search, Settings, Sun, Trash2, Upload, GitBranch } from 'lucide-react'
import { Badge, Button, ConfirmModal, Dropdown, Input, Logo, Modal, Spinner, Tooltip } from '@/ui/primitives'
import { getConn, isConnected } from '@/store/connections'
import { importGitHubRepo, parseRepoUrl } from '@/core/deploy/github'
import { Composer } from '@/ui/chat/Composer'
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

function ProjectCard({ p, onRename, onDelete }: { p: ProjectMeta; onRename: () => void; onDelete: () => void }) {
  const projects = useProjects()
  const initial = p.name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <div
      onClick={() => navigateToProject(p.id)}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition hover:-translate-y-px hover:border-line-strong hover:shadow-pop"
    >
      <div className="dot-grid flex h-24 items-center justify-center rounded-xl border border-line bg-subtle">
        <span className="text-3xl font-semibold tracking-tight text-faint transition group-hover:text-fg">{initial}</span>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {p.pinned && <Pin size={11} className="shrink-0 text-accent" />}
            <h3 className="truncate text-sm font-medium">{p.name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted">{timeAgo(p.updatedAt)}{p.forkOf ? ' · fork' : ''}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            align="end"
            width={190}
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Project actions"><MoreHorizontal size={15} /></Button>}
            items={[
              { label: 'Rename', icon: <Pencil size={14} />, onSelect: onRename },
              { label: p.pinned ? 'Unpin' : 'Pin to top', icon: p.pinned ? <PinOff size={14} /> : <Pin size={14} />, onSelect: () => projects.update(p.id, { pinned: !p.pinned, updatedAt: p.updatedAt }) },
              { label: 'Duplicate / Fork', icon: <Copy size={14} />, onSelect: async () => { await projects.duplicate(p.id); toast.success('Project duplicated') } },
              { separator: true },
              { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const projects = useProjects()
  const { resolvedTheme, toggleTheme, openSettings, setPendingPrompt } = useApp()
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
      const token = isConnected('github') ? getConn('github').token : undefined
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

  const filtered = useMemo(() => projects.projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())), [projects.projects, query])

  const start = async () => {
    if (busy) return
    setBusy(true)
    try {
      const tpl = getTemplate(tplId)
      const p = await projects.create({ name: prompt.trim() ? deriveName(prompt) : tpl.name, files: tpl.files, templateId: tpl.id })
      if (prompt.trim()) setPendingPrompt({ text: prompt.trim(), images })
      navigateToProject(p.id)
    } catch (e) {
      toast.error('Could not create project', e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">UnQStudio</span>
          <Badge tone="accent" className="hidden sm:inline-flex">v1.0</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip label="Toggle theme"><Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">{resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</Button></Tooltip>
          <Tooltip label="Settings"><Button variant="ghost" size="icon" onClick={() => openSettings()} aria-label="Settings"><Settings size={16} /></Button></Tooltip>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-8">
        <section className="flex flex-col items-center pb-10 pt-14 text-center sm:pt-24">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Describe it. <span className="text-muted">Watch it build.</span>
          </h1>
          <p className="mt-4 max-w-xl text-balance text-sm text-muted sm:text-base">
            A static, in-browser AI engineering studio. Bring your own model key — your code and keys never leave your device.
          </p>

          <div className="mt-9 w-full max-w-2xl text-left">
            <Composer
              variant="hero"
              value={prompt}
              onChange={setPrompt}
              images={images}
              onImages={setImages}
              onSubmit={start}
              busy={busy}
              autoFocus
              placeholder="A pricing page with three tiers, a monthly/yearly toggle and a FAQ…"
            />
          </div>

          <div className="mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-xs text-faint">Start from</span>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTplId(t.id)}
                title={t.description}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition',
                  tplId === t.id ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-muted hover:border-line-strong hover:text-fg',
                )}
              >
                <TemplateIcon name={t.icon} size={13} />
                {t.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight">Recent projects <span className="ml-1 font-normal text-faint">{projects.projects.length}</span></h2>
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
      </main>

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
