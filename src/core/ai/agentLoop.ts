import { parseArtifacts } from './parser'
import type { BuildStep } from './buildSteps'

/**
 * Bounded multi-step agent loop (v3.0). Pure orchestration over injected tools so it runs against the real VFS and
 * esbuild-wasm in the app and against scripted fakes in tests. Backward compatible with the streaming XML artifact
 * format: file tags (<create_file>/<update_file>/<patch_file>/<delete_file>) are applied exactly as before, then the
 * build is verified; the loop only continues when verification fails or the model asks to inspect something.
 *
 * Read-only tools are self-closing tags the model may emit:
 *   <read_file path="/src/App.tsx" />   <list_files />   <search_project query="useState" />   <verify_build />
 */
export type AgentTool = 'read_file' | 'list_files' | 'search_project' | 'verify_build' | 'create_file' | 'update_file' | 'patch_file' | 'delete_file'
export interface ToolCall { tool: 'read_file' | 'list_files' | 'search_project' | 'verify_build'; path?: string; query?: string }
export interface AgentError { message: string; file?: string; line?: number }
export type EditStatus = 'applied' | 'skipped-locked' | 'failed'
export interface AgentPrompt { step: number; max: number; observations: string[] }
export interface AgentStep { id: string; tool: AgentTool | 'model'; label: string; state: 'active' | 'done' | 'error'; path?: string }
export type AgentStatus = 'green' | 'max-steps' | 'aborted' | 'answered'

export interface AgentDeps {
  /** One model turn. `applied` = file edits the caller already applied itself (when `applyOp` is not provided). */
  model: (p: AgentPrompt) => Promise<{ text: string; applied?: number }>
  readFile: (path: string) => string | undefined
  listFiles: () => string[]
  search: (query: string) => { path: string; line: number; text: string }[]
  /** When provided the loop applies parsed file artifacts itself (locks are enforced by this callback). */
  applyOp?: (op: 'create' | 'update' | 'patch' | 'delete', path: string, content: string) => Promise<{ status: EditStatus | string; detail?: string }>
  verify: () => Promise<{ ok: boolean; errors: AgentError[] }>
  isAborted?: () => boolean
  onStep?: (s: AgentStep) => void
}
export interface AgentOptions { maxSteps: number; /** Verify the build before the first model call (edits were already applied by the caller). */ startWithVerify?: boolean }
export interface AgentResult { status: AgentStatus; stepsUsed: number; applied: number; skippedLocked: string[]; errors: AgentError[]; steps: AgentStep[] }

export const clampAgentSteps = (n: unknown): number => { const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 3; return Math.min(5, Math.max(1, v)) }

const READ_CAP = 12_000
const TOOL_TAG = /<(read_file|list_files|search_project|verify_build)\b([^>]*?)\/?>/g
const attrOf = (attrs: string, name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`).exec(attrs)?.[1]

/** Extract read-only tool requests from raw model text (file-writing tags are handled by the artifact parser). */
export function parseToolCalls(text: string): ToolCall[] {
  const out: ToolCall[] = []
  for (const m of text.matchAll(TOOL_TAG)) {
    const tool = m[1] as ToolCall['tool']
    out.push({ tool, path: attrOf(m[2]!, 'path'), query: attrOf(m[2]!, 'query') })
  }
  return out
}

export const formatErrors = (errors: AgentError[]) => errors.slice(0, 8).map((e) => `- ${e.file ? `${e.file}${e.line ? `:${e.line}` : ''} ` : ''}${e.message}`).join('\n')

export const AGENT_TOOLS_PROMPT = `You are in an autonomous build loop. You may request project information instead of guessing, using self-closing tags:
<read_file path="/src/App.tsx" />  <list_files />  <search_project query="text" />  <verify_build />
You will receive the results as OBSERVATIONS in the next message. To change code use the usual <create_file>/<update_file>/<patch_file>/<delete_file> tags; locked files cannot be modified. After your edits the build is compiled automatically; if it fails you receive the exact errors — fix them. Stop requesting tools once the build is green.`

export async function runAgentLoop(deps: AgentDeps, opts: AgentOptions): Promise<AgentResult> {
  const max = clampAgentSteps(opts.maxSteps)
  const steps: AgentStep[] = []
  const skippedLocked: string[] = []
  let applied = 0, errors: AgentError[] = [], lastOk: boolean | null = null, seq = 0
  const emit = (s: Omit<AgentStep, 'id'>): AgentStep => { const st = { ...s, id: `ag${++seq}` }; steps.push(st); deps.onStep?.(st); return st }
  const finish = (status: AgentStatus, used: number): AgentResult => ({ status, stepsUsed: used, applied, skippedLocked, errors, steps })
  const aborted = () => !!deps.isAborted?.()
  const verify = async () => {
    const pending = emit({ tool: 'verify_build', label: 'Verifying build…', state: 'active' })
    const v = await deps.verify()
    const done: AgentStep = { ...pending, label: v.ok ? 'Build verified — green' : `Build failed (${v.errors.length} error${v.errors.length === 1 ? '' : 's'})`, state: v.ok ? 'done' : 'error' }
    steps[steps.indexOf(pending)] = done
    deps.onStep?.(done)
    lastOk = v.ok; errors = v.ok ? [] : v.errors
    return v
  }

  let obs: string[] = []
  if (opts.startWithVerify) {
    if (aborted()) return finish('aborted', 0)
    const v = await verify()
    if (v.ok) return finish('green', 0)
    obs.push(`BUILD FAILED:\n${formatErrors(v.errors)}`)
  }

  for (let step = 1; step <= max; step++) {
    if (aborted()) return finish('aborted', step - 1)
    emit({ tool: 'model', label: `Agent step ${step}/${max}`, state: 'active' })
    const turn = await deps.model({ step, max, observations: obs })
    steps[steps.length - 1] = { ...steps[steps.length - 1]!, state: 'done' }
    if (aborted()) return finish('aborted', step)
    obs = []
    let edits = turn.applied ?? 0
    let inspected = false, wantVerify = false

    for (const c of parseToolCalls(turn.text)) {
      if (c.tool === 'verify_build') { wantVerify = true; continue }
      inspected = true
      if (c.tool === 'read_file') {
        const body = c.path ? deps.readFile(c.path) : undefined
        emit({ tool: 'read_file', label: `Reading ${c.path ?? '?'}`, state: body === undefined ? 'error' : 'done', path: c.path })
        obs.push(body === undefined ? `read_file ${c.path}: FILE NOT FOUND` : `read_file ${c.path}:\n${body.length > READ_CAP ? body.slice(0, READ_CAP) + '\n…truncated…' : body}`)
      } else if (c.tool === 'list_files') {
        const all = deps.listFiles()
        emit({ tool: 'list_files', label: `Listing files (${all.length})`, state: 'done' })
        obs.push(`list_files:\n${all.slice(0, 300).join('\n')}`)
      } else {
        const hits = deps.search(c.query ?? '').slice(0, 20)
        emit({ tool: 'search_project', label: `Searching “${c.query ?? ''}” (${hits.length})`, state: 'done' })
        obs.push(`search_project "${c.query}":\n${hits.map((h) => `${h.path}:${h.line}: ${h.text.trim().slice(0, 160)}`).join('\n') || '(no matches)'}`)
      }
    }

    if (deps.applyOp) {
      for (const ev of parseArtifacts(turn.text)) {
        const op = ev.type === 'file-end' && ev.complete ? ev.op : ev.type === 'delete' ? 'delete' : null
        if (!op || (ev.type !== 'file-end' && ev.type !== 'delete')) continue
        const path = ev.path
        const content = ev.type === 'file-end' ? ev.content : ''
        const r = await deps.applyOp(op, path, content)
        if (r.status === 'applied') { edits++; applied++; emit({ tool: `${op}_file` as AgentTool, label: `${op === 'create' ? 'Creating' : op === 'delete' ? 'Deleting' : op === 'patch' ? 'Patching' : 'Updating'} ${path}`, state: 'done', path }) }
        else if (r.status === 'skipped-locked') { skippedLocked.push(path); emit({ tool: `${op}_file` as AgentTool, label: `Skipped locked ${path}`, state: 'error', path }); obs.push(`EDIT REJECTED: ${path} is LOCKED and cannot be modified. Do not retry; work around it.`) }
        else { emit({ tool: `${op}_file` as AgentTool, label: `Failed ${path}`, state: 'error', path }); obs.push(`EDIT FAILED for ${path}: ${r.detail ?? 'unknown error'}`) }
      }
    } else applied += edits

    if (edits > 0 || wantVerify) {
      if (aborted()) return finish('aborted', step)
      const v = await verify()
      if (v.ok) { if (!inspected) return finish('green', step); obs.push('BUILD OK after your edits.') }
      else obs.push(`BUILD FAILED:\n${formatErrors(v.errors)}`)
      continue
    }
    if (inspected || obs.length) continue
    return finish(lastOk === true ? 'green' : 'answered', step)
  }
  return finish(lastOk === true && errors.length === 0 ? 'green' : 'max-steps', max)
}

/** Convert loop steps to BuildActivityCard rows. */
export function agentStepsToBuild(steps: AgentStep[]): BuildStep[] {
  return steps.filter((s) => s.tool !== 'model').map((s) => ({ id: s.id, label: s.label, state: s.state === 'active' ? 'active' : s.state === 'error' ? 'error' : 'done', path: s.tool.endsWith('_file') && s.state === 'done' ? s.path : undefined }))
}
