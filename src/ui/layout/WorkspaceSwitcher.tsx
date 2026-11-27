import { ChevronDown, FolderKanban, LayoutTemplate, PanelLeftOpen, Settings2 } from 'lucide-react'
import { Modal } from '@/ui/primitives'
import { useAuth } from '@/store/auth'
import { useProjects } from '@/store/projects'
import { navigateToView, useApp } from '@/store/app'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

/** Resolved identity for the (local-first) workspace + account shown in the header. */
export function useIdentity() {
  const google = useAuth((s) => s.google)
  const github = useAuth((s) => s.github)
  const profile = (google ?? github)?.profile
  const name = profile?.name?.trim() || 'Guest'
  return { name, email: profile?.email, avatar: profile?.avatar, signedIn: !!profile, workspace: profile ? `${name.split(' ')[0]}'s workspace` : 'Personal workspace', initial: name[0]?.toUpperCase() ?? 'G' }
}

export function Avatar({ size = 28, className }: { size?: number; className?: string }) {
  const { avatar, initial } = useIdentity()
  return avatar
    ? <img src={avatar} alt="" referrerPolicy="no-referrer" width={size} height={size} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
    : <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-fg-primary text-[11px] font-semibold text-base', className)} style={{ width: size, height: size }}>{initial}</span>
}

/** Left header pill: avatar badge + workspace name + chevron → Workspace Switcher sheet. */
export function WorkspaceSwitcherPill() {
  const { workspace } = useIdentity()
  const openSheet = useApp((s) => s.openSheet)
  return (
    <button onClick={() => { haptic('tap'); openSheet('workspace') }} data-workspace-pill aria-label="Switch workspace" aria-haspopup="dialog"
      className="press flex h-10 max-w-[60%] items-center gap-2 rounded-full bg-primary/90 py-1 pl-1.5 pr-3 shadow-xs-surface backdrop-blur-md hover:shadow-md-surface">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-fuchsia-500 text-[12px] font-semibold text-white">{workspace[0]}</span>
      <span className="t-label truncate font-medium">{workspace}</span>
      <ChevronDown size={14} className="shrink-0 text-fg-tertiary" />
    </button>
  )
}

/** Right header avatar → Account menu. */
export function AccountAvatarButton() {
  const openSheet = useApp((s) => s.openSheet)
  return (
    <button onClick={() => { haptic('tap'); openSheet('account') }} data-account-avatar aria-label="Account menu" aria-haspopup="dialog" className="press flex h-10 w-10 items-center justify-center rounded-full bg-primary/90 shadow-xs-surface backdrop-blur-md hover:shadow-md-surface">
      <Avatar size={28} />
    </button>
  )
}

/** Workspace Switcher + Workspace Settings entry (bottom sheet on phones, modal on desktop). */
export function WorkspaceSheet() {
  const sheet = useApp((s) => s.sheet)
  const closeSheet = useApp((s) => s.closeSheet)
  const openSheet = useApp((s) => s.openSheet)
  const setSidebarOpen = useApp((s) => s.setSidebarOpen)
  const count = useProjects((s) => s.projects.length)
  const { workspace, signedIn } = useIdentity()
  const row = 'press flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] hover:bg-depth'
  return (
    <Modal open={sheet === 'workspace'} onClose={closeSheet} title="Workspaces" size="sm">
      <div data-workspace-sheet className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl bg-secondary p-3 shadow-xs-surface">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-fuchsia-500 text-base font-semibold text-white">{workspace[0]}</span>
          <div className="min-w-0 flex-1"><p className="t-label truncate font-medium">{workspace}</p><p className="t-meta text-fg-tertiary">{count} project{count === 1 ? '' : 's'} · {signedIn ? 'Cloud sync available' : 'Stored on this device'}</p></div>
          <span className="rounded-full bg-depth px-2 py-0.5 t-meta text-fg-secondary">Current</span>
        </div>
        <div>
          <button className={row} onClick={() => openSheet('workspaceSettings')} data-open-workspace-settings><Settings2 size={16} className="text-fg-tertiary" />Workspace settings</button>
          <button className={row} onClick={() => { closeSheet(); navigateToView('projects') }}><FolderKanban size={16} className="text-fg-tertiary" />All projects</button>
          <button className={row} onClick={() => { closeSheet(); setSidebarOpen(true) }}><PanelLeftOpen size={16} className="text-fg-tertiary" />Open navigation</button>
          <button className={row} onClick={() => { closeSheet(); navigateToView('home'); setTimeout(() => document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' }), 150) }}><LayoutTemplate size={16} className="text-fg-tertiary" />Templates &amp; showcase</button>
        </div>
      </div>
    </Modal>
  )
}
