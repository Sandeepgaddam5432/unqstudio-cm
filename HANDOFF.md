# HANDOFF

**State:** V2-M1…M3 complete (see PROGRESS.md). Read `AGENTS.md` first.
**Next:** V2-M4 — `src/core/auth/*` (Google GIS + Drive AppData sync, GitHub OAuth client + Gist sync), `functions/api/auth/github.ts`, `src/ui/auth/*`, `src/store/auth.ts`; extend `DOCS/05` with the OAuth guides.
**Gotchas:** tests need Node 22; run `npm run docs:map` then `npm run verify:docs` after file changes; brand assets regenerate with `node scripts/gen-brand-assets.mjs`.
