# PROGRESS — UnQStudio v3.6.1

| Milestone | Status |
|---|---|
| V2.1-M1 Zero-leak branding + 4-source Model Catalog | ✅ done |
| V2.1-M2 Zero-broken-icon system + model family icons | ✅ done |
| V2.1-M3 Custom Providers (4 wire protocols) | ✅ done |
| V2.1-M4 Windowed picker + categorised Settings | ✅ done |
| V2.1-M5 Auto-Heal + inline ⌘K edit + Symbol Map | ✅ done |
| V2.1-M6 VITE_SITE_URL + doc gaps + verify-docs | ✅ done |
| V2.1-M7 E2E (68 checks) + audit doc | ✅ done |
| V3.0-M1 Native mobile shell, BottomSheet, PWA, visual elevation | ✅ done |
| V3.0-M2 Lovable Home, sidebar drawer, live thumbnails | ✅ done |
| V3.0-M3 Version cards, build activity, follow-ups, picker keyboard nav | ✅ done |
| V3.0-M4 Preview toolbar, route bar, visual inspector (desktop popover / mobile sheet) | ✅ done |
| V3.0-M5 Project Settings hub, Knowledge, Publish sheet + QR + SEO | ✅ done |
| V3.0-M6 Multi-step agent loop + symbol/dependency graph | ✅ done |
| V3.0-M7 Doc sync, 106-check Chromium E2E, visual QA, release 3.0.0 | ✅ done |
| V3.1-M1 OKLCH depth, Geist, shadows, SVG Aurora + backgrounds | ✅ done |
| V3.1-M2 Mobile nav pill, launchpad, Projects/Chats views, skeletons | ✅ done |
| V3.1-M3 Swipe workspace, preview bar, inset canvas, chat polish | ✅ done |
| V3.1-M4 Timeline | + Changes inspector, inline version cards | ✅ done |
| V3.1-M5 Account menu, preferences, connectors hub, workspace settings | ✅ done |
| V3.1-M6 Docs, 147-check Chromium E2E, visual QA, release 3.1.0 | ✅ done |
| V3.2-M1 Glass theme, custom SelectSheet, Color Studio, haptics opt-in | ✅ done |
| V3.2-M2 Model picker redesign, full-colour brand icons, full-sheet swipe-to-dismiss | ✅ done |
| V3.2-M3 Mobile swipe shell (Home⇄Projects⇄Chats), real iframe template previews | ✅ done |
| V3.2-M4 Leak-proof message parser, 2-row composer, / skills picker, voice input | ✅ done |
| V3.2-M5 Full-colour Connectors Hub, custom connectors, Supabase full-stack engine | ✅ done |

Gates: verify:docs · tsc · lint · 440+ unit tests · build · 106 E2E checks. Unit tests need Node ≥ 22.

## v3.3.0 — True Lovable mobile UX (M1–M6)
- [x] M1 single-viewport Home + one FAB per tab · [x] M2 SwipePager + springs · [x] M3 model selector overhaul · [x] M4 Home→Chat fix, hammer removed · [x] M5 CORS proxy + URL normalisation · [x] M6 e2e (CDP touch) + docs/screenshots.
- Gates: verify:docs · tsc · lint · vitest · build green. e2e at 3.3.0 was 173/175 (desktop "Project settings" click, OKLCH ladder #7) — both fixed in 3.3.1.

## v3.3.1 — Phase 0 ground-truth audit
- [x] Real baseline (verify:docs, tsc, lint, 42 files/573 tests, build, e2e 182/182) · [x] stale headers fixed · [x] verify:docs v2 (version consistency + strict git-diff doc-sync) · [x] AGENTS/CLAUDE micro-change + anti-hallucination law · [x] e2e baseline fixed. See `DOCS/08` audit table.

## v3.4.0 — Phase 1 resilient streaming
- [x] watchdog + auto-continuation + stitching + salvage + locks + abort (core, **unit-tested**: `resilientStream.test.ts`, 296 AI-engine tests green) · [x] store `recover` + `RecoveryCard` + live status (type-checked, built; **no Chromium e2e for the recovery card yet → PARTIAL**) · [x] patch-first prompt rules.

## v3.5.0 — Phase 2
- [x] tools.ts (unit-tested) · [x] tsCheck + lazy worker (core unit-tested, NOT wired) · [x] bridge network + audit (jsdom-tested) + Network tab · [x] verifyLoop receipts (unit-tested, NOT wired into UI) · [ ] native tool calls on the wire · [ ] CodeMirror squiggles · [ ] vision screenshot auto-verify.

## v3.6.0 — Phase 3/5 core logic
- [x] leakScanner · hunkDiff · projectBrain · npmSearch · a11yChecks · erd (all unit-tested) · [ ] every UI surface for them (MISSING) · [ ] share function / deploy history / insights (MISSING) · [ ] Phase 4 redesign (MISSING).
| v3.6.1 100x master roadmap (`DOCS/10`) + doc cleanup | ✅ done (docs only; no capability status changed) |
