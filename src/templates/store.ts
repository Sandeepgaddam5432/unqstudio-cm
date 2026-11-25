import { scaffoldFiles } from '@/core/vfs/scaffold'
import { LUCIDE, THEME_TOGGLE } from './shared'
import type { Template } from './types'

const DATA = String.raw`export interface Product { id: string; name: string; price: number; category: string; rating: number; emoji: string; hue: number; blurb: string }

export const products: Product[] = [
  { id: 'p1', name: 'Ceramic Pour-Over Set', price: 64, category: 'Kitchen', rating: 4.8, emoji: '☕', hue: 28, blurb: 'Hand-glazed dripper and carafe.' },
  { id: 'p2', name: 'Linen Throw Blanket', price: 89, category: 'Home', rating: 4.6, emoji: '🧺', hue: 200, blurb: 'Stonewashed, breathable, soft.' },
  { id: 'p3', name: 'Walnut Desk Shelf', price: 129, category: 'Office', rating: 4.9, emoji: '🪵', hue: 24, blurb: 'Solid walnut, tool-free assembly.' },
  { id: 'p4', name: 'Soy Candle — Cedar', price: 28, category: 'Home', rating: 4.5, emoji: '🕯️', hue: 40, blurb: '45-hour burn, clean scent.' },
  { id: 'p5', name: 'Mechanical Keyboard', price: 149, category: 'Office', rating: 4.7, emoji: '⌨️', hue: 260, blurb: 'Hot-swappable, gasket mounted.' },
  { id: 'p6', name: 'Cast-Iron Skillet 10"', price: 54, category: 'Kitchen', rating: 4.9, emoji: '🍳', hue: 0, blurb: 'Pre-seasoned, lasts generations.' },
  { id: 'p7', name: 'Merino Beanie', price: 36, category: 'Apparel', rating: 4.4, emoji: '🧢', hue: 170, blurb: 'Itch-free, naturally warm.' },
  { id: 'p8', name: 'Canvas Weekender Bag', price: 112, category: 'Apparel', rating: 4.6, emoji: '👜', hue: 90, blurb: 'Waxed canvas with leather trim.' },
]
export const categories = ['All', ...Array.from(new Set(products.map((p) => p.category)))]
`
const CART = String.raw`import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { products } from './data'

type State = Record<string, number>
type Action = { type: 'add'; id: string } | { type: 'dec'; id: string } | { type: 'remove'; id: string } | { type: 'clear' }

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'add': return { ...state, [a.id]: (state[a.id] ?? 0) + 1 }
    case 'dec': {
      const n = (state[a.id] ?? 0) - 1
      const next = { ...state }
      if (n <= 0) delete next[a.id]
      else next[a.id] = n
      return next
    }
    case 'remove': {
      const next = { ...state }
      delete next[a.id]
      return next
    }
    case 'clear': return {}
  }
}

interface Ctx { lines: { id: string; qty: number }[]; count: number; subtotal: number; dispatch: (a: Action) => void }
const CartContext = createContext<Ctx | null>(null)
const KEY = 'store-cart-v1'

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {}, (): State => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') as State } catch { return {} }
  })
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(state)) }, [state])
  const value = useMemo<Ctx>(() => {
    const lines = Object.entries(state).map(([id, qty]) => ({ id, qty }))
    const subtotal = lines.reduce((s, l) => s + (products.find((p) => p.id === l.id)?.price ?? 0) * l.qty, 0)
    return { lines, count: lines.reduce((s, l) => s + l.qty, 0), subtotal, dispatch }
  }, [state])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): Ctx {
  const c = useContext(CartContext)
  if (!c) throw new Error('useCart must be used inside CartProvider')
  return c
}
`
const DRAWER = String.raw`import { useState } from 'react'
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { products } from '../data'
import { useCart } from '../cart'

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, subtotal, dispatch } = useCart()
  const [code, setCode] = useState('')
  const [done, setDone] = useState(false)
  const discount = code.trim().toUpperCase() === 'WELCOME10' ? subtotal * 0.1 : 0
  const shipping = subtotal === 0 || subtotal - discount > 100 ? 0 : 8
  const total = subtotal - discount + shipping

  return (
    <div className={'fixed inset-0 z-40 ' + (open ? '' : 'pointer-events-none')}>
      <div onClick={onClose} className={'absolute inset-0 bg-black/40 transition-opacity ' + (open ? 'opacity-100' : 'opacity-0')} />
      <aside className={'absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-bg transition-transform duration-300 ' + (open ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between border-b border-line p-5"><h2 className="font-semibold">Your cart</h2><button onClick={onClose} aria-label="Close cart"><X size={18} /></button></div>
        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-5xl">🎉</p><h3 className="text-lg font-semibold">Order placed!</h3>
            <p className="text-sm text-muted">This is a demo checkout — connect a payment provider like Stripe to take real orders.</p>
            <button onClick={() => { dispatch({ type: 'clear' }); setDone(false); onClose() }} className="mt-2 rounded-theme bg-fg px-5 py-2.5 text-sm font-medium text-bg">Keep shopping</button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted"><ShoppingBag size={32} /><p className="text-sm">Your cart is empty</p></div>
        ) : (
          <>
            <ul className="flex-1 space-y-4 overflow-auto p-5">
              {lines.map((l) => {
                const p = products.find((x) => x.id === l.id)
                if (!p) return null
                return (
                  <li key={l.id} className="flex gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-theme text-2xl" style={{ background: 'hsl(' + p.hue + ' 70% 85%)' }}>{p.emoji}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p><p className="text-sm text-muted">{'$' + p.price}</p>
                      <div className="mt-2 inline-flex items-center rounded-lg border border-line text-sm">
                        <button className="p-1.5" aria-label="Decrease" onClick={() => dispatch({ type: 'dec', id: l.id })}><Minus size={13} /></button>
                        <span className="w-7 text-center">{l.qty}</span>
                        <button className="p-1.5" aria-label="Increase" onClick={() => dispatch({ type: 'add', id: l.id })}><Plus size={13} /></button>
                      </div>
                    </div>
                    <button aria-label="Remove" onClick={() => dispatch({ type: 'remove', id: l.id })} className="self-start text-muted hover:text-danger"><Trash2 size={15} /></button>
                  </li>
                )
              })}
            </ul>
            <div className="space-y-3 border-t border-line p-5 text-sm">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Promo code (try WELCOME10)" className="h-10 w-full rounded-theme border border-line bg-surface px-3 outline-none focus:border-accent" />
              <div className="flex justify-between text-muted"><span>Subtotal</span><span>{'$' + subtotal.toFixed(2)}</span></div>
              {discount > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>{'−$' + discount.toFixed(2)}</span></div>}
              <div className="flex justify-between text-muted"><span>Shipping</span><span>{shipping ? '$' + shipping.toFixed(2) : 'Free'}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{'$' + total.toFixed(2)}</span></div>
              <button onClick={() => setDone(true)} className="w-full rounded-theme bg-accent py-3 font-medium text-accent-fg transition hover:opacity-90">Checkout</button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
`
const APP = String.raw`import { useMemo, useState } from 'react'
import { Search, ShoppingBag, Star } from 'lucide-react'
import { categories, products } from './data'
import { CartProvider, useCart } from './cart'
import { CartDrawer } from './components/CartDrawer'
import { ThemeToggle } from './components/ThemeToggle'

type Sort = 'featured' | 'low' | 'high' | 'rating'

function Shop() {
  const { dispatch, count, lines } = useCart()
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('featured')

  const list = useMemo(() => {
    const l = products.filter((p) => (cat === 'All' || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()))
    if (sort === 'low') l.sort((a, b) => a.price - b.price)
    if (sort === 'high') l.sort((a, b) => b.price - a.price)
    if (sort === 'rating') l.sort((a, b) => b.rating - a.rating)
    return l
  }, [cat, q, sort])

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <a href="#" className="text-lg font-semibold tracking-tight">Hearth &amp; Home</a>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => setOpen(true)} className="relative flex h-9 items-center gap-2 rounded-theme bg-fg px-3.5 text-sm font-medium text-bg" aria-label="Open cart">
              <ShoppingBag size={15} />Cart
              {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] text-accent-fg">{count}</span>}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">Objects made to be used every day.</h1>
        <p className="mt-4 max-w-lg text-muted">Small-batch goods for the kitchen, desk and home. Free shipping over $100.</p>
      </section>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => <button key={c} onClick={() => setCat(c)} className={'rounded-full border px-4 py-1.5 text-sm transition ' + (cat === c ? 'border-fg bg-fg text-bg' : 'border-line text-muted hover:text-fg')}>{c}</button>)}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search products" className="h-10 w-40 rounded-theme border border-line bg-surface pl-8 pr-3 text-sm outline-none focus:border-accent sm:w-52" /></div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-10 rounded-theme border border-line bg-surface px-3 text-sm outline-none">
              <option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => {
            const inCart = lines.find((l) => l.id === p.id)?.qty ?? 0
            return (
              <article key={p.id} className="group flex flex-col">
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-theme text-6xl transition group-hover:scale-[1.02]" style={{ background: 'linear-gradient(145deg, hsl(' + p.hue + ' 75% 88%), hsl(' + p.hue + ' 65% 76%))' }}>{p.emoji}</div>
                <div className="mt-3 flex-1">
                  <h3 className="text-sm font-medium">{p.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">{p.blurb}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Star size={12} className="fill-current text-warn" />{p.rating}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-semibold">{'$' + p.price}</span>
                  <button onClick={() => { dispatch({ type: 'add', id: p.id }); setOpen(true) }} className="rounded-theme border border-line px-3 py-1.5 text-xs font-medium transition hover:bg-accent hover:text-accent-fg">{inCart ? 'Add another (' + inCart + ')' : 'Add to cart'}</button>
                </div>
              </article>
            )
          })}
        </div>
        {list.length === 0 && <p className="py-20 text-center text-muted">Nothing matches your filters.</p>}
      </main>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <CartProvider>
      <Shop />
    </CartProvider>
  )
}
`
export const store: Template = {
  id: 'store', name: 'Product Storefront', description: 'Catalog, filters, persistent cart with promo code and checkout.', icon: 'cart', tags: ['commerce', 'app'],
  files: { ...scaffoldFiles('Product Storefront', LUCIDE), '/src/App.tsx': APP, '/src/data.ts': DATA, '/src/cart.tsx': CART, '/src/components/CartDrawer.tsx': DRAWER, '/src/components/ThemeToggle.tsx': THEME_TOGGLE },
}
