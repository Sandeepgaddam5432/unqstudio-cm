import { SlidersHorizontal } from 'lucide-react'
import { Button, Dropdown, Segmented, Tooltip } from '@/ui/primitives'
import { useChatPrefs, type ChatFont, type Density } from '@/store/chatPrefs'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1.5">
      <span className="min-w-0 text-xs text-muted">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function OnOff({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <Segmented<'on' | 'off'> size="sm" value={value ? 'on' : 'off'} onChange={(v) => onChange(v === 'on')} items={[{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]} className="[&_button]:min-w-8" key={label} />
}

/** Chat customization popover shown in the chat header. */
export function ChatSettings() {
  const p = useChatPrefs()
  return (
    <Dropdown
      align="end"
      width={310}
      mobileSheet
      sheetTitle="Chat settings"
      trigger={<Tooltip label="Chat settings"><Button variant="ghost" size="icon-sm" aria-label="Chat settings"><SlidersHorizontal size={14} /></Button></Tooltip>}
      content={() => (
        <div className="p-1" data-chat-settings>
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Chat appearance</div>
          <Row label="Message density"><Segmented<Density> size="sm" value={p.density} onChange={(v) => p.setPref('density', v)} items={[{ id: 'compact', label: 'Compact' }, { id: 'comfortable', label: 'Comfortable' }]} /></Row>
          <Row label="Font size"><Segmented<ChatFont> size="sm" value={p.fontSize} onChange={(v) => p.setPref('fontSize', v)} items={[{ id: 'small', label: 'S' }, { id: 'medium', label: 'M' }, { id: 'large', label: 'L' }]} /></Row>
          <div className="mx-2 my-1 h-px bg-line" />
          <Row label="Auto-expand reasoning"><OnOff label="think" value={p.autoExpandThink} onChange={(v) => p.setPref('autoExpandThink', v)} /></Row>
          <Row label="Token & cost badges"><OnOff label="badges" value={p.showBadges} onChange={(v) => p.setPref('showBadges', v)} /></Row>
          <Row label="Agent file activity"><OnOff label="activity" value={p.showActivity} onChange={(v) => p.setPref('showActivity', v)} /></Row>
          <Row label="Auto-scroll streaming"><OnOff label="scroll" value={p.autoScroll} onChange={(v) => p.setPref('autoScroll', v)} /></Row>
          <div className="px-2 pb-1.5 pt-1"><Button size="xs" variant="ghost" onClick={p.reset}>Reset to defaults</Button></div>
        </div>
      )}
    />
  )
}
