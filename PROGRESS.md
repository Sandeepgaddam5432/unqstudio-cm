# PROGRESS

- [x] **M1** Scaffold, design system, Home, workspace shell, docs foundation
- [ ] M2 VFS: checkpoints UI, locks UI, ZIP import, local folder sync, tests
- [ ] M3 esbuild-wasm runtime + preview
- [ ] M4 AI orchestrator
- [ ] M5 Code Mode, diff viewer, inspector, theme studio
- [ ] M6 Templates + settings hub
- [ ] M7 Deploy hub
- [ ] M8 Hardening + docs

## M1 notes
Delivered: Vite/React/TS strict/Tailwind v4/Vitest/ESLint, Cloudflare `_redirects` + `_headers`, primitives, Home (composer, template chips,
project grid with search/pin/duplicate/rename/delete), workspace shell (inline rename, Studio↔Code toggle `⌘E`, undo/redo/checkpoint, palette `⌘K`,
theme, settings drawer, publish/export ZIP). The VFS core (CRUD, locks, checkpoints, ZIP) already exists; its tests and UI land in M2.
The Studio/Code panels in `ui/workspace/Body.tsx` are a placeholder file list until M3–M5 replace them.
