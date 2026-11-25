/** Helpers for reasoning about module specifiers in user projects. */
export function isBareSpecifier(spec: string): boolean {
  if (!spec) return false
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('~/')) return false
  if (/^(https?:|data:|blob:|node:)/.test(spec)) return false
  return true
}

/** `@scope/pkg/sub` → `@scope/pkg`; `pkg/sub` → `pkg`. */
export function packageNameOf(spec: string): string {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

export function subpathOf(spec: string): string {
  const name = packageNameOf(spec)
  return spec.slice(name.length)
}

const IMPORT_RE = /(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

export function collectImports(source: string): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(IMPORT_RE)) {
    const s = m[1] ?? m[2]
    if (s) out.add(s)
  }
  return [...out]
}

export function collectBareImports(source: string): string[] {
  return collectImports(source).filter(isBareSpecifier).map(packageNameOf)
}
