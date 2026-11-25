import { SplitPane } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { HistoryPanel } from './HistoryPanel'
import { Preview } from '@/ui/preview/Preview'
import { useLiveBuild } from '@/ui/preview/useLiveBuild'

export function WorkspaceBody() {
  const mode = useApp((s) => s.mode)
  const vfs = useWorkspace((s) => s.vfs)
  useVfsVersion(vfs)
  useLiveBuild(vfs)
  return (
    <SplitPane
      storageKey="body-m3"
      initial={0.34}
      first={
        <div className="flex h-full flex-col">
          <div className="max-h-[45%] overflow-auto border-b border-line p-4 font-mono text-xs">
            <p className="mb-2 font-sans text-sm text-muted">{mode === 'studio' ? 'Studio' : 'Code'} mode · {vfs?.size()} files</p>
            {vfs?.paths().map((p) => <div key={p}>{p}{vfs.isLocked(p) ? ' 🔒' : ''}</div>)}
          </div>
          <div className="min-h-0 flex-1"><HistoryPanel /></div>
        </div>
      }
      second={<Preview />}
    />
  )
}
