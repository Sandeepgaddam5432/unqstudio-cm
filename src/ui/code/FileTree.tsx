import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, File, FileCode2, FilePlus, FileText, Folder, FolderOpen, FolderPlus, Image as ImageIcon, Lock, MoreHorizontal, Pencil, Pin, Trash2, Unlock, Upload, FileJson, ChevronsDownUp } from 'lucide-react'
import { Button, ConfirmModal, Dropdown, Tooltip } from '@/ui/primitives'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { basenameOf, dirnameOf, isBinaryPath, isUnder, normalizePath } from '@/core/vfs/vfs'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'
import { fileToDataUrl } from '@/lib/util'

interface TNode { name: string; path: string; dir: boolean; children: TNode[] }

function buildTree(paths: string[]): TNode {
  const root: TNode = { name: '', path: '/', dir: true, children: [] }
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean)
    let cur = root
    parts.forEach((seg, i) => {
      const path = '/' + parts.slice(0, i + 1).join('/')
      const last = i === parts.length - 1
      if (last && seg === '.keep') return
      let n = cur.children.find((c) => c.name === seg)
      if (!n) { n = { name: seg, path, dir: !last, children: [] }; cur.children.push(n) }
      cur = n
    })
  }
  const sort = (n: TNode) => { n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)); n.children.forEach(sort) }
  sort(root)
  return root
}

function icon(n: TNode, open: boolean) {
  if (n.dir) return open ? <FolderOpen size={14} className="text-accent/80" /> : <Folder size={14} className="text-muted" />
  if (/\.(tsx?|jsx?|mjs)$/.test(n.name)) return <FileCode2 size={14} className="text-muted" />
  if (/\.json$/.test(n.name)) return <FileJson size={14} className="text-muted" />
  if (/\.(png|jpe?g|gif|webp|svg|ico|avif)$/.test(n.name)) return <ImageIcon size={14} className="text-muted" />
  if (/\.(md|txt)$/.test(n.name)) return <FileText size={14} className="text-muted" />
  return <File size={14} className="text-muted" />
}

type Editing = { kind: 'file' | 'folder'; parent: string } | { kind: 'rename'; path: string } | null

export function FileTree() {
  const vfs = useWorkspace((s) => s.vfs)
  const { openFile, activeFile, pinned, togglePin, closeFile, openTabs } = useWorkspace()
  useVfsVersion(vfs)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/', '/src']))
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const paths = vfs?.paths() ?? []
  const tree = useMemo(() => buildTree(paths), [paths.join('\n')])
  if (!vfs) return null

  const toggle = (p: string) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })
  const expand = (p: string) => setExpanded((s) => new Set(s).add(p))
  const err = (title: string) => (e: unknown) => toast.error(title, e instanceof Error ? e.message : String(e))

  const commit = async (name: string) => {
    const ed = editing
    setEditing(null)
    const n = name.trim()
    if (!ed || !n) return
    try {
      if (ed.kind === 'rename') {
        const to = normalizePath(`${dirnameOf(ed.path)}/${n}`)
        await vfs.rename(ed.path, to)
        if (openTabs.includes(ed.path)) { closeFile(ed.path); openFile(to) }
      } else {
        const p = normalizePath(`${ed.parent}/${n}`)
        if (ed.kind === 'folder') { await vfs.mkdir(p); expand(p) } else {
          if (vfs.has(p)) throw new Error(`${p} already exists`)
          await vfs.write(p, '', { actor: 'user' })
          openFile(p)
        }
        expand(ed.parent)
      }
    } catch (e) { err('Could not apply')(e) }
  }

  const doUpload = async (files: FileList) => {
    for (const f of Array.from(files)) {
      const p = normalizePath(`/${isBinaryPath(f.name) ? 'public/' : 'src/'}${f.name}`)
      try {
        if (isBinaryPath(f.name)) await vfs.write(p, (await fileToDataUrl(f)).split(',')[1], { actor: 'user', encoding: 'base64' })
        else await vfs.write(p, await f.text(), { actor: 'user' })
        toast.success('Uploaded', p)
      } catch (e) { err('Upload failed')(e) }
    }
  }

  const NameInput = ({ initial, depth }: { initial: string; depth: number }) => (
    <div style={{ paddingLeft: 10 + depth * 12 }} className="py-0.5 pr-2">
      <input autoFocus defaultValue={initial} onFocus={(e) => e.target.select()} onBlur={(e) => void commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }}
        className="h-6 w-full rounded border border-accent/60 bg-subtle px-1.5 text-xs outline-none" aria-label="Name" />
    </div>
  )

  const renderNode = (n: TNode, depth: number): React.ReactNode => {
    const open = expanded.has(n.path)
    const locked = vfs.isLocked(n.path)
    const lockedDirect = vfs.getLocks().includes(n.path)
    const isPinned = pinned.includes(n.path)
    if (editing?.kind === 'rename' && editing.path === n.path) return <NameInput key={n.path} initial={n.name} depth={depth} />
    return (
      <div key={n.path}>
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/unq-path', n.path)}
          onDragOver={(e) => { if (n.dir) { e.preventDefault(); setDropTarget(n.path) } }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={async (e) => {
            e.preventDefault(); setDropTarget(null)
            const src = e.dataTransfer.getData('text/unq-path')
            if (!src || !n.dir || src === n.path || isUnder(n.path, src)) return
            try { await vfs.move(src, n.path); expand(n.path) } catch (er) { err('Move failed')(er) }
          }}
          style={{ paddingLeft: 6 + depth * 12 }}
          className={cn('group flex h-7 cursor-pointer items-center gap-1 rounded-md pr-1 text-[13px]', activeFile === n.path ? 'bg-subtle text-fg' : 'text-muted hover:bg-subtle/70 hover:text-fg', dropTarget === n.path && 'ring-1 ring-accent')}
          onClick={() => (n.dir ? toggle(n.path) : openFile(n.path))}
        >
          <span className="w-3 shrink-0 text-faint">{n.dir ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
          {icon(n, open)}
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          {isPinned && <Tooltip label="Pinned to AI context"><Pin size={10} className="shrink-0 text-accent" /></Tooltip>}
          {locked && <Tooltip label={lockedDirect ? 'Locked — AI cannot modify' : 'Locked via parent folder'}><Lock size={11} className={cn('shrink-0', lockedDirect ? 'text-warn' : 'text-warn/50')} /></Tooltip>}
          <span onClick={(e) => e.stopPropagation()} className="opacity-0 focus-within:opacity-100 group-hover:opacity-100">
            <Dropdown
              align="end"
              width={200}
              trigger={<button className="rounded p-0.5 hover:bg-panel" aria-label={`Actions for ${n.name}`}><MoreHorizontal size={13} /></button>}
              items={[
                ...(n.dir ? [
                  { label: 'New file', icon: <FilePlus size={14} />, onSelect: () => { expand(n.path); setEditing({ kind: 'file', parent: n.path }) } },
                  { label: 'New folder', icon: <FolderPlus size={14} />, onSelect: () => { expand(n.path); setEditing({ kind: 'folder', parent: n.path }) } },
                  { separator: true },
                ] : []),
                { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setEditing({ kind: 'rename', path: n.path }) },
                { label: 'Duplicate', icon: <Copy size={14} />, onSelect: () => void vfs.duplicate(n.path).catch(err('Duplicate failed')) },
                { label: lockedDirect ? 'Unlock for AI' : 'Lock from AI', icon: lockedDirect ? <Unlock size={14} /> : <Lock size={14} />, onSelect: () => void (lockedDirect ? vfs.unlock(n.path) : vfs.lock(n.path)) },
                { label: isPinned ? 'Unpin from AI context' : 'Pin to AI context', icon: <Pin size={14} />, onSelect: () => togglePin(n.path) },
                { separator: true },
                { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(n.path) },
              ]}
            />
          </span>
        </div>
        {n.dir && open && (
          <>
            {editing && editing.kind !== 'rename' && editing.parent === n.path && <NameInput initial="" depth={depth + 1} />}
            {n.children.map((c) => renderNode(c, depth + 1))}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-2">
        <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Explorer</span>
        <div className="flex items-center">
          <Tooltip label="New file"><Button variant="ghost" size="icon-sm" onClick={() => setEditing({ kind: 'file', parent: '/' })} aria-label="New file"><FilePlus size={14} /></Button></Tooltip>
          <Tooltip label="New folder"><Button variant="ghost" size="icon-sm" onClick={() => setEditing({ kind: 'folder', parent: '/' })} aria-label="New folder"><FolderPlus size={14} /></Button></Tooltip>
          <Tooltip label="Upload files"><Button variant="ghost" size="icon-sm" onClick={() => upload.current?.click()} aria-label="Upload files"><Upload size={14} /></Button></Tooltip>
          <Tooltip label="Collapse all"><Button variant="ghost" size="icon-sm" onClick={() => setExpanded(new Set(['/']))} aria-label="Collapse all"><ChevronsDownUp size={14} /></Button></Tooltip>
          <input ref={upload} type="file" multiple hidden onChange={(e) => { if (e.target.files) void doUpload(e.target.files); e.target.value = '' }} />
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto p-1.5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          if (e.dataTransfer.files.length) { e.preventDefault(); void doUpload(e.dataTransfer.files); return }
          const src = e.dataTransfer.getData('text/unq-path')
          if (src && dirnameOf(src) !== '/') try { await vfs.move(src, '/') } catch (er) { err('Move failed')(er) }
        }}
      >
        {editing && editing.kind !== 'rename' && editing.parent === '/' && <NameInput initial="" depth={0} />}
        {tree.children.map((c) => renderNode(c, 0))}
        {tree.children.length === 0 && <p className="p-4 text-center text-xs text-muted">Empty project. Create a file, upload files, or ask the AI.</p>}
      </div>
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        danger
        title="Delete from project?"
        message={<>“{deleting && basenameOf(deleting)}” will be removed. You can undo this from the top bar or restore a checkpoint.</>}
        confirmLabel="Delete"
        onConfirm={async () => { if (deleting) { await vfs.checkpoint('Before delete', 'auto'); await vfs.remove(deleting); for (const t of openTabs) if (isUnder(t, deleting)) closeFile(t) } }}
      />
    </div>
  )
}
