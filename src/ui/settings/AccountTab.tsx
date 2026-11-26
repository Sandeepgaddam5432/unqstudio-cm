import { CloudDownload, CloudUpload, LogOut, UserRound } from 'lucide-react'
import { Badge, Button, Section } from '@/ui/primitives'
import { useAuth } from '@/store/auth'
import { ago } from './registryUi'
import type { AuthSession } from '@/core/auth/types'

/** Account → “Sign In & Cloud Sync”. Optional: guest mode always works; tokens live in sessionStorage only. */
export function AccountTab() {
  const a = useAuth()
  const sessions = ([a.google, a.github].filter(Boolean)) as AuthSession[]
  return (
    <div className="p-5">
      <Section title="Sign in & cloud sync" description="Optional. Sign in with Google (Drive AppData) or GitHub (Gist) to back up and restore your workspace. Guests keep everything locally.">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
            <div className="flex items-center gap-3"><UserRound size={18} className="text-muted" /><div><p className="text-sm font-medium">You're using UnQStudio as a guest</p><p className="text-xs text-muted">Nothing leaves this device.</p></div></div>
            <Button variant="primary" size="sm" onClick={a.openModal} data-account-signin>Sign in</Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.provider} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{s.profile.name || 'Signed in'} <Badge tone="accent" className="ml-1">{s.provider}</Badge></p><p className="text-xs text-muted">{a.lastSynced[s.provider] ? `Last synced ${ago(a.lastSynced[s.provider]!)}` : 'Not synced yet'}</p></div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => void a.sync(s.provider, 'push')} disabled={a.busy === s.provider}><CloudUpload size={13} />Back up</Button>
                  <Button size="sm" onClick={() => void a.sync(s.provider, 'pull')} disabled={a.busy === s.provider}><CloudDownload size={13} />Restore</Button>
                  <Button size="sm" variant="ghost" onClick={() => a.signOut(s.provider)}><LogOut size={13} />Sign out</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
