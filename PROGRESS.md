# PROGRESS

- [x] **M1** Scaffold, design system, Home, workspace shell, docs
- [x] **M2** VFS: CRUD, locks, checkpoints, ZIP, folder sync, tests
- [x] **M3** esbuild-wasm runtime, sandboxed preview, error catcher
- [x] **M4** AI orchestrator (20 providers, parser, patches, vault, chat UI)
- [x] **M5** Code Mode, diff viewer, inspector, Theme Studio
- [x] **M6** 8 templates + settings hub
- [x] **M7** Deploy hub (GitHub/GitLab/Netlify/Vercel/Cloudflare/Supabase)
- [x] **M8** Hardening, lazy chunks, headless E2E, complete docs

## Verification (v1.0.0)
`npm run test` (all green) · `npx tsc --noEmit` · `npm run lint` · `npm run build` · `npm run e2e` → 15/15 checks (Home, template compile in sandboxed iframe with Tailwind styling, Studio↔Code, theme toggle, palette, settings tabs, 20 providers, Theme Studio, 375 px no-overflow, zero console errors).
Lazy chunks: workspace, settings, CodeMirror, diff viewer, esbuild engine + wasm, jszip.

## Honest limitations
Providers/Cloudflare API CORS behaviour and live LLM calls cannot be exercised without user keys: LLM streaming, GitHub/GitLab/Netlify/Vercel/Cloudflare flows are verified against mocked `fetch` (endpoints, headers, payloads) rather than live accounts.
