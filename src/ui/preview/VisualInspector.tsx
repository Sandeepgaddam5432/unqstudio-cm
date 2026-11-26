import { useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react'
import { X } from 'lucide-react'
import { BottomSheet } from '@/ui/primitives'
import { usePreview } from '@/store/preview'
import { useIsMobile } from '@/lib/useMedia'
import { getPreviewFrame } from './bridge'
import { InspectorForm } from './Inspector'

/** Screen-space rect of the selected element (iframe rect + selection rect, honouring the preview zoom scale). */
export function selectionRect(rect: { x: number; y: number; w: number; h: number }, frame: { left: number; top: number; width: number; offsetWidth: number }) {
  const s = frame.offsetWidth ? frame.width / frame.offsetWidth : 1
  return { x: frame.left + rect.x * s, y: frame.top + rect.y * s, width: rect.w * s, height: rect.h * s }
}

function Popover({ onClose }: { onClose: () => void }) {
  const sel = usePreview((s) => s.selected)!
  const f = getPreviewFrame()
  const fr = f?.getBoundingClientRect()
  const r = fr && f ? selectionRect(sel.rect, { left: fr.left, top: fr.top, width: fr.width, offsetWidth: f.offsetWidth }) : { x: 40, y: 80, width: 0, height: 0 }
  const { refs, floatingStyles } = useFloating({
    strategy: 'fixed', placement: 'right-start', whileElementsMounted: autoUpdate,
    middleware: [offset(12), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  useLayoutEffect(() => { refs.setPositionReference({ getBoundingClientRect: () => new DOMRect(r.x, r.y, r.width, r.height), contextElement: f ?? undefined }) }, [r.x, r.y, r.width, r.height, f, refs])
  return createPortal(
    <div ref={refs.setFloating} style={{ ...floatingStyles, zIndex: 75 }} data-visual-inspector="popover" className="animate-pop max-h-[min(80dvh,620px)] w-80 overflow-auto rounded-2xl border border-line bg-panel p-3 shadow-pop">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold">Edit &lt;{sel.tag}&gt; <span className="font-mono font-normal text-faint">{sel.rect.w}×{sel.rect.h}</span></span><button onClick={onClose} aria-label="Close inspector" className="rounded p-1 text-faint hover:text-fg"><X size={14} /></button></div>
      <InspectorForm />
    </div>,
    document.body,
  )
}

/** Lovable-style visual editor shell: floating popover next to the element on desktop, compact modeless Bottom Sheet on phones. */
export function VisualInspector() {
  const sel = usePreview((s) => s.selected)
  const set = usePreview((s) => s.set)
  const mobile = useIsMobile()
  if (!sel) return null
  const close = () => set({ selected: null })
  if (mobile) {
    return (
      <BottomSheet open modeless onClose={close} title="Edit element" description={`<${sel.tag}> · ${sel.rect.w}×${sel.rect.h}`} label="Visual inspector">
        <div data-visual-inspector="sheet"><InspectorForm /></div>
      </BottomSheet>
    )
  }
  return <Popover onClose={close} />
}
