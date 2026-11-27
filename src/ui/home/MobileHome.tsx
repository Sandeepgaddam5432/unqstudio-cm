import { useState } from 'react'
import { BookText, Database, Upload, type LucideIcon } from 'lucide-react'
import { Composer } from '@/ui/chat/Composer'
import type { MenuItem } from '@/ui/primitives'
import { AccountAvatarButton, WorkspaceSwitcherPill } from '@/ui/layout/WorkspaceSwitcher'
import { AuroraBackdrop } from './AuroraBackdrop'
import { ImportModals } from './ImportModals'
import { startProjectFromPrompt } from './startProject'
import { useSettings } from '@/store/settings'
import { useApp } from '@/store/app'
import { toast } from '@/store/toast'

const icon = (I: LucideIcon) => <I size={14} />

/**
 * Lovable-style mobile Home (v3.3): ONE locked, zero-scroll screen — workspace pill + avatar on top, the hero heading and the glassy composer
 * centred over the aurora, and nothing else. Templates / starters live behind Projects → `+ New project`.
 */
export default function MobileHome() {
  const aiMode = useSettings((x) => x.aiMode)
  const setSettings = useSettings((x) => x.set)
  const openSettings = useApp((s) => s.openSettings)
  const [prompt, setPrompt] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const start = async () => {
    if (busy) return
    setBusy(true)
    try { await startProjectFromPrompt({ text: prompt, images }) } catch (e) {
      toast.error('Could not create project', e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  const plusItems: MenuItem[] = [
    { label: 'Import project', hint: 'From GitHub or a ZIP file', icon: icon(Upload), onSelect: () => setImportOpen(true) },
    { label: 'Add context', hint: 'Start the prompt with context', icon: icon(BookText), onSelect: () => { setPrompt((v) => (v ? v + '\n\n' : '') + 'Context: '); setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(), 60) } },
    { label: 'Databases', hint: 'Supabase & connections', icon: icon(Database), onSelect: () => openSettings('connections') },
  ]

  return (
    <div data-hero data-home-single className="relative isolate flex h-full w-full flex-col overflow-hidden">
      <AuroraBackdrop className="-z-10" />
      <header role="banner" data-mobile-home-header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-2" style={{ paddingTop: 'calc(var(--sat, 0px) + 8px)' }}>
        <WorkspaceSwitcherPill />
        <AccountAvatarButton />
      </header>
      <div className="flex min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingTop: 'calc(var(--sat, 0px) + 60px)', paddingBottom: 'calc(var(--sab, 0px) + 84px)' }}>
        <div className="m-auto flex w-full max-w-[672px] flex-col items-center" data-launch-stack>
          <h1 className="t-headline mb-5 max-w-[320px] text-balance text-center font-semibold">What should we <span className="bg-gradient-to-r from-accent to-fuchsia-500 bg-clip-text text-transparent">build</span> today?</h1>
          <div className="composer-float w-full text-left" data-hero-composer>
            <Composer variant="hero" value={prompt} onChange={setPrompt} images={images} onImages={setImages} onSubmit={() => void start()} busy={busy} allowEmptySubmit submitLabel="Create project" plusItems={plusItems}
              mode={aiMode} onMode={(m) => setSettings({ aiMode: m })} placeholder="Ask UnQStudio to build…" />
          </div>
        </div>
      </div>
      <ImportModals open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
