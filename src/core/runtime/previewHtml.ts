import { BRIDGE_SCRIPT } from './bridgeScript'

export const TAILWIND_BROWSER_URL = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4'

export interface AssembleInput {
  indexHtml?: string
  js: string
  title?: string
  bridge: boolean
  tailwind: boolean
}

export function escapeInlineScript(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}

const SKELETON = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Preview</title></head>
  <body><div id="root"></div></body>
</html>`

/** Combines the project's index.html with the compiled bundle (and the dev bridge) into a single srcdoc-ready document. */
export function assembleHtml({ indexHtml, js, bridge, tailwind }: AssembleInput): string {
  let html = indexHtml && indexHtml.trim() ? indexHtml : SKELETON
  // drop local module entry scripts – the bundle is inlined instead
  html = html.replace(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'](?!https?:)[^"']+["'][^>]*>\s*<\/script>/gi, '')
  let head = ''
  if (bridge) head += `<script>${BRIDGE_SCRIPT}</script>\n`
  if (tailwind) head += `<script src="${TAILWIND_BROWSER_URL}"></script>\n`
  if (head) {
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${head}`)
    else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`)
    else html = head + html
  }
  const mod = `<script type="module">\n${escapeInlineScript(js)}\n</script>`
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${mod}\n</body>`) : html + mod
  return html
}

/** Wrapper page for the pop-out tab: the user's code stays inside a sandboxed (opaque-origin) iframe. */
export function popoutWrapper(html: string, title = 'UnQStudio preview'): string {
  const esc = html.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox="allow-scripts allow-forms allow-modals allow-popups" srcdoc="${esc}"></iframe></body></html>`
}
