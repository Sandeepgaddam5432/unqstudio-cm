import type { VirtualFileSystem } from '@/core/vfs/vfs'
import type { ThemeTokens } from '@/core/vfs/scaffold'
import { parseTheme, writeFontLink, writeTheme } from '@/core/runtime/theme'

/** Persist theme tokens into the project: /src/index.css theme block + Google Fonts link in /index.html. */
export async function applyThemeToProject(vfs: VirtualFileSystem, tokens: ThemeTokens) {
  const css = vfs.read('/src/index.css') ?? '@import "tailwindcss";\n'
  const prev = parseTheme(css)
  const edits: Record<string, string> = { '/src/index.css': writeTheme(css, tokens) }
  const html = vfs.read('/index.html')
  if (html && (!prev || prev.font !== tokens.font)) edits['/index.html'] = writeFontLink(html, tokens.font)
  await vfs.writeMany(edits, { actor: 'user' })
}
