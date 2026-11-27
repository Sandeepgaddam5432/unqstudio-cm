import { useEffect } from 'react'
import { WorkspaceSkeleton } from '@/ui/primitives/Skeleton'
import { useWorkspace, useVfsVersion } from '@/store/workspace'
import { useApp } from '@/store/app'
import { Button, EmptyState } from '@/ui/primitives'
import { navigateHome } from '@/store/app'
import { TopBar } from './TopBar'
import { ProjectSwitcher } from './ProjectSwitcher'
import { useVisualViewport } from '@/ui/hooks/useVisualViewport'
import { PublishSheet } from '@/ui/publish/PublishSheet'
import { ProjectSettings } from '@/ui/project/ProjectSettings'
import { WorkspaceBody } from './Body'
import { useChatController } from '@/ui/chat/useChatController'

export default function Workspace({ projectId }: { projectId: string }) {
  const { vfs, loading, error, open } = useWorkspace()
  useVfsVersion(vfs)
  const setProjectId = useApp((s) => s.setProjectId)
  useChatController()
  useVisualViewport()

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
    return <WorkspaceSkeleton />
  }
  return (
    <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-bg" style={{ paddingBottom: 'var(--kb-inset, 0px)' }} data-workspace-root>
      <TopBar />
      <div className="min-h-0 min-w-0 flex-1"><WorkspaceBody /></div>
      <PublishSheet />
      <ProjectSettings />
      <ProjectSwitcher />
    </div>
  )
}
