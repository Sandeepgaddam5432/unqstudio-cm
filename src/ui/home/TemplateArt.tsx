import type { ArtKind } from '@/templates/showcase'

/** Styled miniature "screenshot" artwork for a showcase template (pure SVG, themed by hue, never a broken image). */
export function TemplateArt({ kind, hue, className }: { kind: ArtKind; hue: number; className?: string }) {
  const a = `hsl(${hue} 85% 58%)`
  const soft = `hsl(${hue} 85% 58% / .18)`
  const line = 'var(--c-line-strong)'
  const ink = 'var(--c-faint)'
  const body = (() => {
    switch (kind) {
      case 'landing': return <><rect x="14" y="12" width="40" height="5" rx="2.5" fill={ink} /><rect x="130" y="12" width="14" height="5" rx="2.5" fill={a} /><rect x="40" y="36" width="120" height="9" rx="4" fill="var(--c-fg)" opacity=".85" /><rect x="60" y="52" width="80" height="5" rx="2.5" fill={ink} /><rect x="82" y="66" width="36" height="12" rx="6" fill={a} />{[0, 1, 2].map((i) => <rect key={i} x={16 + i * 59} y="92" width="53" height="36" rx="6" fill={soft} stroke={line} />)}</>
      case 'dashboard': return <><rect x="0" y="0" width="34" height="140" fill={soft} />{[0, 1, 2, 3].map((i) => <rect key={i} x="8" y={14 + i * 14} width="18" height="5" rx="2.5" fill={i === 0 ? a : ink} />)}{[0, 1, 2].map((i) => <rect key={i} x={44 + i * 52} y="12" width="46" height="26" rx="5" fill="var(--c-panel)" stroke={line} />)}<rect x="44" y="48" width="148" height="80" rx="6" fill="var(--c-panel)" stroke={line} />{[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={54 + i * 20} y={112 - (i * 37 % 46) - 14} width="12" height={(i * 37 % 46) + 14} rx="2" fill={i % 2 ? soft : a} />)}</>
      case 'store': return <>{[0, 1, 2, 3, 4, 5].map((i) => <g key={i}><rect x={14 + (i % 3) * 60} y={14 + Math.floor(i / 3) * 62} width="52" height="38" rx="6" fill={soft} stroke={line} /><rect x={14 + (i % 3) * 60} y={56 + Math.floor(i / 3) * 62} width="34" height="4" rx="2" fill={ink} /><rect x={14 + (i % 3) * 60} y={64 + Math.floor(i / 3) * 62} width="18" height="4" rx="2" fill={a} /></g>)}</>
      case 'portfolio': return <><circle cx="100" cy="34" r="18" fill={a} opacity=".85" /><rect x="64" y="58" width="72" height="7" rx="3.5" fill="var(--c-fg)" opacity=".85" /><rect x="76" y="71" width="48" height="4" rx="2" fill={ink} />{[0, 1, 2].map((i) => <rect key={i} x={16 + i * 60} y="90" width="54" height="40" rx="6" fill={i === 1 ? a : soft} opacity={i === 1 ? '.7' : '1'} />)}</>
      case 'chat': return <><rect x="14" y="14" width="96" height="22" rx="10" fill={soft} stroke={line} /><rect x="90" y="44" width="96" height="22" rx="10" fill={a} opacity=".85" /><rect x="14" y="74" width="120" height="30" rx="10" fill={soft} stroke={line} /><rect x="14" y="114" width="172" height="16" rx="8" fill="var(--c-panel)" stroke={line} /></>
      case 'kanban': return <>{[0, 1, 2].map((c) => <g key={c}><rect x={12 + c * 62} y="12" width="56" height="118" rx="6" fill={soft} />{[0, 1, 2].slice(0, 3 - c % 2).map((r) => <rect key={r} x={17 + c * 62} y={20 + r * 34} width="46" height="28" rx="5" fill="var(--c-panel)" stroke={line} />)}</g>)}</>
      case 'blog': return <><rect x="14" y="14" width="172" height="46" rx="6" fill={soft} /><rect x="14" y="70" width="110" height="7" rx="3.5" fill="var(--c-fg)" opacity=".85" />{[0, 1, 2, 3].map((i) => <rect key={i} x="14" y={86 + i * 10} width={172 - i * 18} height="4" rx="2" fill={ink} />)}</>
    }
  })()
  return <svg viewBox="0 0 200 140" role="img" aria-label={`${kind} template artwork`} className={className} preserveAspectRatio="xMidYMid slice"><rect width="200" height="140" fill="var(--c-bg)" />{body}</svg>
}
