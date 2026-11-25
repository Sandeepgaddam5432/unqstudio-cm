import { Fragment, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (t.startsWith('`')) out.push(<code key={k} className="rounded bg-subtle px-1 py-px font-mono text-[0.85em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('**')) out.push(<strong key={k} className="font-semibold">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('*')) out.push(<em key={k}>{t.slice(1, -1)}</em>)
    else {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!
      out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2">{mm[1]}</a>)
    }
    last = m.index! + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Code({ lang, code }: { lang: string; code: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-line bg-subtle">
      <div className="flex items-center justify-between border-b border-line px-3 py-1 text-[10px] uppercase tracking-wider text-faint">
        {lang || 'code'}
        <button onClick={() => { void navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 1200) }} className="flex items-center gap-1 hover:text-fg" aria-label="Copy code">
          {ok ? <Check size={11} /> : <Copy size={11} />}{ok ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-w-full overflow-auto p-3 font-mono text-[12px] leading-relaxed"><code>{code}</code></pre>
    </div>
  )
}

/** Small, safe markdown renderer (no HTML injection): headings, lists, tables, fences, inline code/bold/italic/links. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const l = lines[i]
    const fence = /^```(\w*)/.exec(l)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      blocks.push(<Code key={k++} lang={fence[1]} code={buf.join('\n')} />)
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const rows: string[][] = []
      const cells = (s: string) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(l)
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]))
      blocks.push(
        <div key={k++} className="my-2 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-subtle"><tr>{head.map((h, j) => <th key={j} className="px-2.5 py-1.5 font-medium">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, a) => <tr key={a} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-2.5 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l)
    if (h) { blocks.push(<p key={k++} className={h[1].length <= 2 ? 'mb-1 mt-3 text-[15px] font-semibold tracking-tight' : 'mb-0.5 mt-2 text-[13px] font-semibold'}>{inline(h[2])}</p>); i++; continue }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))
      const L = ordered ? 'ol' : 'ul'
      blocks.push(<L key={k++} className={`my-1.5 space-y-0.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-faint`}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</L>)
      continue
    }
    if (!l.trim()) { i++; continue }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^```|^#{1,4}\s|^\s*([-*]|\d+\.)\s+|^\s*\|/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={k++} className="my-1 leading-relaxed">{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, String(j))}</Fragment>)}</p>)
  }
  return <div className="min-w-0 text-[1em] text-fg [overflow-wrap:anywhere]">{blocks}</div>
}
