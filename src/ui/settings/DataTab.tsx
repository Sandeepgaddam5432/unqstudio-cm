import { useEffect, useRef, useState } from 'react'
import { Download, HardDrive, Trash2, Upload } from 'lucide-react'
import { Badge, Button, ConfirmModal, Input, Section, Switch } from '@/ui/primitives'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { createBackup, restoreBackup, validateBackup } from '@/core/vfs/backup'
import { VirtualFileSystem } from '@/core/vfs/vfs'
import { clearCdnCache, cdnCacheSize } from '@/core/runtime/cdnCache'
import { vault } from '@/store/vault'
import { useProjects } from '@/store/projects'
import { downloadBlob, formatBytes } from '@/lib/util'
import { toast } from '@/store/toast'
import type { StorageStats } from '@/core/vfs/types'

const settingsKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('unq.'))

export function DataTab() {
  const adapter = getAdapter()
  const projects = useProjects()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [est, setEst] = useState<{ usage?: number; quota?: number }>({})
  const [cdn, setCdn] = useState(0)
  const [inclCp, setInclCp] = useState(true)
  const [inclChats, setInclChats] = useState(true)
  const [inclVault, setInclVault] = useState(false)
  const [confirm, setConfirm] = useState<null | { title: string; message: string; run: () => Promise<void>; label: string }>(null)
  const [chats, setChats] = useState<Array<{ key: string; name: string; count: number }>>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [resetText, setResetText] = useState('')
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof validateBackup> | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setStats(await adapter.stats())
    setEst((await navigator.storage?.estimate?.()) ?? {})
    setCdn(await cdnCacheSize())
    await projects.refresh()
    const names = new Map(useProjects.getState().projects.map((p) => [p.id, p.name]))
    setChats((await adapter.kvList('chat:')).map(([key, v]) => ({ key, name: names.get(key.slice(5)) ?? '(deleted project)', count: ((v as { messages?: unknown[] })?.messages ?? []).length })))
  }
  useEffect(() => { void refresh() }, [])

  const exportBackup = async () => {
    const settings: Record<string, string> = {}
    for (const k of settingsKeys()) settings[k] = localStorage.getItem(k) ?? ''
    const b = await createBackup(adapter, { includeCheckpoints: inclCp, includeChats: inclChats, vault: inclVault ? vault().exportBlob() : null, settings })
    downloadBlob(new Blob([JSON.stringify(b)], { type: 'application/json' }), `unqstudio-backup-${new Date().toISOString().slice(0, 10)}.json`)
    toast.success('Backup exported', `${b.projects.length} projects`)
  }
  const onFile = async (f: File) => {
    try { setPendingImport(validateBackup(JSON.parse(await f.text()))) } catch (e) { toast.error('Import failed', e instanceof Error ? e.message : String(e)) }
  }
  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return
    const r = await restoreBackup(adapter, pendingImport, mode)
    for (const [k, v] of Object.entries(pendingImport.settings ?? {})) if (k.startsWith('unq.')) localStorage.setItem(k, v)
    toast.success('Backup restored', `${r.projects} projects, ${r.files} files — reloading…`)
    setTimeout(() => location.reload(), 900)
  }
  const pruneCheckpoints = async () => {
    for (const p of await adapter.listProjects()) {
      for (const c of await adapter.listCheckpoints(p.id)) await adapter.deleteCheckpoint(c.id)
      await adapter.putProject({ ...p, historyPtr: -1 })
      const vfs = await VirtualFileSystem.open(adapter, p.id)
      await vfs.checkpoint('Initial state', 'auto')
    }
  }
  const ask = (title: string, message: string, label: string, run: () => Promise<void>) => setConfirm({ title, message, label, run: async () => { await run(); toast.success('Done'); await refresh() } })

  const pct = est.quota ? Math.min(100, ((est.usage ?? 0) / est.quota) * 100) : 0
  return (
    <div className="p-5">
      <Section title="Storage" description="Everything lives in this browser (IndexedDB). Nothing is uploaded.">
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-medium"><HardDrive size={14} />{formatBytes(est.usage ?? stats?.bytes ?? 0)} used</span><span className="text-muted">{est.quota ? `of ${formatBytes(est.quota)} available` : 'quota unknown'}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, pct)}%` }} /></div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted">
            <Badge>{stats?.projects ?? 0} projects</Badge><Badge>{stats?.files ?? 0} files</Badge><Badge>{stats?.checkpoints ?? 0} checkpoints</Badge><Badge>{chats.length} chats</Badge><Badge>{cdn} cached modules</Badge>
          </div>
        </div>
      </Section>

      <Section title="Backup" description="Export or import projects, chats and settings as one JSON file.">
        <div className="space-y-2 rounded-2xl border border-line p-4 text-sm">
          {[['Include checkpoints (larger file)', inclCp, setInclCp], ['Include chats', inclChats, setInclChats], ['Include API-key vault (stays encrypted if you set a passphrase)', inclVault, setInclVault]].map(([l, v, s]) => (
            <label key={l as string} className="flex items-center justify-between gap-3 text-xs"><span>{l as string}</span><Switch checked={v as boolean} onChange={s as (v: boolean) => void} label={l as string} /></label>
          ))}
          <div className="flex gap-2 pt-1">
            <Button variant="primary" size="sm" onClick={exportBackup}><Download size={13} />Export backup</Button>
            <Button size="sm" onClick={() => file.current?.click()}><Upload size={13} />Import backup…</Button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} />
          </div>
        </div>
      </Section>

      <Section title="Chats" description="Bulk-manage conversation history.">
        <div className="rounded-2xl border border-line">
          {chats.length === 0 && <p className="p-4 text-center text-xs text-muted">No saved chats.</p>}
          {chats.map((c) => (
            <label key={c.key} className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs last:border-0">
              <input type="checkbox" checked={selected.has(c.key)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n })} aria-label={`Select chat of ${c.name}`} />
              <span className="flex-1 truncate">{c.name}</span><span className="text-muted">{c.count} messages</span>
            </label>
          ))}
        </div>
        {chats.length > 0 && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => setSelected(new Set(chats.map((c) => c.key)))}>Select all</Button><Button size="sm" variant="danger" disabled={!selected.size} onClick={() => ask('Delete selected chats?', `${selected.size} conversation(s) will be removed. Project files are not affected.`, 'Delete', async () => { for (const k of selected) await adapter.kvDelete(k); setSelected(new Set()) })}><Trash2 size={13} />Delete selected</Button></div>}
      </Section>

      <Section title="Clear data">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => ask('Clear compile cache?', 'Downloaded npm modules will be fetched again on the next build.', 'Clear', async () => { await clearCdnCache() })}>Clear compile cache</Button>
          <Button onClick={() => ask('Prune checkpoints?', 'All history is deleted; each project keeps one fresh checkpoint of its current state.', 'Prune', pruneCheckpoints)}>Prune all checkpoints</Button>
          <Button onClick={() => ask('Delete all chats?', 'Every conversation is removed.', 'Delete', async () => { for (const [k] of await adapter.kvList('chat:')) await adapter.kvDelete(k) })}>Delete all chats</Button>
          <Button variant="danger" onClick={() => ask('Delete ALL projects?', 'Every project, file and checkpoint is permanently deleted from this browser.', 'Delete everything', async () => { for (const p of await adapter.listProjects()) await adapter.deleteProject(p.id) })}>Delete all projects</Button>
          <Button variant="danger" onClick={() => ask('Wipe key vault?', 'All saved API keys and connection tokens are removed.', 'Wipe', async () => { await vault().wipe(); location.reload() })}>Wipe key vault</Button>
          <Button variant="danger" onClick={() => ask('Reset settings?', 'Preferences, prompts and plugins return to defaults (projects stay).', 'Reset', async () => { settingsKeys().forEach((k) => localStorage.removeItem(k)); location.reload() })}>Reset settings</Button>
        </div>
      </Section>

      <Section title="Factory reset" description="Deletes projects, chats, keys, settings and caches, then reloads.">
        <div className="flex gap-2">
          <Input value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder='Type RESET to confirm' className="h-9 max-w-52 text-xs" />
          <Button variant="danger" disabled={resetText !== 'RESET'} onClick={async () => { await adapter.clearAll(); await clearCdnCache(); settingsKeys().forEach((k) => localStorage.removeItem(k)); location.reload() }}>Factory reset</Button>
        </div>
      </Section>

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} danger title={confirm?.title ?? ''} message={confirm?.message} confirmLabel={confirm?.label} onConfirm={() => void confirm?.run()} />
      <ConfirmModal open={!!pendingImport} onClose={() => setPendingImport(null)} title="Import backup" message={<>This backup has <b>{pendingImport?.projects.length}</b> project(s) from {pendingImport && new Date(pendingImport.exportedAt).toLocaleString()}. Replace wipes the current data first; Merge keeps it and overwrites matching IDs. Choose “Replace” to confirm, or close to cancel.</>} confirmLabel="Replace" danger onConfirm={() => void doImport('replace')} />
      {pendingImport && <div className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2"><Button variant="primary" onClick={() => void doImport('merge')}>Merge instead</Button></div>}
    </div>
  )
}
