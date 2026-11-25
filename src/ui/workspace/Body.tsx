import { useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'

export function WorkspaceBody() {
  const mode = useApp((s) => s.mode)
  const vfs = useWorkspace((s) => s.vfs)
  useVfsVersion(vfs)
  return (
    <div className="h-full overflow-auto p-6">
      <p className="text-sm text-muted">{mode === 'studio' ? 'Studio' : 'Code'} mode · {vfs?.size()} files</p>
      <ul className="mt-3 font-mono text-xs">{vfs?.paths().map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  )
}
