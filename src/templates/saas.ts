import { scaffoldFiles } from '@/core/vfs/scaffold'
import { LUCIDE, THEME_TOGGLE } from './shared'
import type { Template } from './types'

const APP = String.raw`import { Hero } from './components/Hero'
import { Features } from './components/Features'
import { Pricing } from './components/Pricing'
import { Faq } from './components/Faq'

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Hero />
      <Features />
      <Pricing />
      <Faq />
      <footer className="border-t border-line py-10 text-center text-sm text-muted">
        © {new Date().getFullYear()} Northwind Labs. Crafted with care.
      </footer>
    </div>
  )
}
`
const HERO = String.raw`import { ArrowRight, Sparkles } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

const links = ['Features', 'Pricing', 'FAQ']

export function Hero() {
  return (
    <header className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[420px] w-[720px] rounded-full bg-accent/20 blur-[120px]" />
      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="#" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg"><Sparkles size={15} /></span>
          Pulse
        </a>
        <div className="hidden items-center gap-8 text-sm text-muted md:flex">
          {links.map((l) => <a key={l} href={'#' + l.toLowerCase()} className="transition hover:text-fg">{l}</a>)}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="#pricing" className="rounded-theme bg-fg px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90">Start free</a>
        </div>
      </nav>
      <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> New — Realtime dashboards are live
        </span>
        <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          Know what your product is doing, <span className="text-muted">the moment it happens.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Pulse turns raw events into clear answers. Ship faster with analytics your whole team actually understands.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a href="#pricing" className="inline-flex items-center gap-2 rounded-theme bg-accent px-6 py-3 text-sm font-medium text-accent-fg transition hover:opacity-90">
            Get started <ArrowRight size={16} />
          </a>
          <a href="#features" className="rounded-theme border border-line px-6 py-3 text-sm font-medium transition hover:bg-surface">See how it works</a>
        </div>
        <p className="mt-6 text-xs text-muted">Trusted by 4,000+ product teams · No credit card required</p>
      </div>
    </header>
  )
}
`
const FEATURES = String.raw`import { BarChart3, Bell, Lock, Rocket, Users, Zap } from 'lucide-react'

const items = [
  { icon: Zap, title: 'Instant insights', body: 'Queries return in milliseconds, even across billions of events.' },
  { icon: BarChart3, title: 'Beautiful reports', body: 'Drag, drop and share dashboards that look great by default.' },
  { icon: Users, title: 'Team workspaces', body: 'Roles, comments and shared views keep everyone aligned.' },
  { icon: Bell, title: 'Smart alerts', body: 'Get pinged in Slack or email when a metric drifts from normal.' },
  { icon: Lock, title: 'Privacy first', body: 'EU hosting, SSO and fine-grained access controls built in.' },
  { icon: Rocket, title: 'Ship in minutes', body: 'One snippet, zero config. Start tracking before your coffee cools.' },
]

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Everything you need, nothing you don’t</h2>
        <p className="mt-3 text-muted">Focused tools that stay out of your way.</p>
      </div>
      <div className="mt-14 grid gap-px overflow-hidden rounded-theme border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="bg-bg p-7 transition hover:bg-surface">
            <div className="flex h-10 w-10 items-center justify-center rounded-theme border border-line bg-surface text-accent"><Icon size={18} /></div>
            <h3 className="mt-5 font-medium">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
`
const PRICING = String.raw`import { useState } from 'react'
import { Check } from 'lucide-react'

const plans = [
  { name: 'Starter', monthly: 0, desc: 'For side projects and experiments.', features: ['10k events / month', '1 project', '7-day retention'] },
  { name: 'Growth', monthly: 29, desc: 'For teams shipping every week.', features: ['1M events / month', 'Unlimited projects', '12-month retention', 'Slack alerts'], featured: true },
  { name: 'Scale', monthly: 99, desc: 'For organisations with serious data.', features: ['50M events / month', 'SSO & audit log', 'Unlimited retention', 'Priority support'] },
]

export function Pricing() {
  const [yearly, setYearly] = useState(true)
  return (
    <section id="pricing" className="border-y border-line bg-surface/50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Simple, honest pricing</h2>
          <div className="mt-6 inline-flex rounded-full border border-line bg-bg p-1 text-sm">
            {[false, true].map((y) => (
              <button key={String(y)} onClick={() => setYearly(y)} className={'rounded-full px-4 py-1.5 transition ' + (yearly === y ? 'bg-fg text-bg' : 'text-muted')}>
                {y ? 'Yearly · save 20%' : 'Monthly'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => {
            const price = Math.round(p.monthly * (yearly ? 0.8 : 1))
            return (
              <div key={p.name} className={'relative rounded-theme border p-8 ' + (p.featured ? 'border-accent bg-bg shadow-xl' : 'border-line bg-bg')}>
                {p.featured && <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-0.5 text-xs font-medium text-accent-fg">Most popular</span>}
                <h3 className="font-medium">{p.name}</h3>
                <p className="mt-1 text-sm text-muted">{p.desc}</p>
                <p className="mt-6 flex items-baseline gap-1"><span className="text-5xl font-semibold tracking-tight">{'$' + price}</span><span className="text-sm text-muted">/mo</span></p>
                <ul className="mt-6 space-y-3 text-sm">
                  {p.features.map((f) => <li key={f} className="flex items-center gap-2"><Check size={15} className="text-accent" />{f}</li>)}
                </ul>
                <button className={'mt-8 w-full rounded-theme py-2.5 text-sm font-medium transition ' + (p.featured ? 'bg-accent text-accent-fg hover:opacity-90' : 'border border-line hover:bg-surface')}>
                  {p.monthly === 0 ? 'Start for free' : 'Choose ' + p.name}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
`
const FAQ = String.raw`import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  { q: 'Can I try Pulse before paying?', a: 'Yes. The Starter plan is free forever and every paid plan includes a 14-day trial without a credit card.' },
  { q: 'How is my data stored?', a: 'Data is encrypted in transit and at rest, hosted in the EU or US region of your choice, and never sold.' },
  { q: 'Do you offer discounts for startups or non-profits?', a: 'We give 50% off for early-stage startups and registered non-profits. Reach out and we will set it up.' },
  { q: 'Can I export my data?', a: 'Anytime. Export raw events to CSV, Parquet or your own warehouse with one click.' },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Questions, answered</h2>
      <div className="mt-10 divide-y divide-line rounded-theme border border-line">
        {faqs.map((f, i) => (
          <div key={f.q}>
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-medium" aria-expanded={open === i}>
              {f.q}
              <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (open === i ? 'rotate-180' : '')} />
            </button>
            {open === i && <p className="px-6 pb-5 text-sm leading-relaxed text-muted">{f.a}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
`
export const saas: Template = {
  id: 'saas', name: 'SaaS Landing Page', description: 'Hero, features, pricing toggle, FAQ and dark mode.', icon: 'layout', tags: ['marketing', 'landing'],
  files: {
    ...scaffoldFiles('SaaS Landing Page', LUCIDE),
    '/src/App.tsx': APP, '/src/components/Hero.tsx': HERO, '/src/components/Features.tsx': FEATURES, '/src/components/Pricing.tsx': PRICING,
    '/src/components/Faq.tsx': FAQ, '/src/components/ThemeToggle.tsx': THEME_TOGGLE,
  },
}
