import { ProviderIcon } from '@/ui/icons/ProviderIcon'
import { useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Gift, ShieldCheck } from 'lucide-react'
import { Badge, Button, Input, Modal, Switch } from '@/ui/primitives'
import { ProviderKeyForm } from './ProviderKeyForm'
import { PROVIDERS, type ProviderDef } from '@/core/ai/providers'
import { useApp } from '@/store/app'
import { useSettings } from '@/store/settings'
import { useVault } from '@/store/vault'
import { toast } from '@/store/toast'

const FEATURED = ['openrouter', 'gemini', 'groq', 'cerebras', 'github', 'ollama', 'openai', 'anthropic']

export function OnboardingWizard() {
  const { onboardingOpen, setOnboardingOpen } = useApp()
  const settings = useSettings()
  const vault = useVault()
  const [picked, setPicked] = useState<ProviderDef | null>(null)
  const [encrypt, setEncrypt] = useState(false)
  const [pass, setPass] = useState('')
  const list = useMemo(() => [...PROVIDERS].sort((a, b) => FEATURED.indexOf(a.id) - FEATURED.indexOf(b.id)).sort((a, b) => Number(!!b.freeTier) - Number(!!a.freeTier)), [])

  const close = () => { setOnboardingOpen(false); setPicked(null) }
  const finish = async () => {
    if (!picked) return
    if (encrypt && !vault.encrypted) {
      try { await vault.enable(pass) } catch (e) { return toast.error('Passphrase', String(e)) }
    }
    settings.set({ activeProvider: picked.id, activeModel: [...picked.models.map((m) => m.id), ...(settings.userModels[picked.id] ?? [])][0] ?? settings.activeModel, onboarded: true })
    toast.success(`${picked.name} is ready`, 'Your key stays on this device.')
    close()
  }

  return (
    <Modal open={onboardingOpen} onClose={close} size="lg" title={picked ? `Connect ${picked.name}` : 'Connect a model in 30 seconds'} description={picked ? picked.blurb : 'UnQStudio runs entirely in your browser. Bring your own key — it is stored locally and sent only to the provider you pick.'}
      footer={picked ? <><Button variant="ghost" onClick={() => setPicked(null)}><ArrowLeft size={14} />Back</Button><Button variant="primary" onClick={finish} disabled={encrypt && pass.length < 6}>Use {picked.name}</Button></> : undefined}>
      {!picked ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => setPicked(p)} className="flex flex-col gap-1 rounded-xl border border-line p-3 text-left transition hover:border-line-strong hover:bg-subtle">
              <span className="flex items-center justify-between"><span className="flex min-w-0 items-center gap-2 text-sm font-medium"><ProviderIcon id={p.id} name={p.name} logo={p.logo} size={18} />{p.name}</span>{p.freeTier && <Badge tone="success"><Gift size={9} />free</Badge>}</span>
              <span className="text-xs text-muted">{p.freeTier ?? p.blurb}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <ol className="space-y-1 rounded-xl bg-subtle p-3 text-xs text-muted">
            {picked.keyUrl && <li>1. Create a key at <a className="inline-flex items-center gap-1 text-accent" href={picked.keyUrl} target="_blank" rel="noreferrer noopener">{new URL(picked.keyUrl).host}<ExternalLink size={10} /></a>{picked.freeTier && <> — {picked.freeTier}</>}</li>}
            {picked.local && <li>1. {picked.blurb}</li>}
            <li>{picked.keyUrl || picked.local ? '2' : '1'}. Paste it below, press “Test connection”, then “Save”.</li>
          </ol>
          <ProviderKeyForm provider={picked} />
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 text-muted" /><div><p className="text-[13px] font-medium">Encrypt my keys with a passphrase</p><p className="text-xs text-muted">AES-GCM-256 via PBKDF2. You will unlock the vault once per session.</p></div></div>
              <Switch checked={encrypt || vault.encrypted} disabled={vault.encrypted} onChange={setEncrypt} label="Encrypt keys" />
            </div>
            {encrypt && !vault.encrypted && <Input className="mt-3" type="password" placeholder="Choose a passphrase (min 6 characters)" value={pass} onChange={(e) => setPass(e.target.value)} />}
          </div>
        </div>
      )}
    </Modal>
  )
}
