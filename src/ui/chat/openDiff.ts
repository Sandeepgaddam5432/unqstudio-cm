import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import type { OpRecord } from '@/core/ai/apply'

/** Jump to the Code workspace diff viewer for an applied AI op. */
export function openOpDiff(op: Pick<OpRecord, 'path' | 'op' | 'before' | 'after'>) {
  const ws = useWorkspace.getState()
  if (op.before !== undefined || op.after !== undefined) ws.showDiff({ path: op.path, before: op.before ?? '', after: op.after ?? '', label: `${op.op} by AI`, existed: op.before !== undefined })
  ws.openFile(op.path)
  useApp.getState().setMode('code')
}
