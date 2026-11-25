import { useSettings } from '@/store/settings'
import { aichat } from './aichat'
import { blank } from './blank'
import { blog } from './blog'
import { dashboard } from './dashboard'
import { kanban } from './kanban'
import { portfolio } from './portfolio'
import { saas } from './saas'
import { store } from './store'
import type { Template } from './types'

/** Order shown on the Home screen; Blank first so the default chip is the clean starter. */
export const BUILTIN_TEMPLATES: Template[] = [blank, saas, dashboard, portfolio, store, aichat, kanban, blog]

export function getAllTemplates(): Template[] {
  const custom = useSettings.getState().plugins.templates.map<Template>((t) => ({ id: `plugin:${t.id}`, name: t.name, description: t.description, icon: 'puzzle', tags: ['plugin'], files: t.files }))
  return [...BUILTIN_TEMPLATES, ...custom]
}
export const getTemplate = (id: string) => getAllTemplates().find((t) => t.id === id) ?? blank
export type { Template }
