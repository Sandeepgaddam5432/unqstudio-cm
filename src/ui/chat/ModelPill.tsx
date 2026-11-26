import { ChevronDown } from 'lucide-react'
import { Dropdown } from '@/ui/primitives'
import { configFor } from '@/store/aiConfig'
import { useSettings } from '@/store/settings'
import { useVault } from '@/store/vault'
import { ModelPicker } from './ModelPicker'
import { ModelIcon } from '@/ui/icons/ModelIcon'

/** Model pill: Floating-UI popover (>=640px) or bottom-sheet drawer (<640px). */
export function ModelPill({ align = 'start' }: { align?: 'start' | 'end' }) {
  const s = useSettings()
  useVault((v) => v.rev)
  const cfg = configFor(s.activeProvider, s.activeModel)
  return (
    <Dropdown
      width={440}
      align={align}
      mobileSheet
      sheetTitle="Select model"
      className="p-0"
      triggerClassName="max-w-[10.5rem] sm:max-w-[14rem]"
      trigger={
        <button className="flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-line bg-subtle px-3 text-xs font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30" aria-label="Select model" data-model-pill>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.error ? 'bg-warn' : 'bg-success'}`} title={cfg.error ? 'API key needed' : 'Ready'} />
          <ModelIcon modelId={s.activeModel} providerId={s.activeProvider} providerName={cfg.provider?.name} providerLogo={cfg.provider?.logo} size={14} />
          <span className="min-w-0 truncate">{s.activeModel.split('/').pop()}</span>
          <ChevronDown size={12} className="shrink-0" />
        </button>
      }
      content={(close) => <ModelPicker close={close} />}
    />
  )
}
