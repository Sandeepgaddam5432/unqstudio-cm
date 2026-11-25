import { scaffoldFiles } from '@/core/vfs/scaffold'
import { LUCIDE, THEME_TOGGLE } from './shared'
import type { Template } from './types'

const CONTENT = String.raw`export interface Post { slug: string; title: string; date: string; tags: string[]; minutes: number; excerpt: string; body: string }
export interface Doc { slug: string; title: string; section: string; body: string }

export const posts: Post[] = [
  {
    slug: 'designing-for-calm', title: 'Designing for calm', date: '2025-09-12', tags: ['Design', 'Craft'], minutes: 5,
    excerpt: 'Why the best interfaces feel quiet — and the small decisions that get you there.',
    body: '## Less, but better\n\nCalm interfaces are not empty ones. They are **deliberate**: every element earns its place.\n\n- Reduce choices at the moment of action\n- Prefer one strong accent over many weak ones\n- Let whitespace do the grouping\n\n## A small rule\n\nIf you cannot explain why an element exists in one sentence, it probably should not.\n\n    const calm = elements.filter((e) => e.earnsItsPlace)\n\nStart there and iterate.',
  },
  {
    slug: 'notes-on-typography', title: 'Notes on typography for screens', date: '2025-07-02', tags: ['Typography'], minutes: 4,
    excerpt: 'A practical scale, line lengths that read well, and when to break the rules.',
    body: '## Pick a scale\n\nUse a ratio like 1.25 and stick to it. Consistency beats cleverness.\n\n## Measure\n\nAim for 60–75 characters per line for body copy. Narrower for captions, wider for code.\n\n- Body: 16–18px\n- Line height: 1.5–1.7\n- Headings: tighter tracking, heavier weight',
  },
  {
    slug: 'shipping-small', title: 'The case for shipping small', date: '2025-04-20', tags: ['Process'], minutes: 3,
    excerpt: 'Smaller releases reduce risk, speed up learning and keep teams motivated.',
    body: '## Why small wins\n\nSmall changes are easier to review, easier to revert and easier to understand.\n\n- Smaller diffs → faster reviews\n- Faster feedback → better decisions\n- Frequent releases → calmer launches',
  },
]

export const docs: Doc[] = [
  { slug: 'introduction', title: 'Introduction', section: 'Getting started', body: '## Welcome\n\nThis documentation shows how to structure a **docs site** with sections, a sidebar and an on-page table of contents.\n\n## What you get\n\n- Hash-based routing (works on any static host)\n- Markdown-ish rendering\n- Full-text search' },
  { slug: 'installation', title: 'Installation', section: 'Getting started', body: '## Requirements\n\nNode 20 or newer.\n\n## Install\n\n    npm install\n    npm run dev\n\n## Build\n\nRun the build command and deploy the output folder to any static host.' },
  { slug: 'configuration', title: 'Configuration', section: 'Guides', body: '## Theme\n\nTokens live in **src/index.css** as CSS variables. Change them in the Theme Studio or edit the file.\n\n## Content\n\nEdit **src/content.ts** to add posts and documentation pages.\n\n- Posts support tags and reading time\n- Docs are grouped by section' },
  { slug: 'deploying', title: 'Deploying', section: 'Guides', body: '## Static hosting\n\nThe site is fully static. Cloudflare Pages, Netlify, Vercel and GitHub Pages all work out of the box.\n\n## Custom domains\n\nPoint your DNS at the provider and add the domain in their dashboard.' },
]
`
const MD = String.raw`import type { ReactNode } from 'react'

export function slugifyHeading(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function headings(md: string) {
  return md.split('\n').filter((l) => l.startsWith('## ')).map((l) => ({ text: l.slice(3), id: slugifyHeading(l.slice(3)) }))
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.split('\n\n')
  return (
    <div className="space-y-5 text-[17px] leading-8">
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) return <h2 key={i} id={slugifyHeading(b.slice(3))} className="scroll-mt-24 pt-4 text-2xl font-semibold tracking-tight">{b.slice(3)}</h2>
        if (b.startsWith('    ')) return <pre key={i} className="overflow-auto rounded-theme border border-line bg-surface p-4 font-mono text-sm leading-6">{b.replace(/^ {4}/gm, '')}</pre>
        if (b.startsWith('- ')) return <ul key={i} className="list-disc space-y-1 pl-6">{b.split('\n').map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>
        return <p key={i}>{inline(b)}</p>
      })}
    </div>
  )
}
`
const ROUTER = String.raw`import { useEffect, useState } from 'react'

export function useHashRoute(): [string, (to: string) => void] {
  const read = () => location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const h = () => { setRoute(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return [route, (to) => { location.hash = to }]
}
`
const APP = String.raw`import { useMemo, useState } from 'react'
import { BookOpen, Clock, Search } from 'lucide-react'
import { docs, posts } from './content'
import { Markdown, headings } from './Markdown'
import { useHashRoute } from './router'
import { ThemeToggle } from './components/ThemeToggle'

const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

function Blog({ go }: { go: (to: string) => void }) {
  const [tag, setTag] = useState('All')
  const tags = ['All', ...Array.from(new Set(posts.flatMap((p) => p.tags)))]
  const list = posts.filter((p) => tag === 'All' || p.tags.includes(tag))
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-5xl font-semibold tracking-tight">Writing</h1>
      <p className="mt-3 text-lg text-muted">Essays on design, craft and shipping software.</p>
      <div className="mt-8 flex flex-wrap gap-2">{tags.map((t) => <button key={t} onClick={() => setTag(t)} className={'rounded-full border px-3.5 py-1 text-xs transition ' + (tag === t ? 'border-fg bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>{t}</button>)}</div>
      <div className="mt-10 divide-y divide-line">
        {list.map((p) => (
          <article key={p.slug} onClick={() => go('/post/' + p.slug)} className="group cursor-pointer py-8">
            <p className="flex items-center gap-3 text-xs text-muted">{fmt(p.date)}<span className="flex items-center gap-1"><Clock size={11} />{p.minutes} min</span></p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight transition group-hover:text-accent">{p.title}</h2>
            <p className="mt-2 text-muted">{p.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function Post({ slug, go }: { slug: string; go: (to: string) => void }) {
  const p = posts.find((x) => x.slug === slug)
  if (!p) return <div className="p-20 text-center text-muted">Post not found. <button className="text-accent" onClick={() => go('/')}>Back to writing</button></div>
  return (
    <article className="mx-auto max-w-2xl px-6 py-14">
      <button onClick={() => go('/')} className="text-sm text-muted hover:text-fg">← All posts</button>
      <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">{p.title}</h1>
      <p className="mt-4 text-sm text-muted">{fmt(p.date)} · {p.minutes} min read · {p.tags.join(', ')}</p>
      <div className="mt-10"><Markdown source={p.body} /></div>
    </article>
  )
}

function Docs({ slug, go }: { slug: string; go: (to: string) => void }) {
  const [q, setQ] = useState('')
  const current = docs.find((d) => d.slug === slug) ?? docs[0]
  const results = useMemo(() => (q ? docs.filter((d) => (d.title + d.body).toLowerCase().includes(q.toLowerCase())) : docs), [q])
  const sections = Array.from(new Set(results.map((d) => d.section)))
  const toc = headings(current.body)
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 md:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_180px]">
      <aside className="md:sticky md:top-20 md:self-start">
        <div className="relative mb-5"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs" aria-label="Search docs" className="h-9 w-full rounded-theme border border-line bg-surface pl-8 pr-3 text-sm outline-none focus:border-accent" /></div>
        {sections.map((s) => (
          <div key={s} className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{s}</p>
            {results.filter((d) => d.section === s).map((d) => <button key={d.slug} onClick={() => go('/docs/' + d.slug)} className={'block w-full rounded-lg px-3 py-1.5 text-left text-sm transition ' + (d.slug === current.slug ? 'bg-surface font-medium' : 'text-muted hover:text-fg')}>{d.title}</button>)}
          </div>
        ))}
        {results.length === 0 && <p className="text-sm text-muted">No results.</p>}
      </aside>
      <article className="min-w-0"><p className="text-sm text-accent">{current.section}</p><h1 className="mb-6 mt-1 text-4xl font-semibold tracking-tight">{current.title}</h1><Markdown source={current.body} /></article>
      <nav className="hidden xl:block xl:sticky xl:top-20 xl:self-start"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">On this page</p>{toc.map((h) => <a key={h.id} href={'#/docs/' + current.slug} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' }) }} className="block py-1 text-sm text-muted transition hover:text-fg">{h.text}</a>)}</nav>
    </div>
  )
}

export default function App() {
  const [route, go] = useHashRoute()
  const [, kind, slug] = route.split('/')
  const section = kind === 'docs' ? 'docs' : 'blog'
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <button onClick={() => go('/')} className="flex items-center gap-2 font-semibold tracking-tight"><BookOpen size={17} className="text-accent" />Folio</button>
          <nav className="flex items-center gap-1 text-sm">
            {(['blog', 'docs'] as const).map((s) => <button key={s} onClick={() => go(s === 'blog' ? '/' : '/docs/introduction')} className={'rounded-lg px-3 py-1.5 capitalize transition ' + (section === s ? 'bg-surface font-medium' : 'text-muted hover:text-fg')}>{s}</button>)}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      {kind === 'post' && slug ? <Post slug={slug} go={go} /> : kind === 'docs' ? <Docs slug={slug ?? 'introduction'} go={go} /> : <Blog go={go} />}
    </div>
  )
}
`
export const blog: Template = {
  id: 'blog', name: 'Editorial Blog & Docs', description: 'Blog index, post pages, docs with sidebar, search and ToC.', icon: 'book', tags: ['content', 'docs'],
  files: { ...scaffoldFiles('Editorial Blog & Docs', LUCIDE), '/src/App.tsx': APP, '/src/content.ts': CONTENT, '/src/Markdown.tsx': MD, '/src/router.ts': ROUTER, '/src/components/ThemeToggle.tsx': THEME_TOGGLE },
}
