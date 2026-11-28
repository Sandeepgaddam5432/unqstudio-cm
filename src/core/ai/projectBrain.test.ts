// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { rankFiles, resolveExports, tokenize, usedBy } from './projectBrain'

const files: Record<string, string> = {
  '/src/components/CartButton.tsx': 'export function CartButton() { return <button onClick={addToCart}>Add to cart</button> }',
  '/src/components/Hero.tsx': 'export function Hero() { return <h1>Welcome to our store</h1> }',
  '/src/lib/format.ts': 'export const formatPrice = (n: number) => `$${n}`',
  '/src/pages/Checkout.tsx': "import { CartButton } from '../components/CartButton'\nexport default function Checkout() { return <CartButton /> }",
  '/src/App.tsx': "import Checkout from '@/pages/Checkout'\nimport { Hero } from './components/Hero'\nexport default function App() { return <><Hero /><Checkout /></> }",
  '/src/components/index.ts': "export * from './CartButton'\nexport * from './Hero'\nexport { formatPrice as price } from '../lib/format'",
  '/src/barrel.ts': "export * from './components'\nexport const local = 1",
  '/src/cycle-a.ts': "export * from './cycle-b'\nexport const A = 1",
  '/src/cycle-b.ts': "export * from './cycle-a'\nexport const B = 2",
}
describe('Project Brain', () => {
  it('tokenizes camelCase, paths and symbols', () => { expect(tokenize('CartButton /src/lib/addToCart.tsx')).toEqual(['cart', 'button', 'src', 'lib', 'add', 'to', 'cart', 'tsx']) })
  it('BM25 ranks the relevant file first and respects topK / budget', () => {
    const r = rankFiles('fix the cart button', files)
    expect(r[0].path).toBe('/src/components/CartButton.tsx')
    expect(r.every((x, i) => i === 0 || r[i - 1].score >= x.score)).toBe(true)
    expect(rankFiles('price format', files)[0].path).toBe('/src/lib/format.ts')
    expect(rankFiles('cart', files, { topK: 1 })).toHaveLength(1)
    expect(rankFiles('cart', files, { charBudget: 1 }).length).toBe(1) // always returns the best file even when over budget
    expect(rankFiles('zzzzqqq', files)).toEqual([])
    expect(rankFiles('', files)).toEqual([])
  })
  it('resolves `export *`, aliased re-exports and cycles', () => {
    const ex = resolveExports(files)
    expect([...ex.get('/src/components/index.ts')!].sort()).toEqual(['CartButton', 'Hero', 'price'])
    expect([...ex.get('/src/barrel.ts')!].sort()).toEqual(['CartButton', 'Hero', 'local', 'price'])
    expect([...ex.get('/src/cycle-a.ts')!].sort()).toEqual(['A', 'B'])
    expect(ex.get('/src/pages/Checkout.tsx')!.has('default')).toBe(true)
  })
  it('builds the reverse importer graph (relative + @/ aliases)', () => {
    const u = usedBy(files)
    expect(u.get('/src/components/CartButton.tsx')!.sort()).toEqual(['/src/components/index.ts', '/src/pages/Checkout.tsx'])
    expect(u.get('/src/pages/Checkout.tsx')).toEqual(['/src/App.tsx'])
  })
})
