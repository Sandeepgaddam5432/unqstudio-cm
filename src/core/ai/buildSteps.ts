/** Derives the live step list for the BuildActivityCard from streamed ops + preview/heal state (pure, unit-tested). */
export type StepState = 'done' | 'active' | 'error' | 'pending'
export interface BuildStep { id: string; label: string; state: StepState; path?: string }
export interface StepOp { id: string; op: 'create' | 'update' | 'patch' | 'delete'; path: string; status: string; added?: number; removed?: number }
export interface StepInput {
  ops: StepOp[]
  streaming: boolean
  previewStatus: 'idle' | 'initializing' | 'building' | 'ready' | 'error'
  healing?: boolean
  /** Extra agent-loop steps (read_file, verify_build, …) rendered between the edits and compilation. */
  agent?: BuildStep[]
}

const VERB = { create: 'Creating', update: 'Rewriting', patch: 'Editing', delete: 'Deleting' } as const

export function deriveSteps(i: StepInput): BuildStep[] {
  const steps: BuildStep[] = [{ id: 'map', label: 'Reading project map', state: 'done' }]
  for (const o of i.ops) {
    const diff = o.status === 'applied' && o.op !== 'delete' ? ` +${o.added ?? 0}/-${o.removed ?? 0}` : ''
    const state: StepState = o.status === 'streaming' ? 'active' : o.status === 'applied' ? 'done' : o.status === 'pending' ? 'pending' : 'error'
    const label = o.status === 'skipped-locked' ? `Skipped locked ${o.path}` : o.status === 'interrupted' ? `Interrupted ${o.path}` : o.status === 'failed' ? `Failed ${o.path}` : `${VERB[o.op]} ${o.path}${diff}`
    steps.push({ id: o.id, label, state, path: o.path })
  }
  if (i.agent) steps.push(...i.agent)
  const applied = i.ops.some((o) => o.status === 'applied')
  if (applied) {
    const building = i.previewStatus === 'building' || i.previewStatus === 'initializing'
    steps.push({ id: 'compile', label: building ? 'Compiling preview…' : i.previewStatus === 'error' ? 'Compile failed' : 'Compiled preview', state: building ? 'active' : i.previewStatus === 'error' ? 'error' : 'done' })
  }
  if (i.healing) steps.push({ id: 'heal', label: 'Auto-healing…', state: 'active' })
  if (!i.streaming && !i.healing && applied && i.previewStatus === 'ready') steps.push({ id: 'ready', label: 'Preview ready', state: 'done' })
  if (i.streaming && !i.ops.length && !i.agent?.length) steps[0] = { ...steps[0]!, state: 'active' }
  return steps
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
