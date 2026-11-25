import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthProviderId, AuthSession, SyncDirection } from '@/core/auth/types'
import { getGoogleClientId, revokeGoogle, signInWithGoogle } from '@/core/auth/googleAuth'
import { downloadBackup, uploadBackup } from '@/core/auth/googleDriveSync'
import { fetchGithubStatus, openGithubLogin, PENDING_KEY, sessionFromMessage } from '@/core/auth/githubAuth'
import { pullGist, pushGist } from '@/core/auth/githubGistSync'
import { applySnapshot, buildSyncSnapshot, parseSnapshot, serializeSnapshot } from '@/core/auth/snapshot'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { toast } from './toast'

const SKEY = (p: AuthProviderId) => `unq.session.${p}`

export const loadSession = (p: AuthProviderId, ss: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage): AuthSession | null => {
  try {
    const s = JSON.parse(ss.getItem(SKEY(p)) ?? 'null') as AuthSession | null
    if (!s?.token) return null
    if (s.expiresAt && s.expiresAt < Date.now()) { ss.removeItem(SKEY(p)); return null }
    return s
  } catch { return null }
}

interface AuthState {
  google: AuthSession | null
  github: AuthSession | null
  lastSynced: Partial<Record<AuthProviderId, number>>
  googleClientIdOverride: string
  githubConfigured: boolean | null
  modalOpen: boolean
  guide: AuthProviderId | null
  busy: AuthProviderId | null
  error: string | null
  init: () => Promise<void>
  openModal: () => void
  closeModal: () => void
  openGuide: (p: AuthProviderId | null) => void
  setGoogleClientId: (id: string) => void
  googleConfigured: () => boolean
  signInGoogle: () => Promise<void>
  signInGithub: () => void
  receiveSession: (s: AuthSession) => void
  signOut: (p: AuthProviderId) => void
  sync: (p: AuthProviderId, dir: SyncDirection) => Promise<void>
}

const saveSession = (s: AuthSession) => { try { sessionStorage.setItem(SKEY(s.provider), JSON.stringify(s)) } catch { /* private mode */ } }
let listening = false

/**
 * Optional auth state. Tokens live in sessionStorage only (cleared when the tab closes) — never in localStorage,
 * never in backups. Only non-secret bits (last-synced times, self-hoster client-id override) persist.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      google: null, github: null, lastSynced: {}, googleClientIdOverride: '', githubConfigured: null,
      modalOpen: false, guide: null, busy: null, error: null,
      init: async () => {
        set({ google: loadSession('google'), github: loadSession('github') })
        try {
          const pending = sessionStorage.getItem(PENDING_KEY)
          if (pending) { sessionStorage.removeItem(PENDING_KEY); const s = sessionFromMessage(JSON.parse(pending)); if (s) get().receiveSession(s) }
        } catch { /* ignore */ }
        if (!listening && typeof window !== 'undefined') {
          listening = true
          window.addEventListener('message', (e) => {
            if (e.origin !== location.origin) return
            const s = sessionFromMessage(e.data)
            if (s) get().receiveSession(s)
            else if ((e.data as { type?: string })?.type === 'unq-github-auth') { set({ busy: null, error: (e.data as { error?: string }).error ?? 'GitHub sign-in failed.' }); toast.error('GitHub sign-in failed', (e.data as { error?: string }).error) }
          })
        }
        set({ githubConfigured: (await fetchGithubStatus()).configured })
      },
      openModal: () => set({ modalOpen: true, error: null }),
      closeModal: () => set({ modalOpen: false, guide: null }),
      openGuide: (guide) => set({ guide }),
      setGoogleClientId: (id) => set({ googleClientIdOverride: id.trim() }),
      googleConfigured: () => !!getGoogleClientId(get().googleClientIdOverride),
      signInGoogle: async () => {
        const id = getGoogleClientId(get().googleClientIdOverride)
        if (!id) { set({ guide: 'google' }); return }
        set({ busy: 'google', error: null })
        try { get().receiveSession(await signInWithGoogle(id)) } catch (e) { const m = e instanceof Error ? e.message : String(e); set({ busy: null, error: m }); toast.error('Google sign-in failed', m) }
      },
      signInGithub: () => {
        if (get().githubConfigured === false) { set({ guide: 'github' }); return }
        set({ busy: 'github', error: null })
        openGithubLogin()
      },
      receiveSession: (s) => {
        saveSession(s)
        set({ [s.provider]: s, busy: null, error: null, modalOpen: false, guide: null } as Partial<AuthState>)
        toast.success(`Signed in with ${s.provider === 'google' ? 'Google' : 'GitHub'}`, s.profile.email || s.profile.login || s.profile.name)
      },
      signOut: (p) => {
        const s = get()[p]
        if (p === 'google' && s) revokeGoogle(s.token)
        try { sessionStorage.removeItem(SKEY(p)) } catch { /* ignore */ }
        set({ [p]: null } as Partial<AuthState>)
        toast.info('Signed out')
      },
      sync: async (p, dir) => {
        const s = get()[p]
        if (!s) { get().openModal(); return }
        set({ busy: p, error: null })
        try {
          const adapter = getAdapter()
          if (dir === 'push') {
            const json = serializeSnapshot(await buildSyncSnapshot(adapter, localStorage))
            if (p === 'google') await uploadBackup(s.token, json); else await pushGist(s.token, json)
            set((st) => ({ lastSynced: { ...st.lastSynced, [p]: Date.now() } }))
            toast.success('Cloud backup saved', p === 'google' ? 'Stored privately in your Google Drive AppData.' : 'Stored in a private GitHub Gist.')
          } else {
            const text = p === 'google' ? await downloadBackup(s.token) : await pullGist(s.token)
            if (!text) { toast.info('No cloud backup found yet', 'Use “Sync now” first.'); return }
            const r = await applySnapshot(adapter, parseSnapshot(text), localStorage)
            set((st) => ({ lastSynced: { ...st.lastSynced, [p]: Date.now() } }))
            toast.success('Restored from cloud', `${r.projects} projects · ${r.files} files. Reloading…`)
            setTimeout(() => location.reload(), 900)
          }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          set({ error: m }); toast.error('Cloud sync failed', m)
        } finally { set({ busy: null }) }
      },
    }),
    { name: 'unq.auth.v1', version: 1, partialize: (s) => ({ lastSynced: s.lastSynced, googleClientIdOverride: s.googleClientIdOverride }) },
  ),
)

/** OAuth token for GitHub features (import / push / Pages deploy) when the user signed in with GitHub. */
export const githubOAuthToken = (): string | undefined => useAuth.getState().github?.token
