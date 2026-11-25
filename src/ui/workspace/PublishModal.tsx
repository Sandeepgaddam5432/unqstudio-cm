import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Modal, Section } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { exportZip } from '@/core/vfs/zip'
import { downloadBlob, slugify, formatBytes } from '@/lib/util'
import { toast } from '@/store/toast'

export function PublishModal() {
  const { publishOpen, setPublishOpen } = useApp()
  const vfs = useWorkspace((s) => s.vfs)
  const [busy, setBusy] = useState(false)

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
    </Modal>
  )
}
