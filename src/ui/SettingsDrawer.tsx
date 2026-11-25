import { useState } from 'react'
import { Cog } from 'lucide-react'
import { Drawer, Section, Segmented, Switch, Tabs } from '@/ui/primitives'
import { useApp, type ThemePref } from '@/store/app'
import { useSettings } from '@/store/settings'
import { ProvidersTab } from '@/ui/settings/ProvidersTab'
import { ConnectionsTab } from '@/ui/settings/ConnectionsTab'
import { PromptsTab } from '@/ui/settings/PromptsTab'
import { DataTab } from '@/ui/settings/DataTab'
import { DebugTab } from '@/ui/settings/DebugTab'
import { FeaturesTab } from '@/ui/settings/FeaturesTab'

function General() {
  const { theme, setTheme, mode, setMode } = useApp()
  const s = useSettings()
  return (
    <div className="p-5">
      <Section title="Appearance" description="Obsidian Dark and Paper Light, with a system option.">
        <Segmented<ThemePref> value={theme} onChange={setTheme} items={[{ id: 'system', label: 'System' }, { id: 'light', label: 'Paper Light' }, { id: 'dark', label: 'Obsidian Dark' }]} />
      </Section>
      <Section title="Default workspace" description="Studio is chat-first. Code is the full IDE. Switch any time with ⌘E.">
        <Segmented value={mode} onChange={setMode} items={[{ id: 'studio', label: 'Studio' }, { id: 'code', label: 'Code' }]} />
      </Section>
      <Section title="Agent behaviour">
        <div className="flex items-center justify-between rounded-xl border border-line p-3">
          <div><p className="text-sm font-medium">Require approval for file changes</p><p className="text-xs text-muted">Hold AI edits in an approval tray instead of applying immediately.</p></div>
          <Switch checked={s.flags.approvalTray} onChange={(v) => s.setFlag('approvalTray', v)} label="Approval tray" />
        </div>
      </Section>
    </div>
  )
}

export const SETTINGS_TABS: { id: string; label: string; render: () => React.ReactNode }[] = [
  { id: 'general', label: 'General', render: () => <General /> },
  { id: 'providers', label: 'Providers', render: () => <ProvidersTab /> },
  { id: 'connections', label: 'Connections', render: () => <ConnectionsTab /> },
  { id: 'prompts', label: 'Prompts', render: () => <PromptsTab /> },
  { id: 'data', label: 'Data', render: () => <DataTab /> },
  { id: 'debug', label: 'Debug', render: () => <DebugTab /> },
  { id: 'features', label: 'Features', render: () => <FeaturesTab /> },
]

export default function SettingsDrawer() {
  const { settingsOpen, closeSettings, settingsTab, openSettings } = useApp()
  const [tabs] = useState(SETTINGS_TABS)
  const active = tabs.find((t) => t.id === settingsTab) ?? tabs[0]
  return (
    <Drawer open={settingsOpen} onClose={closeSettings} title={<span className="flex items-center gap-2"><Cog size={15} />Settings</span>}>
      <div className="flex h-full flex-col">
        <Tabs size="sm" className="shrink-0 border-b border-line px-3" value={active.id} onChange={(id) => openSettings(id)} items={tabs.map((t) => ({ id: t.id, label: t.label }))} />
        <div className="min-h-0 flex-1 overflow-auto">{active.render()}</div>
      </div>
    </Drawer>
  )
}
