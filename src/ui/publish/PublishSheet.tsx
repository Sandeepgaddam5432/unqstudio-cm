import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Cloud, Copy, Database, Download, ExternalLink, GitBranch, Globe, QrCode, Share2, X } from 'lucide-react'
import { BottomSheet, Button, Input, Label, Tabs, Textarea } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { applySeo, faviconHref, readSeo } from '@/core/deploy/seo'
import { qrSvg } from '@/lib/qrcode'
import { useIsMobile } from '@/lib/useMedia'
import { haptic } from '@/lib/haptics'
import { toast } from '@/store/toast'
import { DownloadTab } from './DownloadTab'
import { GitTab } from './GitTab'
import { DeployTab } from './DeployTab'
import { SupabaseTab } from './SupabaseTab'

type Tab = 'publish' | 'seo' | 'download' | 'git' | 'supabase'
type Host = 'cloud' | 'pages' | 'zip'

export const isHttpUrl = (s: string) => { try { const u = new URL(s.trim()); return u.protocol === 'https:' || u.protocol === 'http:' } catch { return false } }

function LiveUrl({ projectId, url, setUrl }: { projectId: string; url: string; setUrl: (u: string) => void }) {
  const [copied, setCopied] = useState(false)
  const valid = isHttpUrl(url)
  const svg = useMemo(() => (valid ? qrSvg(url.trim(), { label: 'QR code for your live app' }) : ''), [url, valid])
  const save = (v: string) => { setUrl(v); void getAdapter().kvSet(`liveUrl:${projectId}`, v.trim()) }
  return (
    <div data-live-url className="rounded-2xl border border-line bg-subtle/60 p-3">
      <Label>Live URL</Label>
      <div className="flex gap-2">
        <Input value={url} onChange={(e) => save(e.target.value)} placeholder="https://your-app.pages.dev" aria-label="Live URL" spellCheck={false} className="min-w-0 flex-1" />
        <Button size="icon" variant="ghost" disabled={!valid} aria-label="Copy live URL" onClick={() => { void navigator.clipboard?.writeText(url.trim()); setCopied(true); haptic('success'); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}</Button>
        {valid && <a href={url.trim()} target="_blank" rel="noopener noreferrer" aria-label="Open live URL" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-subtle"><ExternalLink size={15} /></a>}
      </div>
      {valid ? (
        <div className="mt-3 flex items-center gap-3">
          <div data-qr className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-line bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-xs text-muted"><span className="mb-1 flex items-center gap-1 font-medium text-fg"><QrCode size={13} />Scan to open on your phone</span>Generated in your browser — nothing is sent anywhere.</p>
        </div>
      ) : <p className="mt-2 text-xs text-faint">Deploy below, or paste an existing URL to get a scannable QR code.</p>}
    </div>
  )
}

function SeoEditor() {
  const vfs = useWorkspace((s) => s.vfs)
  const html = vfs?.has('/index.html') ? vfs.read('/index.html') : ''
  const init = useMemo(() => readSeo(html ?? ''), [html])
  const [seo, setSeo] = useState(init)
  const [saving, setSaving] = useState(false)
  if (!vfs) return null
  const fav = faviconHref(seo.favicon)
  const save = async () => {
    if (!vfs.has('/index.html')) return toast.error('This project has no index.html')
    setSaving(true)
    try {
      await vfs.checkpoint('Before SEO update', 'auto')
      await vfs.write('/index.html', applySeo(vfs.read('/index.html') ?? '', seo), { actor: 'user' })
      toast.success('SEO & share info saved', 'Written to index.html')
    } finally { setSaving(false) }
  }
  return (
    <div data-seo-editor className="space-y-3">
      <div><Label>App title</Label><Input value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} aria-label="App title" /></div>
      <div><Label>Meta description</Label><Textarea rows={3} value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} aria-label="Meta description" /><p className="mt-1 text-[11px] text-faint">{seo.description.length}/160 recommended</p></div>
      <div><Label>Favicon (emoji or image URL)</Label><div className="flex items-center gap-2"><Input value={seo.favicon.startsWith('data:') ? '' : seo.favicon} onChange={(e) => setSeo({ ...seo, favicon: e.target.value })} placeholder="🚀" aria-label="Favicon" className="min-w-0 flex-1" />{fav && <img src={fav} alt="Favicon preview" className="h-8 w-8 rounded border border-line p-1" />}</div></div>
      <div data-og-preview className="overflow-hidden rounded-2xl border border-line">
        <div className="flex h-24 items-center justify-center bg-gradient-to-br from-accent/30 to-fuchsia-500/20 text-3xl">{fav ? <img src={fav} alt="" className="h-10 w-10" /> : <Globe size={28} className="text-muted" />}</div>
        <div className="space-y-0.5 bg-subtle/60 p-3"><p className="text-[10px] uppercase tracking-wide text-faint">your-app.pages.dev</p><p className="truncate text-sm font-semibold">{seo.title || 'Untitled app'}</p><p className="line-clamp-2 text-xs text-muted">{seo.description || 'Add a description so people know what your app does.'}</p></div>
      </div>
      <Button variant="primary" onClick={() => void save()} disabled={saving} className="min-h-[44px] w-full">Save to index.html</Button>
    </div>
  )
}

function Body({ onClose }: { onClose: () => void }) {
  void onClose
  const vfs = useWorkspace((s) => s.vfs)
  const requested = useApp((s) => s.publishTab)
  const [tab, setTab] = useState<Tab>((requested as Tab | null) ?? 'publish')
  const [host, setHost] = useState<Host>('cloud')
  const [url, setUrl] = useState('')
  useEffect(() => { if (requested) setTab(requested as Tab) }, [requested])
  useEffect(() => { if (vfs) void getAdapter().kvGet<string>(`liveUrl:${vfs.meta.id}`).then((u) => { if (u) setUrl(u) }) }, [vfs?.meta.id])
  if (!vfs) return null
  const hosts: { id: Host; label: string; icon: React.ReactNode }[] = [{ id: 'cloud', label: 'Netlify · Vercel · Cloudflare', icon: <Cloud size={13} /> }, { id: 'pages', label: 'GitHub Pages', icon: <GitBranch size={13} /> }, { id: 'zip', label: 'Download ZIP', icon: <Download size={13} /> }]
  const onUrl = (u: string) => { setUrl(u); void getAdapter().kvSet(`liveUrl:${vfs.meta.id}`, u) }
  return (
    <div className="space-y-4">
      <Tabs size="sm" className="scrollbar-none -mx-1 overflow-x-auto border-b border-line" value={tab} onChange={setTab} items={[
        { id: 'publish', label: 'Publish', icon: <Cloud size={13} /> }, { id: 'seo', label: 'Share & SEO', icon: <Share2 size={13} /> },
        { id: 'download', label: 'Download', icon: <Download size={13} /> }, { id: 'git', label: 'Git', icon: <GitBranch size={13} /> }, { id: 'supabase', label: 'Supabase', icon: <Database size={13} /> },
      ]} />
      {tab === 'publish' && (
        <div className="space-y-4">
          <LiveUrl projectId={vfs.meta.id} url={url} setUrl={setUrl} />
          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Deploy target">
            {hosts.map((h) => <button key={h.id} onClick={() => setHost(h.id)} aria-pressed={host === h.id} className={`press flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium ${host === h.id ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-muted hover:text-fg'}`}>{h.icon}{h.label}</button>)}
          </div>
          {host === 'cloud' && <DeployTab goto={() => setTab('git')} onUrl={onUrl} />}
          {host === 'pages' && <GitTab />}
          {host === 'zip' && <DownloadTab />}
        </div>
      )}
      {tab === 'seo' && <SeoEditor />}
      {tab === 'download' && <DownloadTab />}
      {tab === 'git' && <GitTab />}
      {tab === 'supabase' && <SupabaseTab />}
    </div>
  )
}

/** Publish & Share: right-anchored popover on desktop, tall draggable Bottom Sheet on phones. Live URL + QR, deploy targets, SEO editor. */
export function PublishSheet() {
  const { publishOpen, setPublishOpen } = useApp()
  const mobile = useIsMobile()
  const close = () => { setPublishOpen(false); useApp.setState({ publishTab: null }) }
  useEffect(() => {
    if (!publishOpen || mobile) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [publishOpen, mobile])
  if (!publishOpen) return null
  if (mobile) return <BottomSheet open onClose={close} tall title="Publish & Share" description="Deploy, share a QR code and edit SEO."><div data-publish-sheet><Body onClose={close} /></div></BottomSheet>
  return createPortal(
    <div className="fixed inset-0 z-[70]" data-publish-popover>
      <div className="absolute inset-0" onClick={close} />
      <div role="dialog" aria-label="Publish & Share" className="animate-pop absolute right-3 top-[52px] flex max-h-[calc(100dvh-4rem)] w-[min(460px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-pop">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3"><div><h2 className="text-[15px] font-semibold tracking-tight">Publish &amp; Share</h2><p className="text-xs text-muted">Nothing is uploaded unless you choose a destination.</p></div><Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close"><X size={15} /></Button></div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4"><Body onClose={close} /></div>
      </div>
    </div>,
    document.body,
  )
}
