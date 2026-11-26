import { useState, type ReactNode } from 'react'
import { haptic, hapticsEnabled, hapticsSupported, setHapticsEnabled } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { AccountTab } from '@/ui/settings/AccountTab'
import { Drawer, Logo, Section, Segmented, Switch } from '@/ui/primitives'
import { useApp, type AccentPreset, type ThemePref } from '@/store/app'
import { useSettings } from '@/store/settings'
import { ProvidersTab } from '@/ui/settings/ProvidersTab'
import { ConnectionsTab } from '@/ui/settings/ConnectionsTab'
import { PromptsTab } from '@/ui/settings/PromptsTab'
import { DataTab } from '@/ui/settings/DataTab'
import { DebugTab } from '@/ui/settings/DebugTab'
import { FeaturesTab } from '@/ui/settings/FeaturesTab'

function Appearance() {
  const { theme, setTheme, accent, setAccent } = useApp()
  const [haptics, setHaptics] = useState(hapticsEnabled())
  return (
    <div className="p-5">
      <Section title="Appearance" description="Obsidian Dark and Paper Light, with a system option.">
        <Segmented<ThemePref> value={theme} onChange={setTheme} items={[{ id: 'system', label: 'System' }, { id: 'light', label: 'Paper Light' }, { id: 'dark', label: 'Obsidian Dark' }]} />
      </Section>
      <Section title="Accent" description="Signature keeps the Obsidian/Paper ember accent. Lovable Warm is a soft ambient orange.">
        <Segmented<AccentPreset> value={accent} onChange={setAccent} items={[{ id: 'signature', label: 'Signature' }, { id: 'warm', label: 'Lovable Warm' }]} />
      </Section>
      <Section title="Haptics" description={hapticsSupported() ? 'Subtle vibration on tab switch, send, restore, build complete and errors.' : 'Vibration is not available on this device or browser.'}>
        <label className="flex items-center gap-3 text-sm"><Switch checked={haptics} onChange={(v) => { setHaptics(v); setHapticsEnabled(v); if (v) haptic('success') }} />Tactile feedback</label>
      </Section>
    </div>
  )
}

function ChatAndEditor() {
  const { mode, setMode } = useApp()
  const s = useSettings()
  return (
    <div className="p-5">
      <Section title="Default workspace" description="Studio is chat-first. Code is the full IDE. Switch any time with ⌘E.">
        <Segmented value={mode} onChange={setMode} items={[{ id: 'studio', label: 'Studio' }, { id: 'code', label: 'Code' }]} />
      </Section>
      <Section title="Auto-Heal Builds" description="After an AI turn, wait for the real esbuild compile (plus a short runtime window); if it fails, feed the exact errors and file excerpts back to the model until the build is green.">
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-line p-3">
            <div><p className="text-sm font-medium">Auto-heal in Build mode</p><p className="text-xs text-muted">On by default. Stop or undo the whole turn from the status pill.</p></div>
            <Switch checked={s.flags.autoHeal !== false} onChange={(v) => s.setFlag('autoHeal', v)} label="Auto-heal builds" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <div><p className="text-sm font-medium">Multi-step agent loop</p><p className="text-xs text-muted">Lets the model read files, search and verify the build over several steps. Stop or undo the whole turn from the status pill.</p></div>
            <Switch checked={s.flags.agentLoop !== false} onChange={(v) => s.setFlag('agentLoop', v)} label="Multi-step agent loop" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <div><p className="text-sm font-medium">Max agent steps</p><p className="text-xs text-muted">Model turns per request (1–5).</p></div>
            <Segmented value={String(Math.min(5, Math.max(1, s.agentMaxSteps ?? 3)))} onChange={(v) => s.set({ agentMaxSteps: Number(v) })} items={['1', '2', '3', '4', '5'].map((n) => ({ id: n, label: n }))} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line p-3">
            <div><p className="text-sm font-medium">Max heal attempts</p><p className="text-xs text-muted">Automatic follow-up turns per request.</p></div>
            <Segmented value={String(Math.min(3, Math.max(1, s.maxAutoHealSteps ?? 3)))} onChange={(v) => s.set({ maxAutoHealSteps: Number(v) })} items={[{ id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' }]} />
          </div>
        </div>
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

interface NavItem { id: string; label: string; render: () => ReactNode }
export const SETTINGS_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'AI & Models', items: [{ id: 'providers', label: 'Providers Hub', render: () => <ProvidersTab /> }, { id: 'prompts', label: 'Prompt Rules', render: () => <PromptsTab /> }] },
  { label: 'Workspace', items: [{ id: 'editor', label: 'Chat & Editor', render: () => <ChatAndEditor /> }, { id: 'appearance', label: 'Appearance', render: () => <Appearance /> }] },
  { label: 'Account', items: [{ id: 'account', label: 'Sign In & Cloud Sync', render: () => <AccountTab /> }] },
  { label: 'Integrations', items: [{ id: 'connections', label: 'Connections', render: () => <ConnectionsTab /> }, { id: 'features', label: 'Plugins & MCP', render: () => <FeaturesTab /> }] },
  { label: 'System', items: [{ id: 'data', label: 'Data & Storage', render: () => <DataTab /> }, { id: 'debug', label: 'Debug & Logs', render: () => <DebugTab /> }] },
]
const ALL = SETTINGS_GROUPS.flatMap((g) => g.items)
/** Legacy tab ids (`general`) resolve to their new home. */
const ALIAS: Record<string, string> = { general: 'editor' }

export default function SettingsDrawer() {
  const { settingsOpen, closeSettings, settingsTab, openSettings } = useApp()
  const active = ALL.find((t) => t.id === (ALIAS[settingsTab] ?? settingsTab)) ?? ALL[0]!
  return (
    <Drawer open={settingsOpen} onClose={closeSettings} title={<span className="flex items-center gap-2"><Logo size={18} />Settings</span>}>
      <div className="flex h-full min-h-0 flex-col md:flex-row" data-settings-hub>
        <nav className="hidden w-52 shrink-0 overflow-y-auto border-r border-line p-2 md:block" role="tablist" aria-orientation="vertical" aria-label="Settings sections">
          {SETTINGS_GROUPS.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-faint">{g.label}</p>
              {g.items.map((t) => (
                <button key={t.id} role="tab" aria-selected={active.id === t.id} onClick={() => openSettings(t.id)} className={cn('flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[13px] transition-colors duration-150', active.id === t.id ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-subtle hover:text-fg')}>{t.label}</button>
              ))}
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-b border-line p-2 md:hidden">
          <select value={active.id} onChange={(e) => openSettings(e.target.value)} aria-label="Settings section" className="h-9 w-full rounded-lg border border-line bg-subtle px-2.5 text-[13px] text-fg">
            {SETTINGS_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>)}
          </select>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto" data-settings-panel>{active.render()}</div>
      </div>
    </Drawer>
  )
}
