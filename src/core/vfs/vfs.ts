import { uid } from '@/lib/util'
import { hashSnapshot, pack, unpack } from './compress'
import type {
  CheckpointKind, CheckpointMeta, Encoding, FileDiff, FileRecord, IStorageAdapter, ProjectMeta, Snapshot,
} from './types'

export type Actor = 'user' | 'ai' | 'system'
export interface WriteOptions { actor?: Actor; encoding?: Encoding }
export interface SearchOptions { caseSensitive?: boolean; regex?: boolean; wholeWord?: boolean; maxHits?: number }
export interface SearchHit { path: string; line: number; col: number; length: number; text: string }

export class FileLockedError extends Error {
  constructor(public path: string, public lockedBy: string) {
    super(`File is locked: ${path}${lockedBy !== path ? ` (via locked folder ${lockedBy})` : ''}`)
    this.name = 'FileLockedError'
  }
}

export function normalizePath(input: string): string {
  const parts: string[] = []
  for (const seg of input.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') { parts.pop(); continue }
    parts.push(seg)
  }
  return '/' + parts.join('/')
}

export const isUnder = (path: string, folder: string) => path === folder || path.startsWith(folder === '/' ? '/' : folder + '/')
export const dirnameOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'
export const basenameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)

const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|pdf|zip)$/i
export const isBinaryPath = (p: string) => BINARY_EXT.test(p)

export function buildSearchRegex(query: string, opts: SearchOptions = {}): RegExp {
  let src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (opts.wholeWord) src = `\\b(?:${src})\\b`
  return new RegExp(src, opts.caseSensitive ? 'g' : 'gi')
}

export function diffSnapshots(before: Snapshot, after: Snapshot): FileDiff[] {
  const out: FileDiff[] = []
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const path of [...paths].sort()) {
    const b = before[path]
    const a = after[path]
    if (!b && a) out.push({ path, status: 'added', after: a.c })
    else if (b && !a) out.push({ path, status: 'removed', before: b.c })
    else if (b && a && (b.c !== a.c || b.e !== a.e)) out.push({ path, status: 'modified', before: b.c, after: a.c })
  }
  return out
}

/**
 * Per-project virtual file system. Keeps a write-through in-memory cache over an IStorageAdapter,
 * emits change events (useSyncExternalStore friendly), enforces AI file locks and owns the checkpoint timeline.
 */
export class VirtualFileSystem {
  private files = new Map<string, FileRecord>()
  private listeners = new Set<() => void>()
  private cps: CheckpointMeta[] = []
  private _version = 0
  private hashCache: { v: number; h: string } | null = null
  meta: ProjectMeta

  private constructor(readonly adapter: IStorageAdapter, meta: ProjectMeta) {
    this.meta = meta
  }

  static async open(adapter: IStorageAdapter, projectId: string): Promise<VirtualFileSystem> {
    const meta = await adapter.getProject(projectId)
    if (!meta) throw new Error(`Project not found: ${projectId}`)
    const vfs = new VirtualFileSystem(adapter, meta)
    for (const r of await adapter.listFiles(projectId)) vfs.files.set(r.path, r)
    vfs.cps = await adapter.listCheckpoints(projectId)
    return vfs
  }

  get projectId() { return this.meta.id }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getVersion = () => this._version
  private emit() { this._version++; this.listeners.forEach((l) => l()) }
  private async saveMeta() { this.meta.updatedAt = Date.now(); await this.adapter.putProject({ ...this.meta, locks: [...this.meta.locks] }) }

  /* ── reads ─────────────────────────────────────────────── */
  paths(): string[] { return [...this.files.keys()].sort() }
  has(path: string) { return this.files.has(normalizePath(path)) }
  read(path: string): string | undefined { return this.files.get(normalizePath(path))?.content }
  getRecord(path: string) { return this.files.get(normalizePath(path)) }
  isFolder(path: string) { const p = normalizePath(path); return [...this.files.keys()].some((k) => k.startsWith(p + '/')) }
  size() { return this.files.size }

  snapshot(): Snapshot {
    const s: Snapshot = {}
    for (const [p, r] of this.files) s[p] = { c: r.content, e: r.encoding }
    return s
  }
  /** utf8 files only – what compilers and the AI see. */
  textFiles(): Record<string, string> {
    const o: Record<string, string> = {}
    for (const [p, r] of this.files) if (r.encoding === 'utf8') o[p] = r.content
    return o
  }
  binaryFiles(): Record<string, string> {
    const o: Record<string, string> = {}
    for (const [p, r] of this.files) if (r.encoding === 'base64') o[p] = r.content
    return o
  }

  async setName(name: string) {
    this.meta.name = name.trim() || this.meta.name
    await this.saveMeta()
    this.emit()
  }

  /* ── locking ───────────────────────────────────────────── */
  getLocks() { return [...this.meta.locks] }
  lockedBy(path: string): string | null {
    const p = normalizePath(path)
    return this.meta.locks.find((l) => isUnder(p, l)) ?? null
  }
  isLocked(path: string) { return this.lockedBy(path) !== null }
  async lock(path: string) {
    const p = normalizePath(path)
    if (!this.meta.locks.includes(p)) this.meta.locks = [...this.meta.locks, p]
    await this.saveMeta()
    this.emit()
  }
  async unlock(path: string) {
    const p = normalizePath(path)
    this.meta.locks = this.meta.locks.filter((l) => l !== p)
    await this.saveMeta()
    this.emit()
  }
  private assertWritable(path: string, actor?: Actor) {
    if (actor !== 'ai') return
    const by = this.lockedBy(path)
    if (by) throw new FileLockedError(path, by)
  }

  /* ── writes ────────────────────────────────────────────── */
  async write(path: string, content: string, opts: WriteOptions = {}) {
    const p = normalizePath(path)
    if (p === '/') throw new Error('Invalid file path')
    this.assertWritable(p, opts.actor)
    const rec: FileRecord = { projectId: this.projectId, path: p, content, encoding: opts.encoding ?? (isBinaryPath(p) ? 'base64' : 'utf8'), updatedAt: Date.now() }
    this.files.set(p, rec)
    await this.adapter.putFiles([rec])
    await this.saveMeta()
    this.emit()
  }

  async writeMany(entries: Record<string, string>, opts: WriteOptions = {}) {
    const recs: FileRecord[] = []
    for (const [path, content] of Object.entries(entries)) {
      const p = normalizePath(path)
      this.assertWritable(p, opts.actor)
      recs.push({ projectId: this.projectId, path: p, content, encoding: opts.encoding ?? 'utf8', updatedAt: Date.now() })
    }
    for (const r of recs) this.files.set(r.path, r)
    await this.adapter.putFiles(recs)
    await this.saveMeta()
    this.emit()
  }

  async mkdir(path: string) { await this.write(normalizePath(path) + '/.keep', '', { actor: 'user' }) }

  async remove(path: string, opts: WriteOptions = {}) {
    const p = normalizePath(path)
    const targets = [...this.files.keys()].filter((k) => isUnder(k, p))
    if (!targets.length) return 0
    for (const t of targets) this.assertWritable(t, opts.actor)
    for (const t of targets) this.files.delete(t)
    this.meta.locks = this.meta.locks.filter((l) => !isUnder(l, p))
    await this.adapter.deleteFiles(this.projectId, targets)
    await this.saveMeta()
    this.emit()
    return targets.length
  }

  async rename(from: string, to: string, opts: WriteOptions = {}) {
    const a = normalizePath(from)
    const b = normalizePath(to)
    if (a === b) return
    const targets = [...this.files.keys()].filter((k) => isUnder(k, a))
    if (!targets.length) throw new Error(`Nothing at ${a}`)
    if ([...this.files.keys()].some((k) => isUnder(k, b))) throw new Error(`${b} already exists`)
    for (const t of targets) this.assertWritable(t, opts.actor)
    const moved: FileRecord[] = []
    for (const t of targets) {
      const old = this.files.get(t)!
      const np = b + t.slice(a.length)
      moved.push({ ...old, path: np, updatedAt: Date.now() })
    }
    for (const t of targets) this.files.delete(t)
    for (const m of moved) this.files.set(m.path, m)
    this.meta.locks = this.meta.locks.map((l) => (isUnder(l, a) ? b + l.slice(a.length) : l))
    await this.adapter.deleteFiles(this.projectId, targets)
    await this.adapter.putFiles(moved)
    await this.saveMeta()
    this.emit()
  }
  move(from: string, toFolder: string, opts: WriteOptions = {}) {
    return this.rename(from, normalizePath(toFolder) + '/' + basenameOf(normalizePath(from)), opts)
  }

  async duplicate(path: string): Promise<string> {
    const a = normalizePath(path)
    const isFile = this.files.has(a)
    let target: string
    if (isFile) {
      const dot = a.lastIndexOf('.')
      const slash = a.lastIndexOf('/')
      const stem = dot > slash ? a.slice(0, dot) : a
      const ext = dot > slash ? a.slice(dot) : ''
      target = `${stem} copy${ext}`
      for (let i = 2; this.files.has(target); i++) target = `${stem} copy ${i}${ext}`
    } else {
      target = `${a} copy`
      for (let i = 2; this.isFolder(target); i++) target = `${a} copy ${i}`
    }
    const recs: FileRecord[] = []
    for (const [k, r] of this.files) if (isUnder(k, a)) recs.push({ ...r, path: target + k.slice(a.length), updatedAt: Date.now() })
    if (!recs.length) throw new Error(`Nothing at ${a}`)
    for (const r of recs) this.files.set(r.path, r)
    await this.adapter.putFiles(recs)
    await this.saveMeta()
    this.emit()
    return target
  }

  /* ── search ────────────────────────────────────────────── */
  search(query: string, opts: SearchOptions = {}): SearchHit[] {
    if (!query) return []
    const re = buildSearchRegex(query, opts)
    const max = opts.maxHits ?? 1000
    const hits: SearchHit[] = []
    for (const path of this.paths()) {
      const rec = this.files.get(path)!
      if (rec.encoding !== 'utf8' || path.endsWith('/.keep')) continue
      const lines = rec.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(lines[i])) !== null) {
          if (m[0] === '') { re.lastIndex++; continue }
          hits.push({ path, line: i + 1, col: m.index + 1, length: m[0].length, text: lines[i].slice(0, 400) })
          if (hits.length >= max) return hits
        }
      }
    }
    return hits
  }

  async replaceAll(query: string, replacement: string, opts: SearchOptions & { onlyPaths?: string[] } = {}) {
    const re = buildSearchRegex(query, opts)
    let replacements = 0
    const changed: Record<string, string> = {}
    const skippedLocked: string[] = []
    for (const path of this.paths()) {
      if (opts.onlyPaths && !opts.onlyPaths.includes(path)) continue
      const rec = this.files.get(path)!
      if (rec.encoding !== 'utf8') continue
      re.lastIndex = 0
      if (!re.test(rec.content)) continue
      if (this.isLocked(path)) { skippedLocked.push(path); continue }
      re.lastIndex = 0
      let n = 0
      const next = rec.content.replace(re, () => { n++; return replacement })
      if (n) { replacements += n; changed[path] = next }
    }
    if (Object.keys(changed).length) await this.writeMany(changed, { actor: 'user' })
    return { files: Object.keys(changed).length, replacements, skippedLocked }
  }

  /* ── bulk state ────────────────────────────────────────── */
  private async applySnapshot(snap: Snapshot) {
    const del = [...this.files.keys()].filter((p) => !snap[p])
    const put: FileRecord[] = []
    for (const [p, e] of Object.entries(snap)) {
      const cur = this.files.get(p)
      if (!cur || cur.content !== e.c || cur.encoding !== e.e) put.push({ projectId: this.projectId, path: p, content: e.c, encoding: e.e, updatedAt: Date.now() })
    }
    for (const d of del) this.files.delete(d)
    for (const r of put) this.files.set(r.path, r)
    await this.adapter.deleteFiles(this.projectId, del)
    await this.adapter.putFiles(put)
  }

  /* ── checkpoints / time travel ─────────────────────────── */
  listCheckpoints(): CheckpointMeta[] { return [...this.cps] }
  currentHash(): string {
    if (!this.hashCache || this.hashCache.v !== this._version) this.hashCache = { v: this._version, h: hashSnapshot(this.snapshot()) }
    return this.hashCache.h
  }
  isDirty(): boolean {
    const cur = this.cps[this.meta.historyPtr]
    return !cur || cur.hash !== this.currentHash()
  }

  async checkpoint(label: string, kind: CheckpointKind = 'manual'): Promise<CheckpointMeta> {
    const snap = this.snapshot()
    const hash = hashSnapshot(snap)
    const cur = this.cps[this.meta.historyPtr]
    if (kind === 'auto' && cur && cur.hash === hash) return cur
    const payload = await pack(snap)
    let bytes = 0
    for (const e of Object.values(snap)) bytes += e.c.length
    const meta: CheckpointMeta = {
      id: uid('c_'), projectId: this.projectId, label, kind, createdAt: Date.now(),
      fileCount: Object.keys(snap).length, bytes, seq: (this.cps[this.cps.length - 1]?.seq ?? 0) + 1, hash,
    }
    await this.adapter.putCheckpoint(meta, payload)
    this.cps.push(meta)
    this.meta.historyPtr = this.cps.length - 1
    await this.saveMeta()
    this.emit()
    return meta
  }

  async getCheckpointSnapshot(id: string): Promise<Snapshot> {
    const payload = await this.adapter.getCheckpointPayload(id)
    if (!payload) throw new Error('Checkpoint data missing')
    return unpack(payload)
  }

  private async jumpTo(index: number) {
    const cp = this.cps[index]
    await this.applySnapshot(await this.getCheckpointSnapshot(cp.id))
    this.meta.historyPtr = index
    await this.saveMeta()
    this.emit()
  }

  canUndo() { return this.isDirty() ? this.cps.length > 0 : this.meta.historyPtr > 0 }
  canRedo() { return !this.isDirty() && this.meta.historyPtr < this.cps.length - 1 }

  async undo(): Promise<boolean> {
    if (this.isDirty()) await this.checkpoint('Manual edits', 'auto')
    const ptr = this.meta.historyPtr
    if (ptr <= 0) return false
    await this.jumpTo(ptr - 1)
    return true
  }
  async redo(): Promise<boolean> {
    if (this.isDirty()) return false
    const ptr = this.meta.historyPtr
    if (ptr >= this.cps.length - 1) return false
    await this.jumpTo(ptr + 1)
    return true
  }

  /** Restore an arbitrary checkpoint. Unsaved edits are checkpointed first so nothing is ever lost. */
  async restore(id: string) {
    const idx = this.cps.findIndex((c) => c.id === id)
    if (idx < 0) throw new Error('Unknown checkpoint')
    if (this.isDirty()) await this.checkpoint('Before restore', 'restore')
    const target = this.cps.findIndex((c) => c.id === id)
    await this.jumpTo(target)
  }

  async deleteCheckpoint(id: string) {
    const idx = this.cps.findIndex((c) => c.id === id)
    if (idx < 0) return
    await this.adapter.deleteCheckpoint(id)
    this.cps.splice(idx, 1)
    if (this.meta.historyPtr >= idx) this.meta.historyPtr = Math.max(-1, this.meta.historyPtr - 1)
    await this.saveMeta()
    this.emit()
  }

  async diffAgainstCheckpoint(id: string): Promise<FileDiff[]> {
    return diffSnapshots(await this.getCheckpointSnapshot(id), this.snapshot())
  }
}
