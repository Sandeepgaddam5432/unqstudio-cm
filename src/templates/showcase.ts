import type { Template } from './index'

export const SHOWCASE_CATEGORIES = ['All', 'SaaS', 'Dashboard', 'E-Commerce', 'Portfolio', 'AI App', 'Productivity', 'Blog'] as const
export type ShowcaseCategory = (typeof SHOWCASE_CATEGORIES)[number]
export type ArtKind = 'landing' | 'dashboard' | 'store' | 'portfolio' | 'chat' | 'kanban' | 'blog'

const CATEGORY: Record<string, { category: ShowcaseCategory; art: ArtKind; hue: number }> = {
  saas: { category: 'SaaS', art: 'landing', hue: 18 },
  dashboard: { category: 'Dashboard', art: 'dashboard', hue: 215 },
  store: { category: 'E-Commerce', art: 'store', hue: 150 },
  portfolio: { category: 'Portfolio', art: 'portfolio', hue: 285 },
  aichat: { category: 'AI App', art: 'chat', hue: 260 },
  kanban: { category: 'Productivity', art: 'kanban', hue: 40 },
  blog: { category: 'Blog', art: 'blog', hue: 340 },
}

export interface ShowcaseItem { template: Template; category: ShowcaseCategory; art: ArtKind; hue: number }

/** Built-in templates (and plugin templates under "Productivity") as showcase items; the blank starter is not showcased. */
export function showcaseItems(templates: Template[]): ShowcaseItem[] {
  return templates.filter((t) => t.id !== 'blank').map((template) => {
    const m = CATEGORY[template.id]
    return { template, category: m?.category ?? 'Productivity', art: m?.art ?? 'kanban', hue: m?.hue ?? 200 }
  })
}

export function filterShowcase(items: ShowcaseItem[], category: ShowcaseCategory): ShowcaseItem[] {
  return category === 'All' ? items : items.filter((i) => i.category === category)
}
