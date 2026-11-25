import { scaffoldFiles } from '@/core/vfs/scaffold'
import { LUCIDE, THEME_TOGGLE } from './shared'
import type { Template } from './types'

const AI = String.raw`/**
 * Replace streamReply() with a real provider call (OpenAI-compatible, Anthropic, …).
 * The UI only depends on this async generator, so swapping the backend is a one-file change.
 * Never ship API keys in client code — proxy requests through your own server for production.
 */
const canned: Array<{ match: RegExp; text: string }> = [
  { match: /(hello|hi|hey)\b/i, text: 'Hi there! I’m **Orbit**, a demo assistant running entirely in your browser. Ask me about *planning a trip*, *writing code* or *summarising ideas* — or wire me up to a real model in src/lib/ai.ts.' },
  { match: /(code|function|react|typescript|bug)/i, text: 'Here’s a tiny debounce hook to get you started:\n\n' + '' + '    function useDebounce<T>(value: T, ms = 300) {\n      const [v, setV] = useState(value)\n      useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])\n      return v\n    }\n\nWant me to add tests or a cancel option?' },
  { match: /(trip|travel|plan)/i, text: 'A relaxed 3-day plan:\n\n- **Day 1** — Old town walk, local market lunch, sunset viewpoint\n- **Day 2** — Morning hike, museum in the afternoon, long dinner\n- **Day 3** — Slow breakfast, day trip to the coast\n\nTell me your budget and I will tighten it up.' },
]

export async function* streamReply(prompt: string, signal: AbortSignal): AsyncGenerator<string> {
  const hit = canned.find((c) => c.match.test(prompt))
  const text = hit ? hit.text : 'Good question. In a real deployment this answer would come from your model of choice. For now, try asking about **code**, a **trip** or just say **hello**.'
  const words = text.split(/(\s+)/)
  for (const w of words) {
    if (signal.aborted) return
    await new Promise((r) => setTimeout(r, 22))
    yield w
  }
}
`
const APP = String.raw`import { useEffect, useRef, useState } from 'react'
import { Bot, Copy, MessageSquare, PanelLeft, Plus, RefreshCw, Send, Square, Trash2, User } from 'lucide-react'
import { streamReply } from './lib/ai'
import { ThemeToggle } from './components/ThemeToggle'

interface Msg { id: string; role: 'user' | 'assistant'; text: string }
interface Chat { id: string; title: string; messages: Msg[] }
const KEY = 'ai-chat-v1'
const uid = () => Math.random().toString(36).slice(2, 9)
const fresh = (): Chat => ({ id: uid(), title: 'New chat', messages: [] })

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  const blocks = text.split('\n\n')
  void parts
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) =>
        /^( {4}|\t)/.test(b) ? (
          <pre key={i} className="overflow-auto rounded-theme border border-line bg-bg p-3 font-mono text-xs">{b.replace(/^ {4}/gm, '')}</pre>
        ) : /^- /.test(b) ? (
          <ul key={i} className="list-disc space-y-1 pl-5">{b.split('\n').map((l, j) => <li key={j}><Inline s={l.replace(/^- /, '')} /></li>)}</ul>
        ) : (
          <p key={i}><Inline s={b} /></p>
        ),
      )}
    </div>
  )
}

function Inline({ s }: { s: string }) {
  return (
    <>
      {s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) =>
        p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('*') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : <span key={i}>{p}</span>,
      )}
    </>
  )
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Chat[] | null; if (v && v.length) return v } catch { /* ignore */ }
    return [fresh()]
  })
  const [activeId, setActiveId] = useState(chats[0].id)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [sidebar, setSidebar] = useState(true)
  const abort = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const chat = chats.find((c) => c.id === activeId) ?? chats[0]

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(chats)) }, [chats])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.messages])

  const patch = (id: string, fn: (c: Chat) => Chat) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)))

  async function run(id: string, prompt: string) {
    const reply: Msg = { id: uid(), role: 'assistant', text: '' }
    patch(id, (c) => ({ ...c, messages: [...c.messages, reply] }))
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    try {
      for await (const tok of streamReply(prompt, ctl.signal)) {
        patch(id, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === reply.id ? { ...m, text: m.text + tok } : m)) }))
      }
    } finally { setBusy(false) }
  }

  function send(text = input) {
    const t = text.trim()
    if (!t || busy) return
    setInput('')
    patch(chat.id, (c) => ({ ...c, title: c.messages.length ? c.title : t.slice(0, 32), messages: [...c.messages, { id: uid(), role: 'user', text: t }] }))
    void run(chat.id, t)
  }

  function regenerate() {
    const last = [...chat.messages].reverse().find((m) => m.role === 'user')
    if (!last || busy) return
    patch(chat.id, (c) => ({ ...c, messages: c.messages.slice(0, c.messages.length - 1) }))
    void run(chat.id, last.text)
  }

  const suggestions = ['Say hello', 'Plan a 3-day trip', 'Write a React debounce hook']

  return (
    <div className="flex h-screen bg-bg text-fg">
      <aside className={(sidebar ? 'flex' : 'hidden') + ' w-72 shrink-0 flex-col border-r border-line bg-surface/60 p-3'}>
        <button onClick={() => { const c = fresh(); setChats([c, ...chats]); setActiveId(c.id) }} className="mb-3 flex items-center justify-center gap-2 rounded-theme bg-fg py-2.5 text-sm font-medium text-bg"><Plus size={15} />New chat</button>
        <div className="flex-1 space-y-1 overflow-auto">
          {chats.map((c) => (
            <div key={c.id} className={'group flex items-center gap-2 rounded-theme px-3 py-2 text-sm ' + (c.id === chat.id ? 'bg-bg shadow-sm' : 'text-muted hover:text-fg')}>
              <button onClick={() => setActiveId(c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><MessageSquare size={14} className="shrink-0" /><span className="truncate">{c.title}</span></button>
              <button aria-label="Delete chat" onClick={() => { const rest = chats.filter((x) => x.id !== c.id); const next = rest.length ? rest : [fresh()]; setChats(next); if (c.id === chat.id) setActiveId(next[0].id) }} className="opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <button onClick={() => setSidebar(!sidebar)} aria-label="Toggle sidebar" className="rounded-lg p-2 text-muted hover:text-fg"><PanelLeft size={18} /></button>
          <span className="text-sm font-medium">Orbit <span className="text-muted">· demo model</span></span>
          <ThemeToggle />
        </header>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl space-y-7 px-4 py-8">
            {chat.messages.length === 0 && (
              <div className="pt-16 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-fg"><Bot size={22} /></div>
                <h1 className="text-2xl font-semibold tracking-tight">How can I help today?</h1>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:text-fg">{s}</button>)}
                </div>
              </div>
            )}
            {chat.messages.map((m, i) => (
              <div key={m.id} className="flex gap-4">
                <div className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' + (m.role === 'user' ? 'bg-subtle border border-line' : 'bg-accent text-accent-fg')}>{m.role === 'user' ? <User size={15} /> : <Bot size={15} />}</div>
                <div className="min-w-0 flex-1 pt-1">
                  {m.role === 'user' ? <p className="whitespace-pre-wrap text-[15px]">{m.text}</p> : <Rich text={m.text || '…'} />}
                  {m.role === 'assistant' && !busy && m.text && (
                    <div className="mt-2 flex gap-1 text-muted">
                      <button aria-label="Copy" onClick={() => void navigator.clipboard?.writeText(m.text)} className="rounded p-1.5 hover:text-fg"><Copy size={14} /></button>
                      {i === chat.messages.length - 1 && <button aria-label="Regenerate" onClick={regenerate} className="rounded p-1.5 hover:text-fg"><RefreshCw size={14} /></button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
        </div>

        <div className="shrink-0 px-4 pb-5">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-accent">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} rows={1} placeholder="Message Orbit…" aria-label="Message" className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] outline-none" />
            {busy ? (
              <button onClick={() => abort.current?.abort()} aria-label="Stop" className="flex h-10 w-10 items-center justify-center rounded-xl bg-fg text-bg"><Square size={14} fill="currentColor" /></button>
            ) : (
              <button onClick={() => send()} disabled={!input.trim()} aria-label="Send" className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-fg disabled:opacity-40"><Send size={16} /></button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
`
export const aichat: Template = {
  id: 'aichat', name: 'AI Chat App', description: 'Streaming chat UI with history, regenerate and a swappable model layer.', icon: 'bot', tags: ['ai', 'app'],
  files: { ...scaffoldFiles('AI Chat App', LUCIDE), '/src/App.tsx': APP, '/src/lib/ai.ts': AI, '/src/components/ThemeToggle.tsx': THEME_TOGGLE },
}
