import { useState } from 'react'
import { Copy, ExternalLink, FileCode2, Play, Rocket } from 'lucide-react'
import { Button, Input, Label, Section, Spinner, Textarea } from '@/ui/primitives'
import { useWorkspace } from '@/store/workspace'
import { getConn } from '@/store/connections'
import { toast } from '@/store/toast'
import type { Table } from '@/core/deploy/supabase'
import { fullstackScaffold } from '@/services/supabase/scaffold'
import { createTableSql, parseColumnSpec, runSql, sqlEditorUrl } from '@/services/supabase/migrations'

/** Database panel add-on: one-click full-stack scaffold (typed client + .env + Auth/CRUD/Realtime hooks) and a SQL migration generator/runner. */
export function SupabaseFullstack({ tables }: { tables: Table[] | null }) {
  const vfs = useWorkspace((s) => s.vfs)
  const c = getConn('supabase')
  const [table, setTable] = useState('notes')
  const [cols, setCols] = useState('title text not null, done boolean')
  const [sql, setSql] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!vfs) return null

  const scaffold = async () => {
    try {
      const files = fullstackScaffold({ url: c.url ?? '', key: c.key ?? '', tables: tables ?? [] })
      let pkg: Record<string, any> = {}
      try { pkg = JSON.parse(vfs.read('/package.json') ?? '{}') } catch { /* fresh */ }
      pkg.dependencies = { ...(pkg.dependencies ?? {}), '@supabase/supabase-js': '^2.45.0' }
      files['/package.json'] = JSON.stringify(pkg, null, 2) + '\n'
      await vfs.checkpoint('Before full-stack scaffold', 'auto')
      await vfs.writeMany(files, { actor: 'user' })
      await vfs.checkpoint('Scaffolded Supabase full-stack (client, env, auth, realtime)', 'manual')
      toast.success('Full-stack scaffold added', '.env is injected into the live preview automatically.')
    } catch (e) { toast.error('Scaffold failed', e instanceof Error ? e.message : String(e)) }
  }
  const generate = () => { try { setSql(createTableSql(table, parseColumnSpec(cols))); setMsg(null) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }) } }
  const save = async () => { await vfs.writeMany({ [`/supabase/migrations/${String(Date.now()).slice(-6)}_${table.replace(/\W+/g, '_')}.sql`]: sql }, { actor: 'user' }); toast.success('Migration saved to /supabase/migrations') }
  const run = async () => { setBusy(true); const r = await runSql(c.url ?? '', token.trim(), sql); setMsg({ ok: r.ok, text: r.message }); setBusy(false) }

  return (
    <Section title="Full-stack engine" description="Typed client, auth, CRUD + Realtime hooks and SQL migrations for your connected Supabase project.">
      <div data-supabase-fullstack className="space-y-3">
        <Button size="sm" variant="primary" onClick={() => void scaffold()} data-scaffold-fullstack><Rocket size={13} />Scaffold full-stack</Button>
        <div className="glass-field space-y-2 rounded-2xl p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium"><FileCode2 size={13} />SQL migration generator</p>
          <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <div><Label>Table</Label><Input aria-label="Table name" value={table} onChange={(e) => setTable(e.target.value)} /></div>
            <div><Label hint="name type [not null]">Columns</Label><Input aria-label="Columns" value={cols} onChange={(e) => setCols(e.target.value)} /></div>
            <div className="flex items-end"><Button size="sm" onClick={generate}>Generate</Button></div>
          </div>
          {sql && (
            <>
              <Textarea aria-label="Generated SQL" value={sql} onChange={(e) => setSql(e.target.value)} rows={8} className="font-mono text-[11px]" />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void navigator.clipboard?.writeText(sql)}><Copy size={12} />Copy</Button>
                <Button size="sm" onClick={() => void save()}>Save to project</Button>
                <a href={sqlEditorUrl(c.url ?? '')} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-accent">SQL editor <ExternalLink size={10} /></a>
              </div>
              <div className="flex items-center gap-2"><Input type="password" aria-label="Supabase access token" placeholder="Access token sbp_… (optional, to run here)" value={token} onChange={(e) => setToken(e.target.value)} /><Button size="sm" variant="primary" disabled={busy || !token.trim()} onClick={() => void run()}>{busy ? <Spinner size={12} /> : <Play size={12} />}Run</Button></div>
            </>
          )}
          {msg && <p role="status" className={msg.ok ? 'text-xs text-success' : 'text-xs text-danger'}>{msg.text}</p>}
        </div>
      </div>
    </Section>
  )
}
