import { useState } from 'react'
import { ChevronRight, Database, Download, Table2 } from 'lucide-react'
import { Badge, Button, Section, Spinner } from '@/ui/primitives'
import { NotConnected, useConnected } from './shared'
import { useWorkspace } from '@/store/workspace'
import { getConn } from '@/store/connections'
import { browseTable, clientSnippet, fetchOpenApi, generateTypes, parseTables, type Table } from '@/core/deploy/supabase'
import { toast } from '@/store/toast'
import { SupabaseFullstack } from './SupabaseFullstack'
import { rememberTables } from '@/services/supabase/context'
import { cn } from '@/lib/cn'

export function SupabaseTab() {
  const vfs = useWorkspace((s) => s.vfs)
  const ok = useConnected('supabase')
  const [tables, setTables] = useState<Table[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, Record<string, unknown>[] | string>>({})
  if (!vfs) return null
  if (!ok) return <NotConnected service="supabase" name="Supabase" />
  const c = getConn('supabase')

  const load = async () => {
    setBusy(true)
    try { const t = parseTables(await fetchOpenApi(c.url, c.key)); setTables(t); rememberTables(t.map((x) => x.name)) } catch (e) { toast.error('Could not read schema', e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const browse = async (t: string) => {
    setOpen(open === t ? null : t)
    if (rows[t]) return
    try { const data = await browseTable(c.url, c.key, t); setRows((r) => ({ ...r, [t]: data })) } catch (e) { setRows((r) => ({ ...r, [t]: e instanceof Error ? e.message : String(e) })) }
  }
  const inject = async () => {
    try {
      const files = clientSnippet(c.url, c.key)
      files['/src/lib/database.types.ts'] = generateTypes(tables ?? [])
      let pkg: Record<string, any> = {}
      try { pkg = JSON.parse(vfs.read('/package.json') ?? '{}') } catch { /* fresh */ }
      pkg.dependencies = { ...(pkg.dependencies ?? {}), '@supabase/supabase-js': '^2.45.0' }
      files['/package.json'] = JSON.stringify(pkg, null, 2) + '\n'
      await vfs.checkpoint('Before Supabase client', 'auto')
      await vfs.writeMany(files, { actor: 'user' })
      await vfs.checkpoint('Added typed Supabase client', 'manual')
      toast.success('Supabase client added', 'Import { supabase } from "@/lib/supabase" anywhere in your app.')
    } catch (e) { toast.error('Could not inject client', e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div>
      <Section title="Supabase explorer" description={`Connected to ${c.url}. Reads the PostgREST schema and rows directly from your browser (subject to your Row Level Security policies).`}
        right={<div className="flex gap-2"><Button size="sm" onClick={load} disabled={busy}>{busy ? <Spinner size={12} /> : <Database size={13} />}{tables ? 'Reload schema' : 'Load schema'}</Button><Button size="sm" variant="primary" onClick={inject} disabled={!tables}><Download size={13} />Inject typed client</Button></div>}>
        {!tables && <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-xs text-muted">Load the schema to browse tables and generate TypeScript types.</p>}
        {tables?.length === 0 && <p className="text-xs text-muted">No tables are exposed to this key.</p>}
        <div className="space-y-1.5">
          {tables?.map((t) => (
            <div key={t.name} className="rounded-xl border border-line">
              <button onClick={() => void browse(t.name)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]"><ChevronRight size={13} className={cn('text-faint transition-transform', open === t.name && 'rotate-90')} /><Table2 size={14} className="text-muted" />{t.name}<Badge>{t.columns.length} cols</Badge></button>
              {open === t.name && (
                <div className="animate-fade space-y-2 border-t border-line p-3">
                  <div className="flex flex-wrap gap-1">{t.columns.map((col) => <span key={col.name} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px]">{col.name}: <span className="text-muted">{col.format ?? col.type}</span>{col.pk && <span className="text-accent"> pk</span>}</span>)}</div>
                  {typeof rows[t.name] === 'string' ? <p className="text-xs text-danger">{rows[t.name] as string}</p> : Array.isArray(rows[t.name]) && (rows[t.name] as unknown[]).length > 0 ? (
                    <div className="max-h-48 overflow-auto rounded-lg border border-line"><table className="w-full text-left font-mono text-[10px]"><thead className="bg-subtle"><tr>{t.columns.map((col) => <th key={col.name} className="px-2 py-1 font-medium">{col.name}</th>)}</tr></thead><tbody>{(rows[t.name] as Record<string, unknown>[]).map((r, i) => <tr key={i} className="border-t border-line">{t.columns.map((col) => <td key={col.name} className="max-w-40 truncate px-2 py-1">{typeof r[col.name] === 'object' ? JSON.stringify(r[col.name]) : String(r[col.name] ?? '')}</td>)}</tr>)}</tbody></table></div>
                  ) : <p className="text-xs text-muted">{rows[t.name] ? 'No rows (or RLS hides them).' : 'Loading…'}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
      <SupabaseFullstack tables={tables} />
    </div>
  )
}
