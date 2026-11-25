import { useSettings } from '@/store/settings'
import { blank } from './blank'
import type { Template } from './types'

export const BUILTIN_TEMPLATES: Template[] = [blank]

export function getAllTemplates(): Template[] {
  const custom = useSettings.getState().plugins.templates.map<Template>((t) => ({ id: `plugin:${t.id}`, name: t.name, description: t.description, icon: 'puzzle', tags: ['plugin'], files: t.files }))
  return [...BUILTIN_TEMPLATES, ...custom]
}
export const getTemplate = (id: string) => getAllTemplates().find((t) => t.id === id) ?? blank
export type { Template }
