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
