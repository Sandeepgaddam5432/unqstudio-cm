import { CloudDownload, CloudUpload, LogOut, UserRound } from 'lucide-react'
import { Button, Dropdown, Spinner } from '@/ui/primitives'
import { useAuth } from '@/store/auth'
import { ago } from '@/ui/settings/registryUi'
import type { AuthProviderId, AuthSession } from '@/core/auth/types'

function Avatar({ s, size = 24 }: { s: AuthSession; size?: number }) {
  return s.profile.avatar
    ? <img src={s.profile.avatar} alt="" width={size} height={size} referrerPolicy="no-referrer" className="rounded-full" style={{ width: size, height: size }} />
    : <span className="flex items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent" style={{ width: size, height: size }}>{(s.profile.name || '?')[0].toUpperCase()}</span>
}

/** Account pill: "Sign in" button for guests, avatar dropdown (profile, sync now, last synced, sign out) when signed in. */
export function AccountPill() {
  const a = useAuth()
  const sessions = ([a.google, a.github].filter(Boolean)) as AuthSession[]
  if (!sessions.length) {
    return <Button variant="ghost" size="sm" onClick={a.openModal} aria-label="Sign in" data-account-signin><UserRound size={14} /><span className="hidden sm:inline">Sign in</span></Button>
  }
  const primary = sessions[0]
  return (
    <Dropdown
      align="end"
      width={300}
      mobileSheet
      sheetTitle="Account"
      trigger={<button aria-label="Account" className="flex h-8 items-center rounded-full border border-line p-0.5 transition-colors duration-150 hover:border-line-strong" data-account-avatar><Avatar s={primary} /></button>}
      content={(close) => (
        <div className="p-1" data-account-menu>
          {sessions.map((s) => {
            const p: AuthProviderId = s.provider
            const last = a.lastSynced[p]
            return (
              <div key={p} className="mb-1 rounded-lg p-2">
                <div className="flex items-center gap-2.5">
                  <Avatar s={s} size={32} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{s.profile.name}</p><p className="truncate text-[11px] text-muted">{s.profile.email || (s.profile.login && `@${s.profile.login}`)} · {p === 'google' ? 'Google Drive' : 'GitHub Gist'}</p></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="xs" onClick={() => void a.sync(p, 'push')} disabled={a.busy === p}>{a.busy === p ? <Spinner size={11} /> : <CloudUpload size={12} />}Sync now</Button>
                  <Button size="xs" variant="ghost" onClick={() => void a.sync(p, 'pull')} disabled={a.busy === p}><CloudDownload size={12} />Restore</Button>
                  <Button size="xs" variant="ghost" onClick={() => { a.signOut(p); close() }}><LogOut size={12} />Sign out</Button>
                </div>
                <p className="mt-1.5 text-[11px] text-faint">{last ? `Last synced ${ago(last)}` : 'Not synced yet'}</p>
              </div>
            )
          })}
          {sessions.length < 2 && <button onClick={() => { close(); a.openModal() }} className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:bg-subtle hover:text-fg">Connect another account…</button>}
        </div>
      )}
    />
  )
}
