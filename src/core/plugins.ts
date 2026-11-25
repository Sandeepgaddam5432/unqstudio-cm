import type { McpConnector, PluginProvider, PluginRegistry, PluginTemplate, PluginTheme } from '@/store/settings'

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const id = (v: unknown, fallback: string) => str(v).trim().replace(/[^a-zA-Z0-9_-]/g, '-') || fallback

/** Validate + normalise a declarative plugin registry (themes, templates, OpenAI-compatible providers, MCP connectors). */
export function parseRegistry(input: unknown): PluginRegistry {
  const r = (input ?? {}) as Record<string, unknown>
  const arr = (k: string): Record<string, unknown>[] => (Array.isArray(r[k]) ? (r[k] as Record<string, unknown>[]) : [])
  const themes: PluginTheme[] = arr('themes').map((t, i) => {
    const color = (v: unknown, d: string) => (/^#[0-9a-f]{6}$/i.test(str(v)) ? str(v) : d)
    return { id: id(t.id, `theme-${i}`), name: str(t.name, `Theme ${i + 1}`), accent: color(t.accent, '#e5481b'), bg: color(t.bg, '#fafafa'), surface: color(t.surface, '#ffffff'), fg: color(t.fg, '#09090b'), radius: Math.min(48, Math.max(0, Number(t.radius) || 12)), font: str(t.font, 'Inter') }
  })
  const templates: PluginTemplate[] = arr('templates').map((t, i) => {
    const files = t.files && typeof t.files === 'object' ? (t.files as Record<string, unknown>) : {}
    const clean: Record<string, string> = {}
    for (const [p, c] of Object.entries(files)) if (typeof c === 'string') clean[p.startsWith('/') ? p : '/' + p] = c
    if (!clean['/src/App.tsx'] && !clean['/src/main.tsx']) throw new Error(`Template “${str(t.name, String(i))}” needs at least /src/App.tsx or /src/main.tsx`)
    return { id: id(t.id, `tpl-${i}`), name: str(t.name, `Template ${i + 1}`), description: str(t.description), files: clean }
  })
  const providers: PluginProvider[] = arr('providers').map((p, i) => {
    const baseUrl = str(p.baseUrl)
    if (!/^https?:\/\//.test(baseUrl)) throw new Error(`Provider “${str(p.name, String(i))}” needs an http(s) baseUrl`)
    return { id: id(p.id, `prov-${i}`), name: str(p.name, `Provider ${i + 1}`), baseUrl, models: Array.isArray(p.models) ? (p.models as unknown[]).map(String) : [] }
  })
  const mcp: McpConnector[] = arr('mcp').map((m, i) => {
    const url = str(m.url)
    if (!/^https?:\/\//.test(url)) throw new Error(`MCP connector “${str(m.name, String(i))}” needs an http(s) url`)
    const headers: Record<string, string> = {}
    if (m.headers && typeof m.headers === 'object') for (const [k, v] of Object.entries(m.headers as Record<string, unknown>)) headers[k] = String(v)
    return { id: id(m.id, `mcp-${i}`), name: str(m.name, `Connector ${i + 1}`), url, transport: m.transport === 'sse' ? 'sse' : 'http', headers, enabled: m.enabled !== false }
  })
  return { themes, templates, providers, mcp }
}
