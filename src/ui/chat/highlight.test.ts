import { describe, expect, it } from 'vitest'
import { highlight } from './highlight'

describe('highlight', () => {
  it('tokenizes keywords, strings, numbers, comments, calls and tags', () => {
    const t = highlight('const x = foo("a", 12) // hi\n<div>')
    const k = (kind: string) => t.filter((x) => x.t === kind).map((x) => x.v)
    expect(k('kw')).toEqual(['const']); expect(k('str')).toEqual(['"a"']); expect(k('num')).toEqual(['12']); expect(k('com')).toEqual(['// hi']); expect(k('fn')).toEqual(['foo']); expect(k('tag')).toEqual(['<div'])
  })
  it('round-trips the source text', () => { const s = 'let a = `x${1}`;\n# c'; expect(highlight(s, 'py').map((x) => x.v).join('')).toBe(s) })
})
