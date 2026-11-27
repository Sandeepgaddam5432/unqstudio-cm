import { useState, type ReactNode } from 'react'
import { BookOpen, ChevronRight, Palette, Plug, Plus, Settings, SlidersHorizontal, UserRound } from 'lucide-react'
import { Modal } from '@/ui/primitives'
import { Avatar, useIdentity } from '@/ui/layout/WorkspaceSwitcher'
import { AppearancePanel } from './AppearancePanel'
import { useApp } from '@/store/app'
import { useAuth } from '@/store/auth'
import { cn } from '@/lib/cn'

const REPO = 'https://github.com/Sandeepgaddam5432/unqstudio-cm/blob/main/'
const DOCS: [string, string][] = [['Privacy', 'DOCS/05-AUTH-SEO-DEPLOY.md'], ['Changelog', 'CHANGELOG.md'], ['Security', 'AGENTS.md'], ['Rules', 'AGENTS.md']]

const Row = ({ icon, label, onClick, right, id }: { icon: ReactNode; label: string; onClick: () => void; right?: ReactNode; id: string }) => (
  <button onClick={onClick} data-account-row={id} className="press flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] hover:bg-depth"><span className="text-fg-tertiary">{icon}</span><span className="flex-1">{label}</span>{right ?? <ChevronRight size={15} className="text-fg-quaternary" />}</button>
)

/** Account sheet/menu opened from the top-right avatar. */
export function AccountMenu() {
  const sheet = useApp((s) => s.sheet)
  const openSheet = useApp((s) => s.openSheet)
  const closeSheet = useApp((s) => s.closeSheet)
  const openSettings = useApp((s) => s.openSettings)
  const { name, email, signedIn } = useIdentity()
  const [docs, setDocs] = useState(false)
  const [look, setLook] = useState(false)
  const go = (fn: () => void) => () => { closeSheet(); fn() }
  return (
    <>
      <Modal open={sheet === 'account'} onClose={closeSheet} title="Account" size="sm">
        <div data-account-menu className="space-y-1">
          <div className="mb-2 flex items-center gap-3 rounded-2xl bg-secondary p-3 shadow-xs-surface">
            <Avatar size={40} />
            <div className="min-w-0 flex-1"><p className="t-label truncate font-medium">{name}</p><p className="t-meta truncate text-fg-tertiary">{signedIn ? email ?? 'Signed in' : 'Local guest profile · data stays on this device'}</p></div>
          </div>
          <Row id="add-account" icon={<Plus size={16} />} label="Add another account" onClick={() => { closeSheet(); useAuth.setState({ modalOpen: true }) }} />
          <Row id="account-settings" icon={<SlidersHorizontal size={16} />} label="Account settings" onClick={() => openSheet('accountSettings')} />
          <Row id="connectors" icon={<Plug size={16} />} label="Connectors" onClick={() => openSheet('connectors')} />
          <Row id="documentation" icon={<BookOpen size={16} />} label="Documentation" onClick={() => setDocs((v) => !v)} right={<ChevronRight size={15} className={cn('text-fg-quaternary transition-transform', docs && 'rotate-90')} />} />
          {docs && <div className="ml-9 space-y-0.5 pb-1" data-account-docs>{DOCS.map(([l, f]) => <a key={l} href={REPO + f} target="_blank" rel="noreferrer noopener" className="flex min-h-[40px] items-center rounded-lg px-3 text-[13px] text-fg-secondary hover:bg-depth">{l}</a>)}</div>}
          <Row id="appearance" icon={<Palette size={16} />} label="Appearance" onClick={() => setLook((v) => !v)} right={<ChevronRight size={15} className={cn('text-fg-quaternary transition-transform', look && 'rotate-90')} />} />
          {look && <div className="rounded-xl bg-depth/60 p-3" data-account-appearance><AppearancePanel embedded /></div>}
          <Row id="global-settings" icon={<Settings size={16} />} label="Global settings" onClick={go(() => openSettings())} />
          <div className="mt-1 border-t border-line pt-1"><Row id="session" icon={<UserRound size={16} />} label={signedIn ? 'Log out / manage sign-in' : 'Sign in & cloud sync (optional)'} onClick={go(() => openSettings('account'))} /></div>
        </div>
      </Modal>
      <Modal open={sheet === 'appearance'} onClose={closeSheet} title="Appearance" size="md"><AppearancePanel embedded /></Modal>
    </>
  )
}
