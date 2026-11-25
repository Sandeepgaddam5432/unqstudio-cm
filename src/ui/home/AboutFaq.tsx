import { ChevronDown } from 'lucide-react'

/** Single source of truth for the visible FAQ. Mirrored (kept in sync by hand) in the FAQPage JSON-LD of index.html. */
export const FAQ: { q: string; a: string }[] = [
  { q: 'What is UnQStudio?', a: 'UnQStudio is a free, browser-native AI coding studio. You describe an app in plain language, an AI model you choose writes the code, and it compiles live in a sandboxed preview — all inside your browser tab.' },
  { q: 'Does UnQStudio have a backend?', a: 'No. It is a static site hosted on Cloudflare Pages. Projects live in your browser (IndexedDB), builds run with esbuild-wasm, and AI requests go directly from your browser to the provider you pick. Optional edge functions only power the models.dev registry and GitHub sign-in.' },
  { q: 'Is it really free, and what does BYOK mean?', a: 'UnQStudio is free. BYOK means “bring your own key”: you paste an API key from OpenAI, Anthropic, Google, OpenRouter, Groq, Ollama or any other supported provider, and you pay that provider directly (many have free tiers).' },
  { q: 'Are my API keys and code private?', a: 'Yes. Keys are stored only on your device in IndexedDB and can be encrypted with a passphrase (PBKDF2 → AES-GCM-256 via Web Crypto). Your code never touches a UnQStudio server.' },
  { q: 'Which AI models and providers are supported?', a: 'Every provider in the open models.dev registry (300+ providers, thousands of models). When you enter a key, UnQStudio fetches that provider’s live model list automatically. Browser-ready, local (Ollama, LM Studio) and gateway-only providers are clearly tagged.' },
  { q: 'What is the difference between Studio mode and Code mode?', a: 'Studio mode is chat-first: talk to the AI beside a live preview. Code mode is a full editor on the same project — file tree with locks, CodeMirror 6, search, diff viewer and console. Switch any time with Ctrl/⌘+E.' },
]

/** Minimal, collapsible About & FAQ footer (semantic landmark; also gives crawlers and answer engines readable text). */
export function AboutFaq() {
  return (
    <footer className="border-t border-line" aria-label="About UnQStudio">
      <details className="group mx-auto w-full max-w-6xl px-4 py-4 sm:px-8" data-about-faq>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs text-muted transition-colors duration-150 hover:text-fg [&::-webkit-details-marker]:hidden">
          <span>About &amp; FAQ — what is UnQStudio?</span>
          <ChevronDown size={14} className="transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <div className="grid gap-8 pb-6 pt-5 lg:grid-cols-[1fr_2fr]">
          <section aria-labelledby="about-h">
            <h2 id="about-h" className="text-sm font-semibold tracking-tight">About UnQStudio</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">UnQStudio is a free, open, browser-native AI coding studio by UnQTools. It compiles React apps in your browser with esbuild-wasm, supports 300+ AI providers through the models.dev registry, and keeps your code and keys on your device.</p>
            <nav aria-label="Resources" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a className="text-accent hover:underline" href="llms.txt">llms.txt</a>
              <a className="text-accent hover:underline" href="https://github.com/Sandeepgaddam5432/unqstudio-cm" target="_blank" rel="noreferrer noopener">Source on GitHub</a>
              <a className="text-accent hover:underline" href="https://unqtools.pages.dev" target="_blank" rel="noreferrer noopener">UnQTools</a>
            </nav>
          </section>
          <section aria-labelledby="faq-h">
            <h2 id="faq-h" className="text-sm font-semibold tracking-tight">Frequently asked questions</h2>
            <dl className="mt-2 space-y-3">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="text-xs font-medium">{f.q}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </details>
    </footer>
  )
}
