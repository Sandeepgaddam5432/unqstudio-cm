import { useState } from 'react'
import { Download, FolderDown, FolderUp, FolderOpen } from 'lucide-react'
import { Button, Modal, Section } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { exportZip } from '@/core/vfs/zip'
import { downloadBlob, slugify, formatBytes } from '@/lib/util'
import { toast } from '@/store/toast'
import { ensurePermission, isFsAccessSupported, pickDirectory, readDirectoryToSnapshot, writeSnapshotToDirectory, type DirHandle } from '@/core/vfs/fsSync'
import { ensureScaffold } from '@/core/vfs/scaffold'

export function PublishModal() {
  const { publishOpen, setPublishOpen } = useApp()
  const vfs = useWorkspace((s) => s.vfs)
  const [busy, setBusy] = useState(false)
  const [dir, setDir] = useState<DirHandle | null>(null)

  const pickFolder = async () => {
    try { setDir(await pickDirectory()) } catch (e) { if ((e as Error).name !== 'AbortError') toast.error('Could not open folder', String(e)) }
  }
  const pushFolder = async () => {
    if (!vfs || !dir || !(await ensurePermission(dir))) return
    setBusy(true)
    try {
      const text = ensureScaffold(vfs.textFiles(), vfs.meta.name)
      const snap = vfs.snapshot()
      for (const [p, c] of Object.entries(text)) snap[p] = { c, e: 'utf8' }
      toast.success('Folder updated', `${await writeSnapshotToDirectory(dir, snap)} files written to ${dir.name}/`)
    } catch (e) { toast.error('Sync failed', String(e)) } finally { setBusy(false) }
  }
  const pullFolder = async () => {
    if (!vfs || !dir || !(await ensurePermission(dir, 'read'))) return
    setBusy(true)
    try {
      const snap = await readDirectoryToSnapshot(dir)
      if (!Object.keys(snap).length) throw new Error('Folder is empty')
      await vfs.checkpoint('Before folder import', 'auto')
      const incoming = Object.keys(snap)
      const text: Record<string, string> = {}
      for (const p of incoming) if (snap[p].e === 'utf8') text[p] = snap[p].c
      await vfs.writeMany(text, { actor: 'system' })
      for (const p of incoming) if (snap[p].e === 'base64') await vfs.write(p, snap[p].c, { actor: 'system', encoding: 'base64' })
      await vfs.checkpoint(`Imported from folder ${dir.name}`, 'manual')
      toast.success('Imported from folder', `${incoming.length} files`)
    } catch (e) { toast.error('Import failed', String(e)) } finally { setBusy(false) }
  }

  const download = async () => {
    if (!vfs) return
    setBusy(true)
    try {
      const blob = await exportZip(vfs.snapshot(), vfs.meta.name)
      downloadBlob(blob, `${slugify(vfs.meta.name)}.zip`)
      toast.success('Project exported', `${formatBytes(blob.size)} · run npm install && npm run dev`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish & Export" description="Everything runs in your browser. Nothing is uploaded unless you connect a service." size="lg">
      <Section title="Download project ZIP" description="A complete, runnable Vite + React + TypeScript + Tailwind project (package.json, vite.config.ts, index.html, src/*).">
        <Button variant="primary" onClick={download} disabled={busy || !vfs}><Download size={14} />{busy ? 'Packing…' : 'Download ZIP'}</Button>
      </Section>
      <Section
        title="Sync with a local folder"
        description={isFsAccessSupported() ? 'Uses the browser File System Access API. Push writes the project (with scaffolding) to a folder; Pull imports changes you made in your editor.' : 'Your browser does not support the File System Access API (use Chrome, Edge or Brave). ZIP export works everywhere.'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={pickFolder} disabled={!isFsAccessSupported()}><FolderOpen size={14} />{dir ? dir.name : 'Choose folder…'}</Button>
          <Button onClick={pushFolder} disabled={!dir || busy}><FolderUp size={14} />Push to folder</Button>
          <Button onClick={pullFolder} disabled={!dir || busy}><FolderDown size={14} />Pull from folder</Button>
        </div>
      </Section>
    </Modal>
  )
}
