import { scaffoldFiles } from '@/core/vfs/scaffold'
import { LUCIDE, THEME_TOGGLE } from './shared'
import type { Template } from './types'

const DATA = String.raw`export type Range = 7 | 30 | 90

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

export function revenueSeries(range: Range): number[] {
  const r = rng(range * 97)
  let v = 4200
  return Array.from({ length: range }, (_, i) => {
    v += (r() - 0.42) * 420 + Math.sin(i / 3) * 90
    return Math.max(1200, Math.round(v))
  })
}

export const channels = [
  { name: 'Direct', value: 38 },
  { name: 'Search', value: 27 },
  { name: 'Social', value: 21 },
  { name: 'Referral', value: 14 },
]

export const regions = [
  { name: 'North America', value: 48200 },
  { name: 'Europe', value: 36400 },
  { name: 'Asia Pacific', value: 28900 },
  { name: 'Latin America', value: 12100 },
  { name: 'Africa', value: 6400 },
]

export interface Order { id: string; customer: string; plan: string; amount: number; status: 'Paid' | 'Pending' | 'Refunded'; date: string }

const names = ['Ava Chen', 'Liam Novak', 'Noor Haddad', 'Mateo Silva', 'Sara Lind', 'Kenji Mori', 'Zoe Adler', 'Omar Faye', 'Ines Roca', 'Theo Marsh', 'Lena Park', 'Ravi Nair']
const plans = ['Starter', 'Growth', 'Scale']
const statuses: Order['status'][] = ['Paid', 'Paid', 'Paid', 'Pending', 'Refunded']

export const orders: Order[] = names.map((n, i) => ({
  id: 'ORD-' + (4821 + i),
  customer: n,
  plan: plans[i % 3],
  amount: [29, 99, 299][i % 3] * (1 + (i % 4)),
  status: statuses[i % statuses.length],
  date: new Date(Date.now() - i * 86400000 * 1.3).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
}))
`
const CHARTS = String.raw`import { useState } from 'react'

export function AreaChart({ data, height = 220 }: { data: number[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 640
  const pad = 8
  const max = Math.max(...data) * 1.1
  const min = Math.min(...data) * 0.9
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2)
  const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - pad * 2)
  const line = data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')
  const area = line + ' L' + x(data.length - 1) + ' ' + height + ' L' + x(0) + ' ' + height + ' Z'
  return (
    <div className="relative">
      <svg viewBox={'0 0 ' + w + ' ' + height} className="h-auto w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)))))
        }}>
        <defs>
          <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={0} x2={w} y1={height * t} y2={height * t} stroke="var(--line)" strokeDasharray="3 5" />)}
        <path d={area} fill="url(#areaFill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke="var(--muted)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover])} r={5} fill="var(--bg)" stroke="var(--accent)" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs shadow-lg" style={{ left: Math.min(80, Math.max(2, (hover / (data.length - 1)) * 100)) + '%', transform: 'translateX(-50%)' }}>
          Day {hover + 1} · <b>{'$' + data[hover].toLocaleString()}</b>
        </div>
      )}
    </div>
  )
}

export function BarList({ items }: { items: { name: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value))
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.name}>
          <div className="mb-1 flex justify-between text-sm"><span>{i.name}</span><span className="text-muted">{'$' + i.value.toLocaleString()}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: (i.value / max) * 100 + '%' }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function Donut({ items }: { items: { name: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  const r = 52
  const c = 2 * Math.PI * r
  const shades = [1, 0.7, 0.45, 0.25]
  let offset = 0
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="16" />
        {items.map((i, idx) => {
          const len = (i.value / total) * c
          const el = <circle key={i.name} cx="70" cy="70" r={r} fill="none" stroke="var(--accent)" strokeOpacity={shades[idx % shades.length]} strokeWidth="16" strokeDasharray={len + ' ' + (c - len)} strokeDashoffset={-offset} />
          offset += len
          return el
        })}
      </svg>
      <ul className="space-y-2 text-sm">
        {items.map((i, idx) => (
          <li key={i.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" style={{ opacity: shades[idx % shades.length] }} />
            {i.name}<span className="text-muted">{i.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
`
const APP = String.raw`import { useMemo, useState } from 'react'
import { Activity, CreditCard, DollarSign, LayoutDashboard, Search, Settings, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { AreaChart, BarList, Donut } from './components/Charts'
import { ThemeToggle } from './components/ThemeToggle'
import { channels, orders, regions, revenueSeries, type Range } from './data'

const nav = [
  { icon: LayoutDashboard, label: 'Overview' },
  { icon: Activity, label: 'Activity' },
  { icon: Users, label: 'Customers' },
  { icon: CreditCard, label: 'Billing' },
  { icon: Settings, label: 'Settings' },
]

const statusStyle = { Paid: 'bg-success/15 text-success', Pending: 'bg-warn/15 text-warn', Refunded: 'bg-danger/15 text-danger' }

function Kpi({ label, value, delta, icon: Icon }: { label: string; value: string; delta: number; icon: typeof Users }) {
  const up = delta >= 0
  return (
    <div className="rounded-theme border border-line bg-surface p-5">
      <div className="flex items-center justify-between text-sm text-muted">{label}<Icon size={16} /></div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className={'mt-2 flex items-center gap-1 text-xs ' + (up ? 'text-success' : 'text-danger')}>
        {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(delta)}% vs previous period
      </p>
    </div>
  )
}

export default function App() {
  const [range, setRange] = useState<Range>(30)
  const [q, setQ] = useState('')
  const [active, setActive] = useState('Overview')
  const series = useMemo(() => revenueSeries(range), [range])
  const total = series.reduce((a, b) => a + b, 0)
  const rows = orders.filter((o) => (o.customer + o.id + o.plan).toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface/60 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight"><span className="h-6 w-6 rounded-lg bg-accent" />Ledger</div>
        <nav className="space-y-1">
          {nav.map(({ icon: Icon, label }) => (
            <button key={label} onClick={() => setActive(label)} className={'flex w-full items-center gap-3 rounded-theme px-3 py-2 text-sm transition ' + (active === label ? 'bg-bg font-medium shadow-sm' : 'text-muted hover:text-fg')}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold tracking-tight">{active}</h1><p className="text-sm text-muted">Performance across all products</p></div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-theme border border-line bg-surface p-1 text-xs">
              {([7, 30, 90] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={'rounded-lg px-3 py-1.5 transition ' + (range === r ? 'bg-fg text-bg' : 'text-muted')}>{r}d</button>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Revenue" value={'$' + total.toLocaleString()} delta={12.4} icon={DollarSign} />
          <Kpi label="Active users" value={(range * 412).toLocaleString()} delta={4.1} icon={Users} />
          <Kpi label="Conversion" value="3.84%" delta={-0.6} icon={Activity} />
          <Kpi label="Avg. order" value={'$' + Math.round(total / (range * 9))} delta={2.2} icon={CreditCard} />
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-theme border border-line bg-surface p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium">Revenue · last {range} days</h2>
            <AreaChart data={series} />
          </div>
          <div className="rounded-theme border border-line bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium">Traffic sources</h2>
            <Donut items={channels} />
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-theme border border-line bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium">Revenue by region</h2>
            <BarList items={regions} />
          </div>
          <div className="rounded-theme border border-line bg-surface p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Recent orders</h2>
              <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 rounded-theme border border-line bg-bg pl-8 pr-3 text-sm outline-none focus:border-accent" /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr>{['Order', 'Customer', 'Plan', 'Amount', 'Status', 'Date'].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="py-2.5 font-mono text-xs text-muted">{o.id}</td><td>{o.customer}</td><td>{o.plan}</td><td>{'$' + o.amount}</td>
                      <td><span className={'rounded-full px-2 py-0.5 text-xs ' + statusStyle[o.status]}>{o.status}</span></td><td className="text-muted">{o.date}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">No orders match “{q}”.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
`
export const dashboard: Template = {
  id: 'dashboard', name: 'Analytics Dashboard', description: 'KPIs, interactive charts, filters and a searchable table.', icon: 'chart', tags: ['app', 'charts'],
  files: { ...scaffoldFiles('Analytics Dashboard', LUCIDE), '/src/App.tsx': APP, '/src/data.ts': DATA, '/src/components/Charts.tsx': CHARTS, '/src/components/ThemeToggle.tsx': THEME_TOGGLE },
}
