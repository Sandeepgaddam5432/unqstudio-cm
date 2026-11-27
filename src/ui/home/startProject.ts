import { getTemplate } from '@/templates'
import { useProjects } from '@/store/projects'
import { navigateToProject, useApp } from '@/store/app'

export function deriveName(prompt: string) {
  const words = prompt.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).slice(0, 5).join(' ')
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Untitled project'
}

/**
 * Home / New-project entry (v3.3): create the project, queue the first prompt (the workspace renders it as a user bubble immediately and the
 * chat controller streams the reply), pin the mobile workspace to the CHAT pane (never the empty Preview), then navigate.
 */
export async function startProjectFromPrompt(o: { text?: string; images?: string[]; templateId?: string }) {
  const text = (o.text ?? '').trim()
  const tpl = getTemplate(o.templateId ?? 'blank')
  const p = await useProjects.getState().create({ name: text ? deriveName(text) : tpl.name, files: tpl.files, templateId: tpl.id })
  const app = useApp.getState()
  app.setMobilePane('chat')
  app.setPendingPrompt(text ? { text, images: o.images ?? [] } : null)
  navigateToProject(p.id)
  return p
}
