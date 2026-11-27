/** Tiny dependency-free syntax tokenizer for chat code blocks (JS/TS/JSX/CSS/HTML/JSON/shell/py). */
export type TokKind = 'kw' | 'str' | 'num' | 'com' | 'tag' | 'fn' | 'plain'
export interface Tok { t: TokKind; v: string }
const KW = new Set('const let var function return if else for while do import from export default class extends new async await try catch finally throw type interface enum true false null undefined this switch case break continue of in typeof instanceof as void def pass lambda None True False self elif with yield static public private readonly implements'.split(' '))
const RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?:^|\s)#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(<\/?[A-Za-z][\w:-]*)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)/g

export function highlight(code: string, lang = ''): Tok[] {
  const out: Tok[] = []
  const noHash = /^(?:js|jsx|ts|tsx|javascript|typescript|css|json|html|diff)$/i.test(lang)
  let last = 0
  for (const m of code.matchAll(RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ t: 'plain', v: code.slice(last, i) })
    const v = m[0]
    if (m[1]) {
      if (/^\s?#/.test(v) && noHash) out.push({ t: 'plain', v })
      else out.push({ t: 'com', v })
    } else if (m[2]) out.push({ t: 'str', v })
    else if (m[3]) out.push({ t: 'tag', v })
    else if (m[4]) out.push({ t: 'num', v })
    else if (m[5]) out.push({ t: KW.has(v) ? 'kw' : code[i + v.length] === '(' ? 'fn' : 'plain', v })
    last = i + v.length
  }
  if (last < code.length) out.push({ t: 'plain', v: code.slice(last) })
  return out
}
