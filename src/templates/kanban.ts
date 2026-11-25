import { scaffoldFiles } from '@/core/vfs/scaffold'
import { LUCIDE, THEME_TOGGLE } from './shared'
import type { Template } from './types'

const TYPES = String.raw`export type ColumnId = 'backlog' | 'doing' | 'review' | 'done'
export type Priority = 'low' | 'medium' | 'high'
export interface Task { id: string; title: string; notes: string; priority: Priority; due: string; column: ColumnId }

export const columns: { id: ColumnId; title: string; limit?: number }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'doing', title: 'In progress', limit: 3 },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
]

export const seed: Task[] = [
  { id: 't1', title: 'Design onboarding flow', notes: 'Three screens, skip option on each.', priority: 'high', due: '', column: 'doing' },
  { id: 't2', title: 'Set up analytics events', notes: 'Sign-up, first project, invite.', priority: 'medium', due: '', column: 'backlog' },
  { id: 't3', title: 'Write launch announcement', notes: '', priority: 'low', due: '', column: 'backlog' },
  { id: 't4', title: 'Fix avatar upload on Safari', notes: 'Blob URL revoked too early.', priority: 'high', due: '', column: 'review' },
  { id: 't5', title: 'Pricing page copy', notes: '', priority: 'medium', due: '', column: 'done' },
]
`
const STORE = String.raw`import { useEffect, useReducer } from 'react'
import { seed, type ColumnId, type Priority, type Task } from './types'

type Action =
  | { type: 'add'; task: Task }
  | { type: 'update'; id: string; patch: Partial<Omit<Task, 'id'>> }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; column: ColumnId; beforeId?: string }

function reducer(state: Task[], a: Action): Task[] {
  switch (a.type) {
    case 'add': return [...state, a.task]
    case 'update': return state.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t))
    case 'remove': return state.filter((t) => t.id !== a.id)
    case 'move': {
      const task = state.find((t) => t.id === a.id)
      if (!task) return state
      const rest = state.filter((t) => t.id !== a.id)
      const moved = { ...task, column: a.column }
      const idx = a.beforeId ? rest.findIndex((t) => t.id === a.beforeId) : -1
      if (idx < 0) return [...rest, moved]
      return [...rest.slice(0, idx), moved, ...rest.slice(idx)]
    }
  }
}

const KEY = 'kanban-v1'
export function useBoard() {
  const [tasks, dispatch] = useReducer(reducer, seed, (init): Task[] => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Task[] | null; if (Array.isArray(v)) return v } catch { /* ignore */ }
    return init
  })
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(tasks)) }, [tasks])
  return { tasks, dispatch }
}

export const priorityStyle: Record<Priority, string> = { low: 'bg-line text-muted', medium: 'bg-warn/15 text-warn', high: 'bg-danger/15 text-danger' }
export const newId = () => 't' + Math.random().toString(36).slice(2, 8)
`
const DIALOG = String.raw`import { useState } from 'react'
import { X } from 'lucide-react'
import { newId } from '../store'
import type { ColumnId, Priority, Task } from '../types'

export function TaskDialog({ task, column, onSave, onDelete, onClose }: { task?: Task; column: ColumnId; onSave: (t: Task) => void; onDelete?: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [due, setDue] = useState(task?.due ?? '')
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form
        className="relative w-full max-w-md space-y-4 rounded-theme border border-line bg-bg p-6 shadow-2xl"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave({ id: task?.id ?? newId(), title: title.trim(), notes, priority, due, column: task?.column ?? column }) }}
      >
        <div className="flex items-center justify-between"><h2 className="font-semibold">{task ? 'Edit task' : 'New task'}</h2><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" aria-label="Title" className="h-11 w-full rounded-theme border border-line bg-surface px-3 outline-none focus:border-accent" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Notes" rows={3} className="w-full rounded-theme border border-line bg-surface p-3 outline-none focus:border-accent" />
        <div className="grid grid-cols-2 gap-3">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Priority" className="h-10 rounded-theme border border-line bg-surface px-3 outline-none"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="h-10 rounded-theme border border-line bg-surface px-3 outline-none" />
        </div>
        <div className="flex justify-between">
          {onDelete ? <button type="button" onClick={onDelete} className="text-sm text-danger">Delete</button> : <span />}
          <button disabled={!title.trim()} className="rounded-theme bg-accent px-5 py-2 text-sm font-medium text-accent-fg disabled:opacity-40">Save</button>
        </div>
      </form>
    </div>
  )
}
`
const APP = String.raw`import { useMemo, useState } from 'react'
import { Calendar, Plus, Search } from 'lucide-react'
import { useBoard, priorityStyle } from './store'
import { columns, type ColumnId, type Task } from './types'
import { TaskDialog } from './components/TaskDialog'
import { ThemeToggle } from './components/ThemeToggle'

export default function App() {
  const { tasks, dispatch } = useBoard()
  const [q, setQ] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<ColumnId | null>(null)
  const [dialog, setDialog] = useState<{ task?: Task; column: ColumnId } | null>(null)
  const visible = useMemo(() => tasks.filter((t) => (t.title + t.notes).toLowerCase().includes(q.toLowerCase())), [tasks, q])
  const done = tasks.filter((t) => t.column === 'done').length

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div><h1 className="text-lg font-semibold tracking-tight">Launch board</h1><p className="text-xs text-muted">{done} of {tasks.length} tasks done</p></div>
        <div className="flex items-center gap-2">
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks" aria-label="Filter tasks" className="h-9 w-44 rounded-theme border border-line bg-surface pl-8 pr-3 text-sm outline-none focus:border-accent" /></div>
          <ThemeToggle />
          <button onClick={() => setDialog({ column: 'backlog' })} className="flex h-9 items-center gap-1.5 rounded-theme bg-accent px-3.5 text-sm font-medium text-accent-fg"><Plus size={15} />Task</button>
        </div>
      </header>
      <div className="h-1 bg-line"><div className="h-full bg-accent transition-all" style={{ width: (tasks.length ? (done / tasks.length) * 100 : 0) + '%' }} /></div>

      <main className="flex flex-1 gap-4 overflow-x-auto p-6">
        {columns.map((col) => {
          const items = visible.filter((t) => t.column === col.id)
          const total = tasks.filter((t) => t.column === col.id).length
          const overLimit = col.limit !== undefined && total > col.limit
          return (
            <section
              key={col.id}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id) }}
              onDragLeave={() => setOver(null)}
              onDrop={() => { if (dragId) dispatch({ type: 'move', id: dragId, column: col.id }); setDragId(null); setOver(null) }}
              className={'flex w-72 shrink-0 flex-col rounded-theme border bg-surface/60 p-3 transition ' + (over === col.id ? 'border-accent' : 'border-line')}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-medium">{col.title} <span className={'ml-1 text-xs ' + (overLimit ? 'text-danger' : 'text-muted')}>{total}{col.limit ? '/' + col.limit : ''}</span></h2>
                <button onClick={() => setDialog({ column: col.id })} aria-label={'Add to ' + col.title} className="rounded p-1 text-muted hover:text-fg"><Plus size={15} /></button>
              </div>
              <div className="flex-1 space-y-2">
                {items.map((t) => (
                  <article
                    key={t.id}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOver(null) }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.stopPropagation(); if (dragId && dragId !== t.id) dispatch({ type: 'move', id: dragId, column: col.id, beforeId: t.id }); setDragId(null); setOver(null) }}
                    onClick={() => setDialog({ task: t, column: t.column })}
                    className={'cursor-grab rounded-theme border border-line bg-bg p-3 shadow-sm transition hover:border-line active:cursor-grabbing ' + (dragId === t.id ? 'opacity-40' : '')}
                  >
                    <p className="text-sm font-medium">{t.title}</p>
                    {t.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{t.notes}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <span className={'rounded-full px-2 py-0.5 text-[11px] ' + priorityStyle[t.priority]}>{t.priority}</span>
                      {t.due && <span className="flex items-center gap-1 text-[11px] text-muted"><Calendar size={11} />{t.due}</span>}
                    </div>
                  </article>
                ))}
                {items.length === 0 && <p className="rounded-theme border border-dashed border-line py-6 text-center text-xs text-muted">Drop tasks here</p>}
              </div>
            </section>
          )
        })}
      </main>

      {dialog && (
        <TaskDialog
          task={dialog.task}
          column={dialog.column}
          onClose={() => setDialog(null)}
          onSave={(t) => { dispatch(dialog.task ? { type: 'update', id: t.id, patch: t } : { type: 'add', task: t }); setDialog(null) }}
          onDelete={dialog.task ? () => { dispatch({ type: 'remove', id: dialog.task!.id }); setDialog(null) } : undefined}
        />
      )}
    </div>
  )
}
`
export const kanban: Template = {
  id: 'kanban', name: 'Kanban Board', description: 'Drag-and-drop tasks, WIP limits, filters and persistence.', icon: 'kanban', tags: ['productivity', 'app'],
  files: { ...scaffoldFiles('Kanban Board', LUCIDE), '/src/App.tsx': APP, '/src/types.ts': TYPES, '/src/store.ts': STORE, '/src/components/TaskDialog.tsx': DIALOG, '/src/components/ThemeToggle.tsx': THEME_TOGGLE },
}
