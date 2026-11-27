import { ChevronLeft, MousePointerClick, MoreHorizontal, Rocket, RefreshCw, FileText, History, Share2, Search, ExternalLink, Code2 } from 'lucide-react'
import { Dropdown } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { usePreview } from '@/store/preview'
import { useWorkspace } from '@/store/workspace'
import { popoutWrapper } from '@/core/runtime/previewHtml'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

/** Mobile Preview floating bottom bar: ‹ Chat · Click to add · … overflow · blue Publish. */
export function MobilePreviewBar() {
  const requestTab = useApp((s) => s.requestTab)
  const setMode = useApp((s) => s.setMode)
  const openPublish = useApp((s) => s.openPublish)
  const openProjectSettings = useApp((s) => s.openProjectSettings)
  const p = usePreview()
  const vfs = useWorkspace((s) => s.vfs)
  const popout = () => {
    if (!p.html) return
    const url = URL.createObjectURL(new Blob([popoutWrapper(p.html, vfs?.meta.name)], { type: 'text/html' }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  const pill = 'press flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium'
  return (
    <div data-preview-bar className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 px-3" style={{ paddingBottom: 'max(var(--sab, 0px), 12px)' }}>
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-primary/90 p-1 shadow-floating backdrop-blur-md">
        <button onClick={() => { haptic('select'); requestTab('chat') }} data-preview-back aria-label="Back to chat" className={cn(pill, 'text-fg-primary')}><ChevronLeft size={16} />Chat</button>
        <button onClick={() => { haptic('select'); p.set({ inspectMode: !p.inspectMode, selected: null }) }} disabled={!p.html} aria-pressed={p.inspectMode} data-visual-edit-toggle className={cn(pill, 'disabled:opacity-40', p.inspectMode ? 'bg-blue text-blue-fg' : 'text-fg-secondary')}><MousePointerClick size={15} />Click to add</button>
        <Dropdown align="start" width={230} mobileSheet sheetTitle="Preview" trigger={<button aria-label="More preview actions" data-preview-overflow className="press flex h-11 w-10 items-center justify-center rounded-full text-fg-secondary"><MoreHorizontal size={18} /></button>}
          items={[
            { label: 'Refresh', icon: <RefreshCw size={14} />, onSelect: p.reload },
            { label: 'Change page', icon: <FileText size={14} />, onSelect: () => document.querySelector<HTMLInputElement>('input[aria-label="Preview route"]')?.focus() },
            { label: 'History', icon: <History size={14} />, onSelect: () => openProjectSettings('versions') },
            { label: 'Share', icon: <Share2 size={14} />, onSelect: () => openPublish('seo') },
            { label: 'Social & search', icon: <Search size={14} />, onSelect: () => openPublish('seo') },
            { label: 'Preview in new tab', icon: <ExternalLink size={14} />, onSelect: popout },
            { separator: true },
            { label: 'Open code', icon: <Code2 size={14} />, onSelect: () => setMode('code') },
          ]} />
      </div>
      <button onClick={() => { haptic('tap'); openPublish() }} data-publish-pill aria-label="Publish" className="press pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-blue-solid px-4 text-[14px] font-medium shadow-floating"><Rocket size={15} />Publish</button>
    </div>
  )
}
