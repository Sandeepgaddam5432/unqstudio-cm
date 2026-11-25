import { collectBareImports } from '@/lib/imports'
import { slugify } from '@/lib/util'

export const THEME_START = '/* unq-theme:start */'
export const THEME_END = '/* unq-theme:end */'

export interface ThemeTokens {
  accent: string
  accentFg: string
  bg: string
  surface: string
  fg: string
  muted: string
  line: string
  radius: number
  font: string
  dark: { accent: string; accentFg: string; bg: string; surface: string; fg: string; muted: string; line: string }
}

export const DEFAULT_THEME: ThemeTokens = {
  accent: '#e5481b', accentFg: '#ffffff', bg: '#fafafa', surface: '#ffffff', fg: '#09090b', muted: '#71717a', line: '#e4e4e7',
  radius: 12, font: 'Inter',
  dark: { accent: '#ff6a3d', accentFg: '#09090b', bg: '#09090b', surface: '#111114', fg: '#fafafa', muted: '#a1a1aa', line: '#27272a' },
}

export function fontStack(font: string) {
  const generic = /mono|code/i.test(font) ? 'ui-monospace, monospace' : /serif|playfair|merriweather|lora|fraunces/i.test(font) && !/sans/i.test(font) ? 'Georgia, serif' : 'ui-sans-serif, system-ui, sans-serif'
  return `"${font}", ${generic}`
}

export function themeBlock(t: ThemeTokens = DEFAULT_THEME): string {
  return `${THEME_START}
:root {
  --accent: ${t.accent};
  --accent-fg: ${t.accentFg};
  --bg: ${t.bg};
  --surface: ${t.surface};
  --fg: ${t.fg};
  --muted: ${t.muted};
  --line: ${t.line};
  --radius: ${t.radius}px;
  --font-body: ${fontStack(t.font)};
}
.dark {
  --accent: ${t.dark.accent};
  --accent-fg: ${t.dark.accentFg};
  --bg: ${t.dark.bg};
  --surface: ${t.dark.surface};
  --fg: ${t.dark.fg};
  --muted: ${t.dark.muted};
  --line: ${t.dark.line};
}
${THEME_END}`
}

export const BASE_CSS = `@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

${themeBlock()}

@theme {
  --color-accent: var(--accent);
  --color-accent-fg: var(--accent-fg);
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --radius-theme: var(--radius);
  --font-sans: var(--font-body);
}

@layer base {
  html { scroll-behavior: smooth; }
  body { background: var(--bg); color: var(--fg); font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
  * { border-color: var(--line); }
}
`

export const FONT_MARK = '<!-- unq-fonts -->'
export const DEFAULT_FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />'

export function indexHtml(title: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.replace(/</g, '&lt;')}</title>
    ${FONT_MARK}${DEFAULT_FONT_LINK}${FONT_MARK}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}

export const MAIN_TSX = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`

const DEFAULT_DEPS: Record<string, string> = { react: '^19.1.0', 'react-dom': '^19.1.0' }
const BUILTIN = new Set(['react', 'react-dom'])

export function packageJson(name: string, deps: Record<string, string> = {}) {
  return JSON.stringify(
    {
      name: slugify(name), private: true, version: '0.0.0', type: 'module',
      scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' },
      dependencies: { ...DEFAULT_DEPS, ...deps },
      devDependencies: {
        '@tailwindcss/vite': '^4.1.0', '@types/react': '^19.1.0', '@types/react-dom': '^19.1.0', '@vitejs/plugin-react': '^5.0.0',
        tailwindcss: '^4.1.0', typescript: '~5.8.0', vite: '^7.0.0',
      },
    },
    null,
    2,
  ) + '\n'
}

export const VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
`

export const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx',
      strict: true, noEmit: true, skipLibCheck: true, isolatedModules: true, esModuleInterop: true, paths: { '@/*': ['./src/*'] }, types: ['vite/client'],
    },
    include: ['src', 'vite.config.ts'],
  },
  null,
  2,
) + '\n'

export function scaffoldFiles(name: string, deps: Record<string, string> = {}): Record<string, string> {
  return {
    '/package.json': packageJson(name, deps),
    '/vite.config.ts': VITE_CONFIG,
    '/tsconfig.json': TSCONFIG,
    '/index.html': indexHtml(name),
    '/src/main.tsx': MAIN_TSX,
    '/src/index.css': BASE_CSS,
    '/src/vite-env.d.ts': '/// <reference types="vite/client" />\n',
    '/.gitignore': 'node_modules\ndist\n.DS_Store\n*.local\n',
    '/README.md': `# ${name}\n\nBuilt with [UnQStudio](https://github.com/Sandeepgaddam5432/unqstudio-cm).\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
  }
}

/** Make sure a file set is a complete, runnable Vite + React + TS + Tailwind project and that package.json lists every imported package. */
export function ensureScaffold(files: Record<string, string>, name: string): Record<string, string> {
  const base = scaffoldFiles(name)
  const out: Record<string, string> = { ...files }
  for (const [p, c] of Object.entries(base)) if (!(p in out)) out[p] = c
  const used = new Set<string>()
  for (const [p, c] of Object.entries(out)) if (/\.(tsx?|jsx?|mjs)$/.test(p) && !p.endsWith('vite.config.ts')) for (const d of collectBareImports(c)) used.add(d)
  try {
    const pkg = JSON.parse(out['/package.json'])
    pkg.dependencies = pkg.dependencies ?? {}
    pkg.devDependencies = pkg.devDependencies ?? {}
    for (const d of used) if (!pkg.dependencies[d] && !pkg.devDependencies[d] && !BUILTIN.has(d)) pkg.dependencies[d] = 'latest'
    for (const d of BUILTIN) if (!pkg.dependencies[d]) pkg.dependencies[d] = DEFAULT_DEPS[d]
    out['/package.json'] = JSON.stringify(pkg, null, 2) + '\n'
  } catch {
    out['/package.json'] = packageJson(name)
  }
  return out
}
