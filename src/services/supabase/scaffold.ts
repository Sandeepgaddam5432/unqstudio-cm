import { clientSnippetSafe } from './clientSafe'
import { generateTypes, type Table } from '@/core/deploy/supabase'
import { defaultMigration } from './migrations'

/** Parse `.env` text → only the public `VITE_*` keys (these are injected into the live preview runtime). */
export function parseDotEnv(text?: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const m = /^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(raw)
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
  }
  return out
}

export const CLIENT_TS = `import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Public values from /.env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). The anon key is public by design — protect data with Row Level Security.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)
export const supabase = (isSupabaseConfigured ? createClient<Database>(url!, anonKey!) : null) as unknown as SupabaseClient<Database>
`

export const USE_SESSION_TS = `import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

/** Current auth session (undefined while loading, null when signed out). */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    if (!isSupabaseConfigured) { setSession(null); return }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}
`

export const USE_TABLE_TS = `import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Row = { id: string | number } & Record<string, unknown>

/** CRUD + Realtime for one table: optimistic writes, live inserts/updates/deletes from other tabs and devices. */
export function useTable<T extends Row>(table: string, order = 'created_at') {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const db = supabase as unknown as { from: (t: string) => any; channel: (n: string) => any; removeChannel: (c: unknown) => void }

  const refresh = useCallback(async () => {
    const { data, error: e } = await db.from(table).select('*').order(order, { ascending: false })
    if (e) setError(e.message); else { setRows((data ?? []) as T[]); setError(null) }
    setLoading(false)
  }, [table, order])

  useEffect(() => {
    void refresh()
    const ch = db.channel('rt:' + table).on('postgres_changes', { event: '*', schema: 'public', table }, () => { void refresh() }).subscribe()
    return () => { db.removeChannel(ch) }
  }, [refresh, table])

  const insert = async (values: Partial<T>) => { const { error: e } = await db.from(table).insert(values); if (e) setError(e.message); else void refresh() }
  const update = async (id: T['id'], values: Partial<T>) => { setRows((r) => r.map((x) => (x.id === id ? { ...x, ...values } : x))); const { error: e } = await db.from(table).update(values).eq('id', id); if (e) { setError(e.message); void refresh() } }
  const remove = async (id: T['id']) => { setRows((r) => r.filter((x) => x.id !== id)); const { error: e } = await db.from(table).delete().eq('id', id); if (e) { setError(e.message); void refresh() } }
  return { rows, loading, error, insert, update, remove, refresh }
}
`

export const AUTH_FORM_TSX = `import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [msg, setMsg] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
    setMsg(error ? error.message : mode === 'up' ? 'Check your inbox to confirm your email.' : '')
  }
  return (
    <form onSubmit={submit} className="mx-auto mt-24 w-full max-w-sm space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
      <input className="h-10 w-full rounded-lg border border-line bg-transparent px-3" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="h-10 w-full rounded-lg border border-line bg-transparent px-3" type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="h-10 w-full rounded-lg bg-accent font-medium text-accent-fg">{mode === 'in' ? 'Sign in' : 'Sign up'}</button>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <button type="button" className="text-sm text-muted underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}</button>
    </form>
  )
}
`

export const SETUP_NOTICE_TSX = `export function SetupNotice() {
  return (
    <div className="mx-auto mt-24 max-w-md space-y-3 rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">Connect Supabase</h1>
      <p className="text-sm text-muted">This app is full-stack: Postgres + Auth + Realtime. Connect a Supabase project in <b>Connectors</b>, press <b>Scaffold full-stack</b> in the Database panel, then run <code>/supabase/migrations/0001_init.sql</code>.</p>
      <p className="text-xs text-muted">Needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>/.env</code>.</p>
    </div>
  )
}
`

/** Files that turn a project into a working full-stack app: typed client, env, auth + CRUD/realtime hooks, auth form, starter migration. */
export function fullstackScaffold(opts: { url: string; key: string; tables?: Table[]; table?: string }): Record<string, string> {
  const url = opts.url.replace(/\/+$/, '')
  return {
    '/src/lib/supabase.ts': CLIENT_TS,
    '/src/lib/database.types.ts': generateTypes(opts.tables ?? []),
    '/src/hooks/useSession.ts': USE_SESSION_TS,
    '/src/hooks/useTable.ts': USE_TABLE_TS,
    '/src/components/AuthForm.tsx': AUTH_FORM_TSX,
    '/src/components/SetupNotice.tsx': SETUP_NOTICE_TSX,
    '/.env': `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${opts.key}\n`,
    '/.env.example': `VITE_SUPABASE_URL=${url || 'https://your-project.supabase.co'}\nVITE_SUPABASE_ANON_KEY=your-anon-key\n`,
    '/supabase/migrations/0001_init.sql': defaultMigration(opts.table ?? 'notes'),
  }
}
export { clientSnippetSafe }
