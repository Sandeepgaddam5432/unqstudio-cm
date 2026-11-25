# HANDOFF (post v1.0)

Commands: `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` (Chromium + system libs: libnspr4, libnss3, libatk, libgbm, libxkbcommon, libasound, …).

## Conventions
- `src/core/*` is UI-free; talk to it through interfaces (`IStorageAdapter`, `IRuntimeEngine`, provider registry). Absolute VFS paths (`/src/App.tsx`). Locks gate only `actor: 'ai'`.
- Never commit tokens. Push with an ephemeral `http.extraheader`; keep `git remote -v` clean.

## Roadmap v1.1+
1. Live-provider smoke tests behind opt-in env keys (CI) and an LLM-driven E2E.
2. Pre-built Tailwind CSS in the preview/deploy bundle (WASM Tailwind compiler) to drop the CDN dependency.
3. Source-mapped runtime errors (esbuild sourcemaps → file:line in the banner).
4. WebContainer / remote-sandbox `IRuntimeEngine` for Node-only packages and `npm install`.
5. Use enabled MCP tools as agent tools (tool-calling loop) – today connectors are configured and probed only.
6. Multi-file inspector edits via AST (replace class-string matching), per-element undo.
7. Collaboration: export/import checkpoints as git-style patches; chat-fork tree view.
