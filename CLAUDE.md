# CLAUDE.md

This project follows the agent constitution in [`AGENTS.md`](./AGENTS.md). Read it first, then `DOCS/01-SYSTEM-ARCHITECTURE.md` and `DOCS/02-CODEBASE-MAP.md` before touching code.

**Immutable doc-sync law (summary):** any added/renamed/deleted file or changed exports/state/API ⇒ update `scripts/codemap-purposes.mjs` → `npm run docs:map` → matching `DOCS/*.md` → append `DOCS/06-CHANGELOG-AND-ADRS.md` → `npm run verify:docs` passes → only then commit.
