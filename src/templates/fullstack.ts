import { scaffoldFiles } from '@/core/vfs/scaffold'
import { fullstackScaffold } from '@/services/supabase/scaffold'
import type { Template } from './types'

const APP = String.raw`import { LogOut, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { useSession } from '@/hooks/useSession'
import { useTable } from '@/hooks/useTable'
import { AuthForm } from '@/components/AuthForm'
import { SetupNotice } from '@/components/SetupNotice'

type Note = { id: string; title: string; done: boolean }

function Notes() {
  const { rows, loading, error, insert, update, remove } = useTable<Note>('notes')
  const [title, setTitle] = useState('')
  return (
    <div className="mx-auto max-w-xl space-y-4 p-6">
      <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) { void insert({ title: title.trim() }); setTitle('') } }} className="flex gap-2">
        <input className="h-11 flex-1 rounded-xl border border-line bg-surface px-3" placeholder="Add a note…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg" aria-label="Add"><Plus size={18} /></button>
      </form>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-muted">Loading…</p>}
      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={n.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <input type="checkbox" checked={n.done} onChange={(e) => void update(n.id, { done: e.target.checked })} />
            <span className={n.done ? 'flex-1 text-muted line-through' : 'flex-1'}>{n.title}</span>
            <button onClick={() => void remove(n.id)} aria-label="Delete" className="text-muted hover:text-red-500"><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function App() {
  const session = useSession()
  if (!isSupabaseConfigured) return <div className="min-h-screen bg-bg text-fg"><SetupNotice /></div>
  if (session === undefined) return <div className="min-h-screen bg-bg" />
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="flex items-center justify-between border-b border-line px-6 py-4"><b>Live Notes</b>{session && <button onClick={() => void supabase.auth.signOut()} className="flex items-center gap-1 text-sm text-muted"><LogOut size={14} />Sign out</button>}</header>
      {session ? <Notes /> : <AuthForm />}
    </div>
  )
}
`
export const fullstack: Template = {
  id: 'fullstack', name: 'Full-stack: Auth + DB + Realtime', description: 'Supabase auth, CRUD and live Realtime notes — connect a project and it just works.', icon: 'database', tags: ['supabase', 'auth', 'database'],
  files: {
    ...scaffoldFiles('Live Notes', { '@supabase/supabase-js': '^2.45.0', 'lucide-react': '^0.468.0' }),
    ...fullstackScaffold({ url: '', key: '' }),
    '/src/App.tsx': APP,
  },
}
