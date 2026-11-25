import { Check, ChevronDown } from 'lucide-react'
import { Dropdown } from '@/ui/primitives'
import { allProviders, configFor } from '@/store/aiConfig'
import { useSettings } from '@/store/settings'
import { useApp } from '@/store/app'
import { useVault } from '@/store/vault'

export function ModelPill({ align = 'start' }: { align?: 'start' | 'end' }) {
  const s = useSettings()
  useVault((v) => v.rev)
  const cfg = configFor(s.activeProvider, s.activeModel)
  const providers = allProviders().filter((p) => s.enabled[p.id] !== false)
  return (
    <Dropdown
      width={310}
      align={align}
      trigger={
        <button className="flex h-8 max-w-[230px] items-center gap-1.5 rounded-full border border-line bg-subtle px-3 text-xs font-medium text-muted transition hover:border-line-strong hover:text-fg" aria-label="Select model">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.error ? 'bg-warn' : 'bg-success'}`} title={cfg.error ? 'API key needed' : 'Ready'} />
          <span className="truncate">{s.activeModel.split('/').pop()}</span>
          <ChevronDown size={12} className="shrink-0" />
        </button>
      }
      content={(close) => (
        <div>
          {providers.map((p) => {
            const models = [...p.models.map((x) => x.id), ...(s.userModels[p.id] ?? [])]
            if (!models.length) return null
            const c = configFor(p.id)
            return (
              <div key={p.id} className="mb-1">
                <div className="flex items-center justify-between px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  <span>{p.name}</span>
                  {c.error && <span className="text-warn normal-case tracking-normal">needs key</span>}
                </div>
                {models.map((id) => (
                  <button key={id} onClick={() => { s.set({ activeProvider: p.id, activeModel: id }); close(); if (c.error === 'nokey') useApp.getState().setOnboardingOpen(true) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-subtle">
                    <span className="flex-1 truncate">{id}</span>
                    {s.activeProvider === p.id && s.activeModel === id && <Check size={13} className="text-accent" />}
                  </button>
                ))}
              </div>
            )
          })}
          <div className="mt-1 flex gap-1 border-t border-line p-1">
            <button onClick={() => { close(); useApp.getState().setOnboardingOpen(true) }} className="flex-1 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted hover:bg-subtle hover:text-fg">Quick setup…</button>
            <button onClick={() => { close(); useApp.getState().openSettings('providers') }} className="flex-1 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted hover:bg-subtle hover:text-fg">All providers…</button>
          </div>
        </div>
      )}
    />
  )
}
