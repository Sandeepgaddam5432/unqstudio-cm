import { AlertTriangle, Check, ExternalLink } from 'lucide-react'
import { Badge, Button, Input, Modal, Spinner } from '@/ui/primitives'
import { useAuth } from '@/store/auth'
import type { AuthProviderId } from '@/core/auth/types'

const DOC_URL = 'https://github.com/Sandeepgaddam5432/unqstudio-cm/blob/main/DOCS/05-AUTH-SEO-DEPLOY.md'

const GoogleG = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" /></svg>
)
const GitHubMark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" /></svg>
)

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="flex gap-3 text-xs leading-relaxed text-muted"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-fg">{n}</span><span className="min-w-0">{children}</span></li>
}

/** 3-step setup guide shown when a provider is not configured yet (never a broken error). */
function SetupGuide({ provider }: { provider: AuthProviderId }) {
  const a = useAuth()
  const origin = typeof location !== 'undefined' ? location.origin : 'https://your-site.pages.dev'
  return (
    <div className="space-y-4" data-auth-guide={provider}>
      <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs text-muted"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" /><span><b className="text-fg">{provider === 'google' ? 'Google' : 'GitHub'} sign-in isn’t configured on this deployment yet.</b> Everything else works — you’re in guest mode and nothing is lost.</span></div>
      {provider === 'google' ? (
        <>
          <ol className="space-y-3">
            <Step n={1}>In <a className="text-accent" target="_blank" rel="noreferrer noopener" href="https://console.cloud.google.com/apis/credentials">Google Cloud Console</a> create an <b>OAuth client ID</b> (type <i>Web application</i>) and enable the <b>Google Drive API</b>.</Step>
            <Step n={2}>Add <code className="rounded bg-subtle px-1">{origin}</code> to <i>Authorized JavaScript origins</i>.</Step>
            <Step n={3}>Set <code className="rounded bg-subtle px-1">VITE_GOOGLE_CLIENT_ID</code> in Cloudflare Pages and redeploy — or paste the client ID below to try it right now.</Step>
          </ol>
          <Input value={a.googleClientIdOverride} onChange={(e) => a.setGoogleClientId(e.target.value)} placeholder="1234567890-abc….apps.googleusercontent.com" spellCheck={false} aria-label="Google client ID override" />
        </>
      ) : (
        <ol className="space-y-3">
          <Step n={1}>Create a <a className="text-accent" target="_blank" rel="noreferrer noopener" href="https://github.com/settings/developers">GitHub OAuth App</a> with callback URL <code className="break-all rounded bg-subtle px-1">{origin}/api/auth/github</code>.</Step>
          <Step n={2}>In Cloudflare Pages → Settings → Environment variables add <code className="rounded bg-subtle px-1">GITHUB_CLIENT_ID</code> and (encrypted) <code className="rounded bg-subtle px-1">GITHUB_CLIENT_SECRET</code>.</Step>
          <Step n={3}>Redeploy. This dialog detects the configuration automatically via <code className="rounded bg-subtle px-1">/api/auth/github?action=status</code>.</Step>
        </ol>
      )}
      <a href={DOC_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-accent">Full guide: DOCS/05-AUTH-SEO-DEPLOY.md <ExternalLink size={10} /></a>
    </div>
  )
}

export function AuthModal() {
  const a = useAuth()
  const gOk = a.googleConfigured()
  return (
    <Modal open={a.modalOpen} onClose={a.closeModal} size="sm" title={a.guide ? 'Set up sign-in' : 'Sign in to UnQStudio'} description={a.guide ? undefined : 'Optional. Sign in to back up and sync your projects across devices. Guest mode always works.'}
      footer={a.guide ? <Button variant="ghost" onClick={() => a.openGuide(null)}>Back</Button> : <Button variant="ghost" onClick={a.closeModal}>Continue as guest</Button>}>
      {a.guide ? <SetupGuide provider={a.guide} /> : (
        <div className="space-y-2.5" data-auth-modal>
          <button onClick={() => void a.signInGoogle()} disabled={a.busy === 'google'} className="flex h-11 w-full items-center gap-3 rounded-xl border border-line bg-panel px-4 text-sm font-medium transition-colors duration-150 hover:border-line-strong hover:bg-subtle disabled:opacity-60" data-auth-google>
            {a.busy === 'google' ? <Spinner size={16} /> : <GoogleG />}<span className="flex-1 text-left">Continue with Google</span>
            {a.google ? <Badge tone="success"><Check size={9} />signed in</Badge> : gOk ? <Badge tone="success">ready</Badge> : <Badge tone="warn">not configured</Badge>}
          </button>
          <button onClick={a.signInGithub} disabled={a.busy === 'github'} className="flex h-11 w-full items-center gap-3 rounded-xl border border-line bg-panel px-4 text-sm font-medium transition-colors duration-150 hover:border-line-strong hover:bg-subtle disabled:opacity-60" data-auth-github>
            {a.busy === 'github' ? <Spinner size={16} /> : <GitHubMark />}<span className="flex-1 text-left">Continue with GitHub</span>
            {a.github ? <Badge tone="success"><Check size={9} />signed in</Badge> : a.githubConfigured === null ? <Spinner size={11} /> : a.githubConfigured ? <Badge tone="success">ready</Badge> : <Badge tone="warn">not configured</Badge>}
          </button>
          {a.error && <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{a.error}</p>}
          {(!gOk || a.githubConfigured === false) && <button onClick={() => a.openGuide(!gOk ? 'google' : 'github')} className="text-xs text-accent hover:underline">How do I enable sign-in? (3-step guide)</button>}
          <p className="pt-1 text-[11px] leading-relaxed text-faint">Google sync uses your own Drive’s private AppData folder; GitHub sync uses a private Gist. Tokens stay in this tab’s session only.</p>
        </div>
      )}
    </Modal>
  )
}
