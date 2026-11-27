import { useRef, useState } from 'react'
import { GitBranch, Upload } from 'lucide-react'
import { Button, Input, Modal, Spinner } from '@/ui/primitives'
import { getConn, isConnected } from '@/store/connections'
import { importGitHubRepo, parseRepoUrl } from '@/core/deploy/github'
import { useProjects } from '@/store/projects'
import { navigateToProject } from '@/store/app'
import { toast } from '@/store/toast'

/** Import chooser (GitHub | ZIP) + GitHub URL dialog, shared by the mobile Home `+` menu and the New-project sheet. */
export function ImportModals({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      const p = await useProjects.getState().create({ name: r.name, files: r.files, description: r.description, sourceRepo: `${ref.owner}/${ref.repo}`, checkpointLabel: `Imported ${ref.owner}/${ref.repo}@${r.ref}` })
      toast.success('Repository imported', `${Object.keys(r.files).length} files${r.skipped ? ` · ${r.skipped} skipped` : ''}`)
      setGhOpen(false)
      navigateToProject(p.id)
    } catch (e) { toast.error('GitHub import failed', e instanceof Error ? e.message : String(e)) } finally { setGhBusy(false) }
  }
  const onZip = async (f: File) => {
    try {
      const { importZip } = await import('@/core/vfs/zip')
      const r = await importZip(f)
      if (!Object.keys(r.files).length) throw new Error('The archive has no importable files')
      const p = await useProjects.getState().create({ name: r.name ?? f.name.replace(/\.zip$/i, ''), files: r.files, checkpointLabel: 'Imported from ZIP' })
      toast.success('Project imported', r.skipped.length ? `${r.skipped.length} oversized/binary files skipped` : `${Object.keys(r.files).length} files`)
      navigateToProject(p.id)
    } catch (e) { toast.error('Import failed', e instanceof Error ? e.message : String(e)) }
  }
  const row = 'press flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] shadow-xs-surface hover:shadow-md-surface'
  return (
    <>
      <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onZip(f) }} />
      <Modal open={open} onClose={onClose} title="Import project" description="Bring an existing project into UnQStudio." size="sm">
        <div className="space-y-2" data-import-chooser>
          <button className={row} onClick={() => { onClose(); setGhOpen(true) }}><GitBranch size={16} />From a GitHub repository</button>
          <button className={row} onClick={() => { onClose(); zipInput.current?.click() }}><Upload size={16} />From a ZIP file</button>
        </div>
      </Modal>
      <Modal open={ghOpen} onClose={() => setGhOpen(false)} title="Import from GitHub" description="Public repositories work without a token. Connect GitHub in Settings → Connections for private repos and higher rate limits." size="sm"
        footer={<><Button variant="ghost" onClick={() => setGhOpen(false)}>Cancel</Button><Button variant="primary" onClick={importGh} disabled={ghBusy || !ghUrl.trim()}>{ghBusy && <Spinner size={13} />}Import</Button></>}>
        <Input value={ghUrl} onChange={(e) => setGhUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void importGh()} placeholder="owner/repo or https://github.com/owner/repo/tree/branch" spellCheck={false} />
        {ghLog && <p className="mt-2 text-xs text-muted">{ghLog}</p>}
      </Modal>
    </>
  )
}
