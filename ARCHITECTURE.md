# UnQStudio Architecture

UnQStudio is a pure static SPA (Vite + React 19 + TypeScript strict + Tailwind v4 + Zustand). The code is split into five
layers that talk only through TypeScript interfaces, so each layer can be replaced without touching the others.

| Layer | Path | Port (interface) | Default implementation |
|-------|------|------------------|------------------------|
| Storage / VFS | `src/core/vfs/` | `IStorageAdapter` | `IdbAdapter` (IndexedDB via `idb`), `MemoryAdapter` (tests) |
| Runtime | `src/core/runtime/` | `IRuntimeEngine` | `EsbuildWasmEngine` |
| AI | `src/core/ai/` | `IAIProvider` (registry) | OpenAI-compatible + Anthropic streaming adapters |
| Deploy | `src/core/deploy/` | per-connector modules | GitHub, GitLab, Cloudflare, Netlify, Vercel, Supabase REST |
| UI | `src/ui/`, `src/store/` | – | React components + Zustand slices |

Rules: `core/*` never imports from `ui/*`; UI talks to core through stores/hooks.

## Decisions (ADR-style)

1. **Vite SPA with hash routing** (`#/p/<id>`): works from any static host or sub-path with zero rewrite rules (`_redirects` is still shipped for Cloudflare).
2. **Paths are absolute VFS paths** (`/src/App.tsx`). Folders are implicit; empty folders are persisted via a `.keep` file.
3. **Locks are project metadata** (files or folder prefixes). They gate only the `ai` actor – users can always edit.
4. **Checkpoints form a linear timeline** with a pointer (`historyPtr`). Undo/redo move the pointer, restoring any checkpoint first
   checkpoints unsaved edits, so no state is ever lost. Snapshots are gzip-compressed (`CompressionStream`) JSON.
5. **Tailwind in the preview** uses the official Tailwind v4 browser runtime; generated projects are real Vite + Tailwind projects on export.
6. **npm packages in the preview** are resolved through `esm.sh` by an esbuild plugin and cached in memory + IndexedDB.
7. **Settings** live in `localStorage` (small, synchronous); heavy data (projects, chats, checkpoints, vault) lives in IndexedDB.

## Data flow

```
 user prompt ─► AI orchestrator ─► provider stream ─► artifact parser ─► patch engine ─► VFS (lock check) ─► checkpoint
                                                                                        │
 VFS change event ─► debounce(250ms) ─► IRuntimeEngine.build() ─► srcdoc ─► sandboxed iframe ─► postMessage logs/errors
```

(Runtime, AI and deploy sections are extended in the milestones that introduce them; see `PROGRESS.md`.)

## Layer details

### `core/vfs`
`VirtualFileSystem` = write-through cache over `IStorageAdapter`; emits change events for `useSyncExternalStore`. Locks are project metadata and gate only `actor: 'ai'`.
Checkpoints form a linear timeline (`historyPtr`); `undo/redo/restore` first checkpoint unsaved edits. `backup.ts` serialises everything (checkpoint payloads as base64) for the Data tab.

### `core/runtime`
```
files ─► compileProject(esbuild, input, fetcher)
           ├ plugin "vfs":  entry · ./ ../ @/ / · ext + index probing · CSS→<style> (Tailwind detected) · assets→data URLs
           └ plugin "http": bare imports → https://esm.sh/pkg@ver?external=react,react-dom (React shared) · cached
        ─► assembleHtml(index.html, bundle, bridge, tailwind-browser)  ─► iframe srcdoc (sandbox, opaque origin)
```
**Extending: a new runtime.** Implement `IRuntimeEngine { id, name, init(), build(input), dispose() }` returning `BuildResult.html`, then `registerRuntime(async () => new MyEngine())`.
UI and AI layers only call `getRuntime().build()`.

### `core/ai`
```
prompt ─► buildMessages(system + protocol + file tree/contents + history) ─► streamChat(provider) ─► ArtifactStreamParser
       ─► applyOp (lock check, patch engine) or approval tray ─► checkpoint(before/after) ─► chat store
```
**Extending: a new provider.** Add a `ProviderDef` to `PROVIDERS` (`kind: 'openai'` for any `/chat/completions` SSE API, or `'anthropic'`). For a new wire format add a request
builder + chunk parser in `stream.ts` returning `StreamChunk`s (`text | reasoning | usage`). Users can also declare OpenAI-compatible providers from Settings → Features without code.

### Messaging bridge (preview ⇄ host)
iframe → host: `console`, `error`, `resource-error`, `ready`, `inspect:select`, `screenshot`. host → iframe: `inspect:enable`, `inspect:apply`, `theme`, `theme-css`, `screenshot`.

### Quality gates
Vitest covers VFS, locks, checkpoints, ZIP, resolver, real esbuild compilation (Node), parser (split at every offset), patches, vault crypto, adapters, mocked deploy APIs,
and compiles + `tsc --strict`-checks every template. `scripts/e2e.mjs` drives headless Chromium through Home → template → live preview → Code Mode → theme → settings → mobile.
