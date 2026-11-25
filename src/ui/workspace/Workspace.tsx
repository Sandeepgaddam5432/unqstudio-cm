import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useWorkspace, useVfsVersion } from '@/store/workspace'
import { useApp } from '@/store/app'
import { Button, EmptyState } from '@/ui/primitives'
import { navigateHome } from '@/store/app'
import { TopBar } from './TopBar'
import { PublishModal } from '@/ui/publish/PublishModal'
import { WorkspaceBody } from './Body'
import { useChatController } from '@/ui/chat/useChatController'

export default function Workspace({ projectId }: { projectId: string }) {
  const { vfs, loading, error, open } = useWorkspace()
  useVfsVersion(vfs)
  const setProjectId = useApp((s) => s.setProjectId)
  useChatController()

  useEffect(() => {
    setProjectId(projectId)
    void open(projectId)
  }, [projectId])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title="Project not found">
          <p className="mb-3">{error}</p>
          <Button variant="primary" onClick={navigateHome}>Back to projects</Button>
        </EmptyState>
      </div>
    )
  }
  if (loading || !vfs) {
    return <div className="flex h-full items-center justify-center text-muted"><Loader2 className="animate-spin-fast" /></div>
  }
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="min-h-0 flex-1"><WorkspaceBody /></div>
      <PublishModal />
    </div>
  )
}
