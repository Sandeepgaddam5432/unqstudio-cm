# 06 · Changelog & Architecture Decision Records

## Changelog

### v2.0 — V2-M1 · Model dropdown anchoring, chat grid, UI polish
- `Dropdown` rebuilt on `@floating-ui/react` (autoUpdate/offset/flip/shift/size, portal) with mobile bottom sheet. Fixes the scroll-detach bug.
- Chat panel refactored to a strict 3-zone grid; composer toolbar wraps below the textarea; added `@file` button.
- Chat customization popover + persisted `useChatPrefs`.
- Mobile bottom navigation `Chat | Preview | Code`; workspace root `h-[100dvh]`.
- Added doc-sync infrastructure: `scripts/gen-codemap.mjs`, `scripts/verify-docs.mjs`, `AGENTS.md`, `CLAUDE.md`.

### v1.0 — M1…M8
Scaffold, VFS, esbuild-wasm runtime, multi-LLM orchestrator, Code Mode, 8 templates, deploy hub, Supabase explorer, E2E suite (see git history `feat(m1)`…`feat(m8)`).

## ADRs

### ADR-001 Floating UI instead of hand-rolled popover positioning
Hand-computed rects go stale on scroll; Floating UI's `autoUpdate` is the proven solution and also gives flip/shift/size. Accepted cost: ~10 KB gz.

### ADR-002 Generated code map + verify gate
Hand-maintained symbol docs rot. `scripts/gen-codemap.mjs` derives files, exports, imports, stores and persistence keys from source; `verify:docs` fails the commit when it drifts, making the docs self-enforcing for humans and agents.

### ADR-003 Wrapping toolbar instead of overlay composer
Absolute/overlay actions collide at narrow widths. A `flex-wrap` toolbar below the textarea cannot overlap by construction.
