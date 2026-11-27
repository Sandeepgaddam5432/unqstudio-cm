import { useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Check, FileCode2, MailOpen, MoreHorizontal, Plus, Search, SlidersHorizontal, X, Eye } from 'lucide-react'
import { Button, Dropdown, Input } from '@/ui/primitives'
import { useProjects } from '@/store/projects'
import { navigateToProject, navigateToView } from '@/store/app'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { CHAT_FILTERS, filterChats, isUnread, loadSeen, markSeen, markUnseen, type ChatFilter } from '@/lib/chatFilters'
import { useIsMobile } from '@/lib/useMedia'
import { AccountAvatarButton } from '@/ui/layout/WorkspaceSwitcher'
import { timeAgo } from '@/lib/util'
import { cn } from '@/lib/cn'
import type { ProjectMeta } from '@/core/vfs/types'

/** Chats view: every project owns one conversation. Filters: All · Unread · Scheduled · Archived. */
export default function ChatsView() {
  const projects = useProjects()
  const mobile = useIsMobile()
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [seen, setSeen] = useState(loadSeen)
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => { void projects.refresh() }, [])
  useEffect(() => {
    let live = true
    void Promise.all(projects.projects.map(async (p) => [p.id, (await getAdapter().listFiles(p.id)).filter((f) => !f.path.endsWith('/.keep')).length] as const)).then((e) => { if (live) setCounts(Object.fromEntries(e)) })
    return () => { live = false }
  }, [projects.projects])
  const list = useMemo(() => filterChats(projects.projects, filter, q, seen), [projects.projects, filter, q, seen])
  const refreshSeen = () => setSeen(loadSeen())
  const open = (p: ProjectMeta) => { markSeen(p.id); navigateToProject(p.id) }
  const empty: Record<ChatFilter, string> = { all: 'No chats yet — describe an idea on Home.', unread: 'You are all caught up.', scheduled: 'No scheduled chats.', archived: 'No archived chats.' }

  return (
    <div data-chats-view className="mx-auto min-h-full w-full max-w-3xl bg-base pb-40 md:px-8">
      <header className="sticky top-0 z-20 bg-base/85 px-4 pb-2 backdrop-blur-xl md:px-0" style={{ paddingTop: 'calc(var(--sat, 0px) + 12px)' }}>
        <div className="flex h-12 items-center justify-between gap-2">
          <h1 className="text-[20px] font-semibold tracking-tight">Chats</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Search chats" aria-pressed={searching} onClick={() => { setSearching((v) => !v); if (searching) setQ('') }}><Search size={18} /></Button>
            <Dropdown align="end" width={190} mobileSheet sheetTitle="Filter chats" trigger={<Button variant="ghost" size="icon" aria-label="Filter chats" className={cn(filter !== 'all' && 'text-accent')}><SlidersHorizontal size={18} /></Button>}
              content={(close) => (
                <div className="p-1" role="menu" data-chat-filter-menu>
                  {CHAT_FILTERS.map((f) => (
                    <button key={f.id} role="menuitemradio" aria-checked={filter === f.id} onClick={() => { setFilter(f.id); close() }} className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-left text-[14px] hover:bg-depth">
                      {f.label}{filter === f.id && <Check size={14} className="text-accent" />}
                    </button>
                  ))}
                </div>
              )} />
            {mobile && <AccountAvatarButton />}
          </div>
        </div>
        {searching && (
          <div className="relative pb-2">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-[calc(50%+4px)] text-fg-quaternary" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="h-10 pl-9 pr-9" />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-[calc(50%+4px)] p-1 text-fg-tertiary"><X size={14} /></button>}
          </div>
        )}
        {filter !== 'all' && <p className="t-meta pb-1 text-fg-tertiary" data-chat-filter-label>Showing: {CHAT_FILTERS.find((f) => f.id === filter)?.label}</p>}
      </header>

      {!projects.loaded ? (
        <div className="space-y-1 px-4 md:px-0">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-[72px]" />)}</div>
      ) : list.length === 0 ? (
        <div className="mx-4 mt-6 rounded-2xl border border-dashed border-line-strong py-16 text-center text-sm text-fg-tertiary md:mx-0" data-chat-empty>{q ? 'No chats match.' : empty[filter]}</div>
      ) : (
        <ul className="divide-y divide-line" data-chat-list>
          {list.map((p) => {
            const unread = isUnread(p, seen)
            return (
              <li key={p.id} data-chat-row onClick={() => open(p)} className="flex min-h-[72px] cursor-pointer items-center gap-3 px-4 py-3 hover:bg-depth/60 active:bg-depth md:rounded-xl md:px-3">
                <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', unread ? 'bg-blue' : 'bg-transparent')} />
                <div className="min-w-0 flex-1">
                  <h3 className={cn('truncate text-[14px]', unread ? 'font-semibold' : 'font-medium')}>{p.name}</h3>
                  <p className="t-meta mt-0.5 flex items-center gap-2 text-fg-tertiary">{new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {timeAgo(p.updatedAt)}</p>
                </div>
                <span data-file-count className="t-meta inline-flex items-center gap-1 rounded-full bg-depth px-2 py-0.5 text-fg-secondary"><FileCode2 size={11} />{counts[p.id] ?? '…'}</span>
                <div onClick={(e) => e.stopPropagation()}>
                  <Dropdown align="end" width={200} mobileSheet sheetTitle={p.name} trigger={<Button variant="ghost" size="icon" aria-label="Chat actions"><MoreHorizontal size={17} /></Button>}
                    items={[
                      { label: 'Open chat', icon: <Eye size={14} />, onSelect: () => open(p) },
                      unread ? { label: 'Mark as read', icon: <MailOpen size={14} />, onSelect: () => { markSeen(p.id); refreshSeen() } } : { label: 'Mark as unread', icon: <MailOpen size={14} />, onSelect: () => { markUnseen(p); refreshSeen() } },
                      p.archived ? { label: 'Unarchive', icon: <ArchiveRestore size={14} />, onSelect: () => projects.update(p.id, { archived: false, updatedAt: p.updatedAt }) } : { label: 'Archive', icon: <Archive size={14} />, onSelect: () => projects.update(p.id, { archived: true, updatedAt: p.updatedAt }) },
                    ]} />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <button onClick={() => { navigateToView('home'); setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(), 200) }} data-new-chat className="press fixed right-4 z-30 flex h-12 items-center gap-1.5 rounded-full bg-fg-primary px-5 text-[14px] font-medium text-base shadow-floating md:bottom-6 md:right-8" style={{ bottom: mobile ? 'calc(var(--sab, 0px) + 80px)' : undefined }}>
        <Plus size={17} />New chat
      </button>
    </div>
  )
}
