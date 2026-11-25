import { useEffect, useRef } from 'react'
import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { tags as t } from '@lezer/highlight'
import type { Reveal } from '@/store/workspace'

const External = Annotation.define<boolean>()

function lang(path: string): Extension {
  if (/\.tsx$/.test(path)) return javascript({ jsx: true, typescript: true })
  if (/\.ts$/.test(path)) return javascript({ typescript: true })
  if (/\.(jsx|mjs|cjs)$/.test(path)) return javascript({ jsx: true })
  if (/\.js$/.test(path)) return javascript({ jsx: true })
  if (/\.css$/.test(path)) return css()
  if (/\.html?$/.test(path)) return html()
  if (/\.json$/.test(path)) return json()
  if (/\.mdx?$/.test(path)) return markdown()
  return []
}

const palette = (d: boolean) => ({
  keyword: d ? '#ff9e80' : '#c2410c', string: d ? '#a5d6a7' : '#15803d', number: d ? '#ffcc80' : '#b45309', comment: d ? '#71717a' : '#a1a1aa',
  fn: d ? '#90caf9' : '#1d4ed8', type: d ? '#80cbc4' : '#0f766e', tag: d ? '#f48fb1' : '#be123c', attr: d ? '#ffe082' : '#a16207',
})
const highlight = (d: boolean) => {
  const c = palette(d)
  return syntaxHighlighting(HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: c.keyword },
    { tag: [t.string, t.special(t.string), t.regexp], color: c.string },
    { tag: [t.number, t.bool, t.null, t.atom], color: c.number },
    { tag: [t.comment, t.lineComment, t.blockComment], color: c.comment, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: c.fn },
    { tag: [t.typeName, t.className, t.namespace], color: c.type },
    { tag: [t.tagName, t.angleBracket], color: c.tag },
    { tag: [t.attributeName, t.propertyName], color: c.attr },
    { tag: t.heading, fontWeight: '600' },
    { tag: t.link, textDecoration: 'underline' },
  ]))
}

const base = EditorView.theme({
  '&': { color: 'var(--c-fg)', backgroundColor: 'transparent', height: '100%' },
  '.cm-content': { caretColor: 'var(--c-accent)', padding: '8px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--c-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--c-fg) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--c-fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--c-accent) 26%, transparent) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--c-accent)' },
  '.cm-panels': { backgroundColor: 'var(--c-panel)', color: 'var(--c-fg)', borderColor: 'var(--c-line)' },
  '.cm-panel input, .cm-panel button': { fontSize: '12px' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--c-warn) 30%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--c-accent) 40%, transparent)' },
  '.cm-tooltip': { backgroundColor: 'var(--c-panel)', border: '1px solid var(--c-line)', borderRadius: '8px' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--c-subtle)', border: 'none', color: 'var(--c-muted)' },
})

interface Props {
  path: string
  value: string
  dark: boolean
  onChange: (doc: string) => void
  isDirty: () => boolean
  reveal: Reveal | null
}

export default function CodeEditor({ path, value, dark, onChange, isDirty, reveal }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const hl = useRef(new Compartment())
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), foldGutter(), history(), drawSelection(), dropCursor(), indentOnInput(), bracketMatching(), closeBrackets(),
          autocompletion(), highlightActiveLine(), highlightSelectionMatches(), EditorState.tabSize.of(2), EditorView.lineWrapping,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab]),
          lang(path), base, hl.current.of(highlight(dark)),
          EditorView.updateListener.of((u) => { if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External))) cb.current(u.state.doc.toString()) }),
        ],
      }),
    })
    view.current = v
    return () => { v.destroy(); view.current = null }
  }, [path])

  useEffect(() => {
    const v = view.current
    if (!v) return
    if (v.state.doc.toString() !== value && !isDirty()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: External.of(true) })
    }
  }, [value])

  useEffect(() => { view.current?.dispatch({ effects: hl.current.reconfigure(highlight(dark)) }) }, [dark])

  useEffect(() => {
    const v = view.current
    if (!v || !reveal || reveal.path !== path) return
    const line = v.state.doc.line(Math.min(Math.max(1, reveal.line), v.state.doc.lines))
    const pos = Math.min(line.from + Math.max(0, reveal.col - 1), line.to)
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    v.focus()
  }, [reveal?.nonce, path])

  return <div ref={host} className="h-full overflow-hidden" />
}
