import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { BottomSheet } from './BottomSheet'
import { useIsMobile } from '@/lib/useMedia'

const sizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [open, onClose])
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof sizes
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const mobile = useIsMobile()
  useEscape(open && !mobile, onClose)
  if (!open) return null
  if (mobile) return <BottomSheet open onClose={onClose} title={title} description={description} footer={footer}>{children}</BottomSheet>
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="animate-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'animate-pop relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl glass-pop sm:rounded-2xl',
          sizes[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X size={15} />
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ open, onClose, title, children, width = 760 }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: number }) {
  const mobile = useIsMobile()
  useEscape(open && !mobile, onClose)
  if (!open) return null
  if (mobile) return <BottomSheet open onClose={onClose} title={title} tall flush>{children}</BottomSheet>
  return createPortal(
    <div className="fixed inset-0 z-[65] flex justify-end">
      <div className="animate-fade absolute inset-0 bg-black/45" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        style={{ width: `min(${width}px, 100vw)` }}
        className="animate-slide relative flex h-full flex-col glass-pop rounded-none border-y-0 border-r-0"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

export function ConfirmModal({
  open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose,
}: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  )
}
