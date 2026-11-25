import { useState } from 'react'
import { Cloud, Database, Download, GitBranch } from 'lucide-react'
import { Modal, Tabs } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { DownloadTab } from './DownloadTab'
import { GitTab } from './GitTab'
import { DeployTab } from './DeployTab'
import { SupabaseTab } from './SupabaseTab'

type Tab = 'download' | 'git' | 'deploy' | 'supabase'

export function PublishModal() {
  const { publishOpen, setPublishOpen } = useApp()
  const [tab, setTab] = useState<Tab>('download')
  return (
    <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish & Export" description="Everything runs in your browser. Nothing is uploaded unless you choose a destination." size="xl">
      <Tabs size="sm" className="-mx-1 mb-5 border-b border-line" value={tab} onChange={setTab} items={[
        { id: 'download', label: 'Download', icon: <Download size={13} /> }, { id: 'git', label: 'Git', icon: <GitBranch size={13} /> },
        { id: 'deploy', label: 'Deploy', icon: <Cloud size={13} /> }, { id: 'supabase', label: 'Supabase', icon: <Database size={13} /> },
      ]} />
      <div className="min-h-64">
        {tab === 'download' && <DownloadTab />}
        {tab === 'git' && <GitTab />}
        {tab === 'deploy' && <DeployTab goto={setTab} />}
        {tab === 'supabase' && <SupabaseTab />}
      </div>
    </Modal>
  )
}
