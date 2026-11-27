import { Fragment, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { highlight } from './highlight'

function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (t.startsWith('`')) out.push(<code key={k} className="rounded-md bg-fg/8 px-1.5 py-px font-mono text-[0.86em]">{t.slice(1, -1)}</code>)
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
  const toks = highlight(code, lang)
  return (
    <div data-code-block className="my-3 overflow-hidden rounded-xl border border-line bg-subtle/70">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] font-medium tracking-wide text-fg-tertiary">
        <span className="uppercase">{lang || 'code'}</span>
        <button onClick={() => { void navigator.clipboard?.writeText(code); setOk(true); setTimeout(() => setOk(false), 1200) }} className="flex min-h-[24px] items-center gap-1 rounded-md px-1.5 hover:bg-fg/5 hover:text-fg" aria-label="Copy code">
          {ok ? <Check size={12} /> : <Copy size={12} />}{ok ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-w-full overflow-auto p-3 font-mono text-[12.5px] leading-[1.65]"><code>{toks.map((t, i) => t.t === 'plain' ? t.v : <span key={i} className={`tok-${t.t}`}>{t.v}</span>)}</code></pre>
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
    if (h) { const n = h[1].length; const H = (`h${Math.min(4, n)}`) as 'h1'; blocks.push(<H key={k++} className={n === 1 ? 'mb-2 mt-5 text-[20px] font-semibold leading-tight tracking-tight' : n === 2 ? 'mb-1.5 mt-4 text-[17px] font-semibold leading-snug tracking-tight' : n === 3 ? 'mb-1 mt-3.5 text-[15px] font-semibold' : 'mb-1 mt-3 text-[14px] font-semibold'}>{inline(h[2])}</H>); i++; continue }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { blocks.push(<hr key={k++} className="my-4 border-line" />); i++; continue }
    if (/^>\s?/.test(l)) {
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={k++} className="my-2.5 border-l-2 border-line-strong pl-3 text-fg-secondary">{q.map((x, j) => <p key={j} className="my-0.5">{inline(x)}</p>)}</blockquote>)
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))
      const L = ordered ? 'ol' : 'ul'
      blocks.push(<L key={k++} className={`my-2 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-faint`}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</L>)
      continue
    }
    if (!l.trim()) { i++; continue }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^```|^#{1,4}\s|^>\s?|^\s*([-*]|\d+\.)\s+|^\s*\|/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={k++} className="my-2 leading-[1.65]">{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, String(j))}</Fragment>)}</p>)
  }
  return <div className="min-w-0 text-[1em] text-fg [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0">{blocks}</div>
}
