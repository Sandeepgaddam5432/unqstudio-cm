import { FolderKanban, Home as HomeIcon, MessageSquare } from 'lucide-react'
import { navigateToView, type AppView } from '@/store/app'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

const TABS: { id: AppView; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'chats', label: 'Chats', icon: MessageSquare },
]

/** Floating 3-tab pill dock (<768px) shown only on Home / Projects / Chats — never inside a workspace. */
export function MobileBottomNav({ view }: { view: AppView }) {
  return (
    <nav aria-label="Main" data-mobile-bottom-nav className="pointer-events-none fixed inset-x-0 z-40 flex justify-center" style={{ bottom: 'calc(var(--sab, 0px) + 12px)' }}>
      <div className="pointer-events-auto flex items-center gap-1 glass-pill p-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = view === id
          return (
            <button key={id} data-nav-tab={id} aria-current={on ? 'page' : undefined} onClick={() => { haptic('select'); navigateToView(id) }}
              className={cn('press flex h-11 min-w-[88px] items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-150', on ? 'bg-fg-primary text-base' : 'text-fg-tertiary hover:text-fg-primary')}>
              <Icon size={16} />{label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
