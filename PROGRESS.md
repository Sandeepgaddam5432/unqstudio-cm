# PROGRESS

- [x] **M1** Scaffold, design system, Home, workspace shell, docs foundation
- [x] **M2** VFS: CRUD, file locks, checkpoints/undo/redo/fork/diff, ZIP export+import, local folder sync, tests
- [x] **M3** esbuild-wasm runtime (`core/runtime`), sandboxed preview, error catcher, preview toolbar, tests
- [x] **M4** AI orchestrator: 20 BYOK providers, streaming, artifact parser, patch engine, vault, modes, enhancer, vision, voice, @mentions, token/cost meter
- [x] **M5** Code Mode IDE, diff viewer, visual click-to-edit inspector, Theme Studio, command palette extensions
- [ ] M6 Templates + settings hub
- [ ] M7 Deploy hub
- [ ] M8 Hardening + docs

## Notes
- M3: `IRuntimeEngine` + `EsbuildWasmEngine` (wasm served from bundled asset with progress, jsDelivr fallback, `registerRuntime()` for alternative engines).
  esbuild plugin: `vfs` namespace (relative, `@/`, absolute, index/ext probing, CSS injection with Tailwind browser runtime detection, binary assets as data URLs)
  + `http` namespace (esm.sh with shared React via `?external`, memory + IndexedDB cache). Real compile pipeline is covered by tests running esbuild-wasm in Node.
  Preview: debounced rebuild, sandboxed iframe + postMessage bridge (console, errors, unhandled rejections, in-memory storage shim, inspector + screenshot protocol),
  error banner with “Fix with AI” (queues a message on `chatBus`; the chat consumes it in M4), viewport/rotate/zoom/reload/console/pop-out/screenshot toolbar.
- `ui/workspace/Body.tsx` is still a transitional layout (file list + History + Preview) until M4/M5.
- M4: `core/ai` – `stream.ts` (SSE; OpenAI-compatible + Anthropic with `anthropic-dangerous-direct-browser-access`), `parser.ts` (chunk-boundary-safe artifact parser incl. `<think>`),
  `patch.ts` (SEARCH/REPLACE, exact → whitespace-tolerant, all-or-nothing), `apply.ts` (lock-aware file ops), `orchestrator.ts` (turn pipeline, before/after checkpoints, approval tray, enhancer, test-connection),
  `vault.ts` (PBKDF2+AES-GCM). UI: Studio layout (chat | preview), composer (enhancer, image attach/paste/drop, voice, @file mentions, rules library, Build/Plan/Ask), op cards with diff/approve/reject,
  undo turn / fork chat / retry / Approve & Build, onboarding wizard, Providers settings tab with vault controls. Tests: parser (every split position), patch, vault, adapters, lock enforcement, mocked end-to-end turns.
- M5: Code Mode = explorer (create/rename/duplicate/delete/drag-move/upload/lock/pin) + Search & Replace + History | multi-tab CodeMirror 6 (lazy chunk, autosave, locked-file banner, image preview) | right panel (Preview, Chat, Theme, Tokens).
  Diff viewer: split/unified, collapsed context, compare-with-any-checkpoint, per-file Accept/Revert (opened from AI op cards and History). Inspector: hover outline + tag/size/classes tooltip, click → quick edit
  (text, colors, padding, radius, font size) with instant preview and “Save to source” (unique-match Tailwind class/text rewrite, otherwise explains why not) or “Edit with AI” (DOM snippet + source hint into the composer).
  Theme Studio: presets, light/dark tokens, radius, Google Font picker; live via `theme-css` bridge message, persisted to `/src/index.css` + `/index.html`. Mobile: 4-tab bottom bar in Code Mode.
