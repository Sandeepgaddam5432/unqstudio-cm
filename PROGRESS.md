# PROGRESS

- [x] **M1** Scaffold, design system, Home, workspace shell, docs foundation
- [x] **M2** VFS: CRUD, file locks, checkpoints/undo/redo/fork/diff, ZIP export+import, local folder sync, tests
- [x] **M3** esbuild-wasm runtime (`core/runtime`), sandboxed preview, error catcher, preview toolbar, tests
- [ ] M4 AI orchestrator
- [ ] M5 Code Mode, diff viewer, inspector, theme studio
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
