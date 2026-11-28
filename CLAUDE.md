# CLAUDE.md

Read `AGENTS.md` first — it is the single source of truth for every agent (Claude, Codex, Cursor, humans).

Non-negotiables repeated here so they are never missed:
1. **Zero-exception doc-sync:** any behaviour change, even one line, updates DOCS/02 (via `npm run docs:map`), the topical doc, DOCS/06, CHANGELOG, PROGRESS, HANDOFF and keeps the version consistent. `npm run verify:docs` fails otherwise (it inspects `git status` / `--strict-diff`).
2. **Anti-hallucination:** claim nothing works without a passing test **and** observed runtime behaviour; tag the rest `PARTIAL` / `MISSING` / `ENV-LIMITED`.
3. **Gates before every commit:** `npm run verify:docs && npx tsc --noEmit && npm run lint && npm run test && npm run build` (+ `npm run e2e` for UI work). Node ≥ 22.
4. **Never write a token anywhere** (source, docs, `.git/config`, logs). Push with an ephemeral `http.extraheader` only.
5. Layering `ui → store → core`; no raw `<select>` / `<input type="color">` in `src/ui`; popovers via Floating UI, sheets via `BottomSheet`.
6. **Roadmap truth:** `DOCS/10-100X-MASTER-ROADMAP.md` holds the 41-capability matrix; change a capability's status there (and its §6 tally) in the same commit as the code that changes it.
