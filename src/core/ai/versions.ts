/** Version numbering for inline Version Cards: every assistant turn that applied at least one file op is a version (v1, v2, …). */
export interface VersionMsg { id: string; role: 'user' | 'assistant'; text: string; ops?: { status: string; path: string }[]; undone?: boolean; streaming?: boolean; checkpointAfter?: string }

export const isVersionTurn = (m: VersionMsg): boolean => m.role === 'assistant' && !m.streaming && !!m.ops?.some((o) => o.status === 'applied')

/** Map message id → version number (1-based, in conversation order). Undone turns keep their number so links stay stable. */
export function assignVersions(messages: VersionMsg[]): Map<string, number> {
  const out = new Map<string, number>()
  let n = 0
  for (const m of messages) if (isVersionTurn(m)) out.set(m.id, ++n)
  return out
}

/** Concise change title: the user's request that triggered the turn (first line, ≤ 60 chars) or the first edited file. */
export function versionTitle(messages: VersionMsg[], id: string): string {
  const i = messages.findIndex((m) => m.id === id)
  for (let j = i - 1; j >= 0; j--) {
    if (messages[j]!.role === 'user') {
      const t = messages[j]!.text.replace(/\s+/g, ' ').trim()
      if (t) return t.length > 60 ? t.slice(0, 57) + '…' : t
    }
  }
  const op = messages[i]?.ops?.find((o) => o.status === 'applied')
  return op ? `Edited ${op.path.split('/').pop()}` : 'Project update'
}

/** The checkpoint a version card links to (Restore / Diff). */
export const versionCheckpoint = (m: VersionMsg): string | undefined => m.checkpointAfter
