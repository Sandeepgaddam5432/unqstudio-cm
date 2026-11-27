import { useState } from 'react'
import { FilePlus2, Upload } from 'lucide-react'
import { Modal } from '@/ui/primitives'
import { TemplateIcon } from '@/ui/TemplateIcon'
import { getAllTemplates } from '@/templates'
import { toast } from '@/store/toast'
import { startProjectFromPrompt } from './startProject'
import { ImportModals } from './ImportModals'

/** `+ New project` flow (Projects tab): Blank, From template (every built-in + plugin template), or Import. Replaces the Home templates strip (v3.3). */
export function NewProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const templates = getAllTemplates().filter((t) => t.id !== 'blank')
  const create = async (templateId: string) => {
    if (busy) return
    setBusy(true)
    try { await startProjectFromPrompt({ templateId }); onClose() } catch (e) { toast.error('Could not create project', e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const row = 'press flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] shadow-xs-surface hover:shadow-md-surface disabled:opacity-60'
  return (
    <>
      <Modal open={open} onClose={onClose} title="New project" description="Start blank, from a template, or import." size="sm">
        <div className="space-y-4 pb-2" data-new-project-sheet>
          <button className={row} onClick={() => void create('blank')} disabled={busy} data-new-blank><FilePlus2 size={16} />Blank project</button>
          <div>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-quaternary">From template</p>
            <div className="grid grid-cols-1 gap-2" data-template-list>
              {templates.map((t) => (
                <button key={t.id} className={row} onClick={() => void create(t.id)} disabled={busy} data-template-option={t.id} title={t.description}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-depth"><TemplateIcon name={t.icon} size={15} /></span>
                  <span className="min-w-0"><span className="block truncate font-medium">{t.name}</span><span className="block truncate text-[12px] text-fg-tertiary">{t.description}</span></span>
                </button>
              ))}
            </div>
          </div>
          <button className={row} onClick={() => { onClose(); setImportOpen(true) }} data-new-import><Upload size={16} />Import from GitHub or ZIP</button>
        </div>
      </Modal>
      <ImportModals open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}
