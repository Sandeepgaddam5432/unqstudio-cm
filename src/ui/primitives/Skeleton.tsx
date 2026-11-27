import { cn } from '@/lib/cn'

/** A single calm shimmer block (1200ms linear shimmer, collapses under prefers-reduced-motion). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden data-skeleton-block className={cn('skel', className)} />
}

function Frame({ kind, children, className }: { kind: string; children: React.ReactNode; className?: string }) {
  return <div role="status" aria-label="Loading" aria-busy="true" data-skeleton={kind} className={cn('min-h-full w-full bg-base', className)}>{children}</div>
}

/** Home launchpad: header pill + avatar circle + headline + composer card. */
export function HomeSkeleton() {
  return (
    <Frame kind="home" className="relative h-[100dvh] overflow-hidden">
      <div className="flex items-center justify-between px-4" style={{ paddingTop: 'calc(var(--sat, 0px) + 12px)' }}>
        <Skeleton className="h-10 w-40 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <div className="absolute inset-x-0 mx-auto flex w-full max-w-[672px] flex-col items-center gap-4 px-4" style={{ bottom: 'calc(55dvh - 130px - 14px)' }}>
        <Skeleton className="h-7 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-[130px] w-full rounded-[28px]" />
      </div>
    </Frame>
  )
}

/** Projects / Chats list: header, search/filter, rows with 64×72 thumbnails. */
export function ListSkeleton({ kind, rows = 6 }: { kind: 'projects' | 'chats'; rows?: number }) {
  return (
    <Frame kind={kind}>
      <div className="flex items-center justify-between px-4 pb-3" style={{ paddingTop: 'calc(var(--sat, 0px) + 16px)' }}>
        <Skeleton className="h-7 w-32 rounded-lg" />
        <div className="flex gap-2"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-10 w-10 rounded-full" /></div>
      </div>
      <div className="space-y-1 px-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-[88px] items-center gap-3">
            {kind === 'projects' && <Skeleton className="h-[72px] w-16 shrink-0 rounded-xl" />}
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3 rounded-md" /><Skeleton className="h-3 w-1/3 rounded-md" /></div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/** Project workspace: top bar + chat bubbles + composer. */
export function WorkspaceSkeleton() {
  return (
    <Frame kind="workspace" className="flex h-[100dvh] flex-col overflow-hidden">
      <div className="flex h-12 items-center justify-between gap-3 px-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-8 w-40 rounded-full" /><Skeleton className="h-9 w-9 rounded-full" /></div>
      <div className="flex-1 space-y-4 px-4 pt-6">
        <Skeleton className="ml-auto h-12 w-3/5 rounded-[24px]" />
        <Skeleton className="h-4 w-11/12 rounded-md" /><Skeleton className="h-4 w-4/5 rounded-md" /><Skeleton className="h-4 w-2/3 rounded-md" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
      <div className="p-3"><Skeleton className="h-[72px] w-full rounded-[28px]" /></div>
    </Frame>
  )
}

export function ViewSkeleton({ kind }: { kind: 'home' | 'projects' | 'chats' | 'workspace' }) {
  if (kind === 'home') return <HomeSkeleton />
  if (kind === 'workspace') return <WorkspaceSkeleton />
  return <ListSkeleton kind={kind} />
}
