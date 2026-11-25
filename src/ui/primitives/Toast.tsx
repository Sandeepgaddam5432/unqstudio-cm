import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useToasts } from '@/store/toast'
import { cn } from '@/lib/cn'

export function Toaster() {
  const { items, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role="status" className="animate-pop pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-panel p-3 shadow-pop">
          <span className={cn('mt-0.5', t.kind === 'success' && 'text-success', t.kind === 'error' && 'text-danger', t.kind === 'info' && 'text-muted')}>
            {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{t.title}</p>
            {t.description && <p className="mt-0.5 break-words text-xs text-muted">{t.description}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
