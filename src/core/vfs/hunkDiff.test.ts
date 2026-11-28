// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyHunks, computeHunks, hunkPreview } from './hunkDiff'

const before = 'a\nb\nc\nd\ne\nf'
const after = 'a\nB\nc\nd\nE\nf\ng'
describe('per-hunk diff', () => {
  it('splits a change into independent hunks with positions and context', () => {
    const h = computeHunks(before, after)
    expect(h).toHaveLength(3)
    expect(h[0]).toMatchObject({ beforeStart: 2, afterStart: 2, removed: ['b'], added: ['B'], contextBefore: ['a'], contextAfter: ['c', 'd'] })
    expect(h[1]).toMatchObject({ removed: ['e'], added: ['E'] })
    expect(h[2]).toMatchObject({ removed: [], added: ['g'] })
    expect(hunkPreview(h[0])).toBe('@@ -2,1 +2,1 @@\n a\n-b\n+B\n c\n d')
  })
  it('accept-all = after, accept-none = before, any subset is exact', () => {
    expect(applyHunks(before, after, new Set([0, 1, 2]))).toBe(after)
    expect(applyHunks(before, after, new Set())).toBe(before)
    expect(applyHunks(before, after, new Set([0]))).toBe('a\nB\nc\nd\ne\nf')
    expect(applyHunks(before, after, new Set([1, 2]))).toBe('a\nb\nc\nd\nE\nf\ng')
    expect(applyHunks(before, after, new Set([2]))).toBe('a\nb\nc\nd\ne\nf\ng')
  })
  it('handles creation, deletion and identical text', () => {
    expect(computeHunks('x', 'x')).toEqual([])
    const del = computeHunks('a\nb\nc', 'a\nc')
    expect(del).toHaveLength(1)
    expect(applyHunks('a\nb\nc', 'a\nc', new Set())).toBe('a\nb\nc')
    expect(applyHunks('', 'new\nfile', new Set([0]))).toBe('new\nfile')
  })
})
