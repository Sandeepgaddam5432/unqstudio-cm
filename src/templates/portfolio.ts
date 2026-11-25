import { scaffoldFiles } from '@/core/vfs/scaffold'
import { LUCIDE, THEME_TOGGLE } from './shared'
import type { Template } from './types'

const DATA = String.raw`export interface Project { title: string; blurb: string; year: string; tags: string[]; hue: number }

export const projects: Project[] = [
  { title: 'Lumen', blurb: 'A calm, keyboard-first note app with local-first sync.', year: '2025', tags: ['Product', 'Web'], hue: 28 },
  { title: 'Atlas Type', blurb: 'A variable sans-serif family with 9 weights and optical sizes.', year: '2024', tags: ['Brand', 'Typography'], hue: 210 },
  { title: 'Fieldnotes', blurb: 'Research toolkit for capturing and tagging interviews.', year: '2024', tags: ['Product', 'Research'], hue: 150 },
  { title: 'Orbit Bank', blurb: 'Mobile banking redesign focused on clarity at a glance.', year: '2023', tags: ['Web', 'Product'], hue: 265 },
  { title: 'Harbor', blurb: 'Identity and packaging for a small-batch coffee roaster.', year: '2023', tags: ['Brand'], hue: 12 },
  { title: 'Signal', blurb: 'Open-source design tokens pipeline used by 40 teams.', year: '2022', tags: ['Web', 'Typography'], hue: 190 },
]

export const experience = [
  { role: 'Lead Product Designer', org: 'Northwind', years: '2022 — Now', note: 'Leading a team of five across web and mobile.' },
  { role: 'Senior Designer', org: 'Studio Parallel', years: '2019 — 2022', note: 'Brand systems and product work for 20+ clients.' },
  { role: 'Designer', org: 'Kite & Co.', years: '2016 — 2019', note: 'First design hire; built the design practice.' },
]
`
const APP = String.raw`import { useMemo, useState } from 'react'
import { ArrowUpRight, Mail } from 'lucide-react'
import { experience, projects } from './data'
import { ThemeToggle } from './components/ThemeToggle'

const allTags = ['All', ...Array.from(new Set(projects.flatMap((p) => p.tags)))]

export default function App() {
  const [tag, setTag] = useState('All')
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [sent, setSent] = useState(false)
  const shown = useMemo(() => projects.filter((p) => tag === 'All' || p.tags.includes(tag)), [tag])
  const valid = form.name.trim() && /^\S+@\S+\.\S+$/.test(form.email) && form.message.trim().length > 9

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <a href="#" className="font-semibold tracking-tight">Maya Okafor</a>
        <nav className="flex items-center gap-6 text-sm text-muted">
          <a href="#work" className="hidden transition hover:text-fg sm:block">Work</a>
          <a href="#about" className="hidden transition hover:text-fg sm:block">About</a>
          <a href="#contact" className="transition hover:text-fg">Contact</a>
          <ThemeToggle />
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-20 md:py-28">
          <p className="mb-5 text-sm text-muted">Product designer · Lagos / Berlin</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            I design quiet, useful software people <span className="text-accent">love to open.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">Eight years turning messy problems into clear interfaces — for startups and teams who sweat the details.</p>
        </section>

        <section id="work" className="py-10">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Selected work</h2>
            <div className="flex flex-wrap gap-2">
              {allTags.map((t) => (
                <button key={t} onClick={() => setTag(t)} className={'rounded-full border px-3.5 py-1 text-xs transition ' + (tag === t ? 'border-fg bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {shown.map((p) => (
              <article key={p.title} className="group cursor-pointer">
                <div className="relative aspect-[4/3] overflow-hidden rounded-theme border border-line" style={{ background: 'linear-gradient(135deg, hsl(' + p.hue + ' 80% 60% / .9), hsl(' + ((p.hue + 50) % 360) + ' 70% 40% / .9))' }}>
                  <span className="absolute bottom-4 left-5 text-4xl font-semibold tracking-tight text-white/90">{p.title}</span>
                  <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black opacity-0 transition group-hover:opacity-100"><ArrowUpRight size={16} /></span>
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div><h3 className="font-medium">{p.title}</h3><p className="mt-1 text-sm text-muted">{p.blurb}</p></div>
                  <span className="shrink-0 text-xs text-muted">{p.year}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="about" className="grid gap-10 py-24 md:grid-cols-[1fr_1.4fr]">
          <h2 className="text-2xl font-semibold tracking-tight">Experience</h2>
          <ol className="space-y-8 border-l border-line pl-6">
            {experience.map((e) => (
              <li key={e.role} className="relative">
                <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                <p className="text-xs text-muted">{e.years}</p>
                <p className="mt-1 font-medium">{e.role} <span className="text-muted">· {e.org}</span></p>
                <p className="mt-1 text-sm text-muted">{e.note}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="contact" className="pb-24">
          <div className="rounded-theme border border-line bg-surface p-8 md:p-12">
            <h2 className="text-3xl font-semibold tracking-tight">Let’s work together</h2>
            <p className="mt-2 text-muted">Tell me about your project — I reply within two days.</p>
            {sent ? (
              <p className="mt-8 rounded-theme bg-success/10 p-4 text-success">Thanks {form.name.split(' ')[0]}! Your message is ready — in a real app this would hit your backend or email service.</p>
            ) : (
              <form className="mt-8 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (valid) setSent(true) }}>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" aria-label="Name" className="h-11 rounded-theme border border-line bg-bg px-4 outline-none focus:border-accent" />
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" aria-label="Email" className="h-11 rounded-theme border border-line bg-bg px-4 outline-none focus:border-accent" />
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What are you building?" aria-label="Message" rows={4} className="rounded-theme border border-line bg-bg p-4 outline-none focus:border-accent md:col-span-2" />
                <button disabled={!valid} className="inline-flex h-11 items-center justify-center gap-2 rounded-theme bg-accent px-6 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40 md:col-span-2 md:w-fit"><Mail size={16} />Send message</button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
`
export const portfolio: Template = {
  id: 'portfolio', name: 'Designer Portfolio', description: 'Filterable case studies, timeline and a validated contact form.', icon: 'user', tags: ['personal', 'portfolio'],
  files: { ...scaffoldFiles('Designer Portfolio', LUCIDE), '/src/App.tsx': APP, '/src/data.ts': DATA, '/src/components/ThemeToggle.tsx': THEME_TOGGLE },
}
