import { describe, expect, it } from 'vitest'
import { buildSplitRows, buildUnifiedRows } from './lineDiff'

const a = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
const b = a.replace('line 15', 'LINE FIFTEEN').replace('line 16\n', '')

describe('diff rows', () => {
  it('pairs removed/added lines side by side and collapses long unchanged runs', () => {
    const rows = buildSplitRows(a, b)
    const changed = rows.filter((r) => r.left?.type === 'del' || r.right?.type === 'add')
    expect(changed.length).toBeGreaterThan(0)
    const paired = rows.find((r) => r.left?.type === 'del' && r.right?.type === 'add')!
    expect(paired.left!.text).toBe('line 15')
    expect(paired.right!.text).toBe('LINE FIFTEEN')
    expect(rows.some((r) => r.skip)).toBe(true)
    expect(rows.length).toBeLessThan(30)
  })
  it('numbers lines correctly in unified view', () => {
    const rows = buildUnifiedRows('a\nb\nc\n', 'a\nB\nc\nd\n')
    const cells = rows.map((r) => r.cell!)
    expect(cells.map((c) => `${c.type}:${c.text}`)).toEqual(['ctx:a', 'del:b', 'add:B', 'ctx:c', 'add:d'])
    expect(cells[1].n).toBe(2)
    expect(cells[4].n).toBe(4)
  })
  it('handles added and deleted whole files', () => {
    expect(buildSplitRows('', 'x\ny').every((r) => r.right?.type === 'add' && !r.left)).toBe(true)
    expect(buildSplitRows('x\ny', '').every((r) => r.left?.type === 'del' && !r.right)).toBe(true)
  })
})
