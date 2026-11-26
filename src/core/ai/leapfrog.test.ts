import { describe, expect, it } from 'vitest'
import { buildHealPrompt, clampHealSteps, excerpt, pollUntil, selfHealLoop, type HealDeps, type HealError } from './selfHeal'
import { buildInlineMessages, diffPreview, expandToLines, extractReplacement, spliceRange, surroundingContext } from './inlineEdit'
import { buildRepoMap, extractSymbols, formatSymbols } from './repoMap'
import { buildProjectContext } from './prompts'
import type { VirtualFileSystem } from '@/core/vfs/vfs'

const err = (message: string, file = '/src/App.tsx', line = 3): HealError => ({ message, file, line, source: 'build' })
const FILE = ['import React from "react"', 'export default function App() {', '  const x = <div>', '  return x', '}'].join('\n')

describe('self-heal loop: fail → heal → pass', () => {
  it('heals in one round and reports GREEN', async () => {
    let builds = 0; const prompts: string[] = []
    const deps: HealDeps = {
      getErrors: async () => (builds++ === 0 ? [err('Unterminated JSX contents')] : []),
      runTurn: async (p) => { prompts.push(p); return { applied: 1 } },
      readFile: () => FILE, isAborted: () => false,
    }
    const r = await selfHealLoop(deps, 3)
    expect(r).toMatchObject({ status: 'green', attempts: 1, remaining: [] })
    expect(prompts[0]).toContain('Unterminated JSX contents'); expect(prompts[0]).toContain('/src/App.tsx:3'); expect(prompts[0]).toContain('attempt 1/3')
    expect(prompts[0]).toMatch(/3> {3}const x = <div>/) // offending line marked with ">"
  })
  it('already-green builds never call the model', async () => {
    let turns = 0
    const r = await selfHealLoop({ getErrors: async () => [], runTurn: async () => { turns++; return { applied: 1 } }, readFile: () => '', isAborted: () => false }, 3)
    expect(r).toMatchObject({ status: 'green', attempts: 0 }); expect(turns).toBe(0)
  })
  it('reports phases so the status pill can render “Attempt n/max”', async () => {
    const seen: string[] = []; let n = 0
    await selfHealLoop({ getErrors: async () => (n++ < 1 ? [err('boom')] : []), runTurn: async () => ({ applied: 1 }), readFile: () => FILE, isAborted: () => false, onPhase: (p) => seen.push(`${p.phase}:${p.attempt}/${p.max}`) }, 2)
    expect(seen).toEqual(['waiting:0/2', 'healing:1/2', 'waiting:1/2'])
  })
})

describe('self-heal loop: guards', () => {
  it('max-retry guard: gives up after exactly `max` heal turns', async () => {
    let turns = 0; let k = 0
    const r = await selfHealLoop({ getErrors: async () => [err(`new error ${k++}`)], runTurn: async () => { turns++; return { applied: 1 } }, readFile: () => FILE, isAborted: () => false }, 2)
    expect(r.status).toBe('gave-up'); expect(r.attempts).toBe(2); expect(turns).toBe(2); expect(r.remaining).toHaveLength(1)
  })
  it('clamps max steps to 1–3', () => { expect([clampHealSteps(0), clampHealSteps(2), clampHealSteps(9), clampHealSteps('x'), clampHealSteps(undefined)]).toEqual([1, 2, 3, 3, 3]) })
  it('abort before healing → stopped, model never called', async () => {
    let turns = 0
    const r = await selfHealLoop({ getErrors: async () => [err('x')], runTurn: async () => { turns++; return { applied: 1 } }, readFile: () => FILE, isAborted: () => true }, 3)
    expect(r.status).toBe('stopped'); expect(turns).toBe(0)
  })
  it('abort during a heal turn → stopped, no further rounds', async () => {
    let abort = false; let turns = 0
    const r = await selfHealLoop({ getErrors: async () => [err('x' + turns)], runTurn: async () => { turns++; abort = true; return { applied: 1 } }, readFile: () => FILE, isAborted: () => abort }, 3)
    expect(r.status).toBe('stopped'); expect(turns).toBe(1)
  })
  it('stops when the same error survives a heal (no progress) or nothing was applied', async () => {
    let turns = 0
    const same = await selfHealLoop({ getErrors: async () => [err('same')], runTurn: async () => { turns++; return { applied: 1 } }, readFile: () => FILE, isAborted: () => false }, 3)
    expect(same.status).toBe('no-progress'); expect(turns).toBe(1)
    const none = await selfHealLoop({ getErrors: async () => [err('e')], runTurn: async () => ({ applied: 0 }), readFile: () => FILE, isAborted: () => false }, 3)
    expect(none).toMatchObject({ status: 'no-progress', attempts: 1 })
  })
  it('pollUntil resolves on condition or times out (injectable clock)', async () => {
    let n = 0; const sleeps: number[] = []
    expect(await pollUntil(() => ++n >= 3, 1000, 100, async (ms) => { sleeps.push(ms) })).toBe(true); expect(sleeps).toEqual([100, 100])
    expect(await pollUntil(() => false, 300, 100, async () => {})).toBe(false)
  })
  it('prompt: caps errors/files, normalises paths, skips unknown files', () => {
    const errs = Array.from({ length: 9 }, (_, i) => err(`e${i}`, `src/f${i}.tsx`, 1))
    const p = buildHealPrompt(errs, (path) => (path === '/src/f0.tsx' ? 'a\nb' : path === '/src/f1.tsx' ? 'c' : undefined))
    expect(p).toContain('1. [build] /src/f0.tsx:1'); expect(p).not.toContain('7. '); expect(p).toContain('--- /src/f0.tsx'); expect(p).not.toContain('--- /src/f5.tsx')
    expect(excerpt('l1\nl2\nl3', 2, 1).text).toBe('1| l1\n2> l2\n3| l3')
  })
})

describe('inline ⌘K edit — line-range splice & diff', () => {
  const doc = 'alpha\nbeta gamma\ndelta\nomega'
  it('expands any selection to whole lines', () => {
    const r = expandToLines(doc, 8, 10) // inside "beta gamma"
    expect(r).toMatchObject({ text: 'beta gamma', startLine: 2, endLine: 2 }); expect(doc.slice(r.from, r.to)).toBe('beta gamma')
    const multi = expandToLines(doc, 8, 20) // across 2 lines
    expect(multi).toMatchObject({ text: 'beta gamma\ndelta', startLine: 2, endLine: 3 })
    expect(expandToLines(doc, 3, 3).text).toBe('alpha') // empty selection = current line
    expect(expandToLines(doc, 6, 16).text).toBe('beta gamma') // ends after the newline → does not drag the next line in
    expect(expandToLines(doc, 18, 99).text).toBe('delta\nomega'); expect(expandToLines(doc, 0, 0).startLine).toBe(1)
  })
  it('splices ONLY the selected lines', () => {
    const r = expandToLines(doc, 8, 10)
    expect(spliceRange(doc, r.from, r.to, 'BETA')).toBe('alpha\nBETA\ndelta\nomega')
    const m = expandToLines(doc, 8, 20)
    expect(spliceRange(doc, m.from, m.to, 'x\ny\nz')).toBe('alpha\nx\ny\nz\nomega')
  })
  it('cleans model replies (fences, trailing newline)', () => {
    expect(extractReplacement('```tsx\n  <div/>\n```')).toBe('  <div/>'); expect(extractReplacement('Sure!\n```\nlet a = 1\n```\nDone')).toBe('let a = 1')
    expect(extractReplacement('plain\n')).toBe('plain'); expect(extractReplacement('```ts\nx')).toBe('x')
  })
  it('green/red diff preview', () => {
    expect(diffPreview('a\nb\nc', 'a\nB\nc')).toEqual([{ type: 'same', text: 'a' }, { type: 'del', text: 'b' }, { type: 'add', text: 'B' }, { type: 'same', text: 'c' }])
    expect(diffPreview('x', 'x').every((l) => l.type === 'same')).toBe(true)
  })
  it('prompt carries before/selected/after + instruction; context is bounded', () => {
    const big = Array.from({ length: 200 }, (_, i) => `line${i}`).join('\n')
    const r = expandToLines(big, big.indexOf('line100'), big.indexOf('line100') + 3)
    const ctx = surroundingContext(big, r, 5)
    expect(ctx.before.split('\n')).toEqual(['line95', 'line96', 'line97', 'line98', 'line99']); expect(ctx.after.split('\n')[0]).toBe('line101')
    const msgs = buildInlineMessages({ path: '/src/A.tsx', ...ctx, selected: r.text, instruction: ' add aria labels ' })
    expect(msgs[0]!.role).toBe('system'); expect(String(msgs[1]!.content)).toContain('<selected>\nline100\n</selected>'); expect(String(msgs[1]!.content)).toContain('Instruction: add aria labels')
  })
})

const TSX = `import { useState } from 'react'
import { Header } from './Header'
import type { Props } from '@/types'
// export function Fake() {}
/* export const Nope = 1 */
export interface CardProps { title: string }
export type Id = string
export enum Mode { A }
export class Store {}
export function useCounter() { return useState(0) }
export const Card = ({ title }: CardProps) => <div>{title}</div>
export const LIMIT = 3
export function helper() {}
export { Header as Head, type Props }
export default function App() { return null }
const lazy = () => import('./Lazy')`
describe('Project Symbol Map extraction', () => {
  const s = extractSymbols('/src/App.tsx', TSX)
  const by = (n: string) => s.exports.find((e) => e.name === n)?.kind
  it('classifies exports', () => {
    expect([by('App'), by('useCounter'), by('Card'), by('LIMIT'), by('helper'), by('Store'), by('CardProps'), by('Id'), by('Mode'), by('Head')]).toEqual(['component', 'hook', 'component', 'const', 'function', 'class', 'interface', 'type', 'enum', 'component'])
  })
  it('ignores commented-out exports', () => { expect(by('Fake')).toBeUndefined(); expect(by('Nope')).toBeUndefined() })
  it('collects static + dynamic + type imports', () => { expect(s.imports).toEqual(expect.arrayContaining(['react', './Header', '@/types', './Lazy'])) })
  it('extracts CSS structure', () => {
    const c = extractSymbols('/src/index.css', '@import "tailwindcss";\n@theme { --color-brand: red; }\n.btn { color: red }\n@keyframes spin {}\n')
    expect(c.imports).toEqual(['tailwindcss']); expect(c.css).toEqual(expect.arrayContaining(['@theme', '.btn', '@keyframes spin', '--color-brand']))
  })
  it('formats compact one-liners', () => {
    const line = formatSymbols(s)
    expect(line).toMatch(/^\/src\/App\.tsx — exports: .*App \(component\)/); expect(line).toContain('imports: ./Header, @/types, ./Lazy'); expect(line).toContain('pkgs: react')
    expect(buildRepoMap([{ path: '/a.json', content: '{}' }, { path: '/b.ts', content: 'export const b = 1' }]).entries).toBe(1)
  })
})

const fake = (files: Record<string, string>) => ({ meta: { name: 'T' }, paths: () => Object.keys(files).sort(), getRecord: (p: string) => ({ content: files[p], encoding: 'utf8' }), isLocked: () => false, getLocks: () => [] }) as unknown as VirtualFileSystem
const body = (n: number) => Array.from({ length: n }, (_, i) => `  const value${i} = compute(${i}) // some filler to make the file realistic`).join('\n')
const comp = (i: number) => `import { useState } from 'react'\nexport function Comp${i}() {\n${body(70)}\n  return null\n}\nexport const useThing${i} = () => useState(${i})\n`

describe('buildProjectContext — symbol map & token budget', () => {
  const big: Record<string, string> = { '/index.html': '<div id="root"></div>', '/src/main.tsx': 'import App from "./App"\n', '/src/App.tsx': 'export default function App() { return null }\n', '/src/pinned.tsx': comp(99) }
  for (let i = 0; i < 40; i++) big[`/src/c${i}.tsx`] = comp(i)
  it('small projects are sent in full (no regression)', () => {
    const r = buildProjectContext(fake({ '/src/App.tsx': 'export default function App() {}', '/src/b.ts': 'export const b = 1' }))
    expect(r.text).not.toContain('Project symbol map'); expect(r.text).toContain('export const b = 1'); expect(r.files.every((f) => f.included && !f.mapped)).toBe(true)
  })
  it('large projects: pinned + entry files in full, the rest as a symbol map', () => {
    const r = buildProjectContext(fake(big), { pinned: ['/src/pinned.tsx'] })
    expect(r.text).toContain('### Project symbol map'); expect(r.text).toContain('--- /src/pinned.tsx ---'); expect(r.text).toContain('--- /src/App.tsx ---'); expect(r.text).toContain('--- /src/main.tsx ---')
    expect(r.text).toMatch(/\/src\/c39\.tsx — exports: Comp39 \(component\), useThing39 \(hook\)/)
    expect(r.files.find((f) => f.path === '/src/c39.tsx')).toMatchObject({ included: false, mapped: true })
  })
  it('uses ≥60% fewer tokens than sending everything', () => {
    const withMap = buildProjectContext(fake(big), { pinned: ['/src/pinned.tsx'] }).text.length
    const full = buildProjectContext(fake(big), { pinned: ['/src/pinned.tsx'], budgetChars: 1e9, perFileChars: 1e9, symbolMap: false }).text.length
    expect(withMap / full).toBeLessThan(0.4)
  })
  it('an @mentioned file always gets the full-file budget', () => {
    const r = buildProjectContext(fake(big), { mentioned: ['/src/c7.tsx'] })
    expect(r.text).toContain('--- /src/c7.tsx ---'); expect(r.files.find((f) => f.path === '/src/c7.tsx')?.included).toBe(true)
  })
})
