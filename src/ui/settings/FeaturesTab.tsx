import { useState } from 'react'
import { Plug, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, ColorField, Input, Label, Section, SelectSheet, Spinner, Switch, Textarea } from '@/ui/primitives'
import { useSettings, type FeatureFlags } from '@/store/settings'
import { parseRegistry } from '@/core/plugins'
import { probeMcp, type McpProbe } from '@/core/ai/mcp'
import { toast } from '@/store/toast'
import { uid } from '@/lib/util'

const FLAGS: Array<[keyof FeatureFlags, string, string]> = [
  ['approvalTray', 'Approval tray', 'Hold AI file changes until you approve them.'],
  ['autoCheckpoint', 'Auto-checkpoint each AI turn', 'Snapshot before every Build request so “Undo turn” always works.'],
  ['showTokenMeter', 'Token & cost meter', 'Show session tokens, context size and estimated cost in chat.'],
  ['autoFixErrors', 'Auto-fix preview errors', 'After an AI turn, send build/runtime errors back to the model (max 2 rounds).'],
  ['reasoningUI', 'Reasoning blocks', 'Show collapsible <think> / reasoning output.'],
  ['includeAllFiles', 'Send all files as context', 'Off = only pinned and @mentioned files (cheaper, but the model sees less).'],
]

export function FeaturesTab() {
  const s = useSettings()
  const reg = s.plugins
  const [theme, setTheme] = useState({ name: '', accent: '#2563eb', bg: '#fafafa', surface: '#ffffff', fg: '#09090b', radius: 12, font: 'Inter' })
  const [prov, setProv] = useState({ name: '', baseUrl: '', models: '' })
  const [mcp, setMcp] = useState({ name: '', url: '', transport: 'http' as 'http' | 'sse', headers: '' })
  const [json, setJson] = useState('')
  const [probe, setProbe] = useState<Record<string, McpProbe | string | 'loading'>>({})
  const setReg = (patch: Partial<typeof reg>) => s.set({ plugins: { ...reg, ...patch } })

  const addMcp = () => {
    try {
      const headers = mcp.headers.trim() ? (JSON.parse(mcp.headers) as Record<string, string>) : {}
      if (!/^https?:\/\//.test(mcp.url)) throw new Error('URL must start with http(s)://')
      setReg({ mcp: [...reg.mcp, { id: uid('mcp_'), name: mcp.name || new URL(mcp.url).host, url: mcp.url, transport: mcp.transport, headers, enabled: true }] })
      setMcp({ name: '', url: '', transport: 'http', headers: '' })
    } catch (e) { toast.error('Invalid connector', e instanceof Error ? e.message : String(e)) }
  }
  const test = async (id: string) => {
    const c = reg.mcp.find((m) => m.id === id)!
    setProbe((p) => ({ ...p, [id]: 'loading' }))
    try { const r = await probeMcp(c); setProbe((p) => ({ ...p, [id]: r })) } catch (e) { setProbe((p) => ({ ...p, [id]: e instanceof Error ? e.message : String(e) })) }
  }

  return (
    <div className="p-5">
      <Section title="Feature flags" description="Toggle behaviours. Changes apply immediately.">
        <div className="divide-y divide-line rounded-2xl border border-line">
          {FLAGS.map(([k, label, desc]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-4 py-3"><div><p className="text-[13px] font-medium">{label}</p><p className="text-xs text-muted">{desc}</p></div><Switch checked={s.flags[k]} onChange={(v) => s.setFlag(k, v)} label={label} /></div>
          ))}
        </div>
      </Section>

      <Section title="Custom themes" description="Appear in Theme Studio presets and the command palette.">
        <div className="space-y-2">{reg.themes.map((t) => <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-xs"><span className="h-4 w-4 rounded" style={{ background: t.accent }} /><span className="flex-1">{t.name} <span className="text-faint">· {t.font} · r{t.radius}</span></span><Button size="icon-sm" variant="ghost" aria-label="Remove theme" onClick={() => setReg({ themes: reg.themes.filter((x) => x.id !== t.id) })}><Trash2 size={13} /></Button></div>)}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input placeholder="Name" value={theme.name} onChange={(e) => setTheme({ ...theme, name: e.target.value })} className="col-span-2 h-8 text-xs" />
          {(['accent', 'bg', 'surface', 'fg'] as const).map((k) => <div key={k} className="flex items-center gap-2 text-[11px] text-muted"><ColorField label={`Theme ${k} colour`} value={theme[k]} onChange={(hex) => setTheme({ ...theme, [k]: hex })} showValue={false} />{k}</div>)}
          <Input placeholder="Font" value={theme.font} onChange={(e) => setTheme({ ...theme, font: e.target.value })} className="h-8 text-xs" />
          <Input type="number" placeholder="Radius" value={theme.radius} onChange={(e) => setTheme({ ...theme, radius: Number(e.target.value) })} className="h-8 text-xs" />
          <Button size="sm" disabled={!theme.name.trim()} onClick={() => { setReg({ themes: [...reg.themes, { id: uid('th_'), ...theme }] }); setTheme({ ...theme, name: '' }) }}><Plus size={13} />Add theme</Button>
        </div>
      </Section>

      <Section title="Custom OpenAI-compatible providers" description="Appear in the model picker. The endpoint must allow browser CORS.">
        <div className="space-y-2">{reg.providers.map((p) => <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-xs"><span className="flex-1">{p.name} <span className="font-mono text-faint">{p.baseUrl}</span> <span className="text-muted">· {p.models.length} models</span></span><Button size="icon-sm" variant="ghost" aria-label="Remove provider" onClick={() => setReg({ providers: reg.providers.filter((x) => x.id !== p.id) })}><Trash2 size={13} /></Button></div>)}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Name" value={prov.name} onChange={(e) => setProv({ ...prov, name: e.target.value })} className="h-8 text-xs" />
          <Input placeholder="https://host/v1" value={prov.baseUrl} onChange={(e) => setProv({ ...prov, baseUrl: e.target.value })} className="h-8 text-xs" />
          <Input placeholder="model-a, model-b" value={prov.models} onChange={(e) => setProv({ ...prov, models: e.target.value })} className="h-8 text-xs" />
        </div>
        <Button size="sm" className="mt-2" disabled={!prov.name.trim() || !/^https?:\/\//.test(prov.baseUrl)} onClick={() => { setReg({ providers: [...reg.providers, { id: uid('pv_'), name: prov.name.trim(), baseUrl: prov.baseUrl.trim(), models: prov.models.split(',').map((m) => m.trim()).filter(Boolean) }] }); setProv({ name: '', baseUrl: '', models: '' }) }}><Plus size={13} />Add provider</Button>
        <p className="mt-1 text-[11px] text-faint">Set its API key under Providers → (it appears there once added).</p>
      </Section>

      <Section title="MCP connectors (remote)" description="Remote HTTP / SSE MCP servers only — the server must send CORS headers for browser origins. Stdio servers cannot run in a static browser app.">
        <div className="space-y-2">
          {reg.mcp.map((m) => {
            const p = probe[m.id]
            return (
              <div key={m.id} className="rounded-xl border border-line p-3 text-xs">
                <div className="flex items-center gap-3">
                  <Plug size={14} className="text-muted" />
                  <div className="min-w-0 flex-1"><p className="font-medium">{m.name} <Badge>{m.transport}</Badge></p><p className="truncate font-mono text-faint">{m.url}</p></div>
                  <Switch checked={m.enabled} onChange={(v) => setReg({ mcp: reg.mcp.map((x) => (x.id === m.id ? { ...x, enabled: v } : x)) })} label={`Enable ${m.name}`} />
                  <Button size="xs" onClick={() => void test(m.id)} disabled={p === 'loading'}>{p === 'loading' && <Spinner size={11} />}Test</Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Remove connector" onClick={() => setReg({ mcp: reg.mcp.filter((x) => x.id !== m.id) })}><Trash2 size={13} /></Button>
                </div>
                {typeof p === 'string' && p !== 'loading' && <p className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-danger">{p} — check the URL, auth headers and that the server allows CORS.</p>}
                {p && typeof p === 'object' && <div className="mt-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2"><p className="text-success">Connected to {p.serverName} {p.serverVersion}</p><p className="mt-1 text-muted">{p.tools.length ? p.tools.map((t) => t.name).join(', ') : 'No tools exposed'}</p></div>}
              </div>
            )
          })}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Input placeholder="Name" value={mcp.name} onChange={(e) => setMcp({ ...mcp, name: e.target.value })} className="h-8 text-xs" />
          <Input placeholder="https://mcp.example.com/mcp" value={mcp.url} onChange={(e) => setMcp({ ...mcp, url: e.target.value })} className="h-8 text-xs" />
          <SelectSheet value={mcp.transport} onChange={(v) => setMcp({ ...mcp, transport: v as 'http' | 'sse' })} aria-label="Transport" className="h-8 w-44" options={[{ value: 'http', label: 'Streamable HTTP' }, { value: 'sse', label: 'Legacy SSE' }]} />
          <Input placeholder='Headers JSON, e.g. {"Authorization":"Bearer …"}' value={mcp.headers} onChange={(e) => setMcp({ ...mcp, headers: e.target.value })} className="h-8 text-xs" />
        </div>
        <Button size="sm" className="mt-2" disabled={!mcp.url} onClick={addMcp}><Plus size={13} />Add connector</Button>
      </Section>

      <Section title="Registry JSON" description="Declarative export/import of themes, templates, providers and MCP connectors. Templates can only be added here.">
        <Label>JSON</Label>
        <Textarea rows={6} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{ "templates": [ { "name": "My starter", "files": { "/src/App.tsx": "…" } } ] }' className="font-mono text-[11px]" />
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => setJson(JSON.stringify(reg, null, 2))}>Export current</Button>
          <Button size="sm" variant="primary" disabled={!json.trim()} onClick={() => { try { const r = parseRegistry(JSON.parse(json)); s.set({ plugins: { themes: [...reg.themes, ...r.themes], templates: [...reg.templates, ...r.templates], providers: [...reg.providers, ...r.providers], mcp: [...reg.mcp, ...r.mcp] } }); toast.success('Registry imported', `${r.themes.length} themes · ${r.templates.length} templates · ${r.providers.length} providers · ${r.mcp.length} connectors`) } catch (e) { toast.error('Invalid registry', e instanceof Error ? e.message : String(e)) } }}>Import (merge)</Button>
        </div>
        {reg.templates.length > 0 && <div className="mt-3 space-y-1">{reg.templates.map((t) => <div key={t.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-1.5 text-xs">{t.name} <span className="text-faint">{Object.keys(t.files).length} files</span><Button size="icon-sm" variant="ghost" aria-label="Remove template" onClick={() => setReg({ templates: reg.templates.filter((x) => x.id !== t.id) })}><Trash2 size={12} /></Button></div>)}</div>}
      </Section>
    </div>
  )
}
