# PROGRESS

- [x] **M1** Scaffold, design system, Home, workspace shell, docs foundation
- [x] **M2** VFS: CRUD, file locks, checkpoints/undo/redo/fork/diff, ZIP export+import, local folder sync, tests
- [ ] M3 esbuild-wasm runtime + preview
- [ ] M4 AI orchestrator
- [ ] M5 Code Mode, diff viewer, inspector, theme studio
- [ ] M6 Templates + settings hub
- [ ] M7 Deploy hub
- [ ] M8 Hardening + docs

## Notes
- M2: `core/vfs` is complete and covered by `vfs.test.ts` (CRUD, lock enforcement incl. folder locks, restore/undo/redo, fork, IDB persistence, ZIP round trip).
  UI: History panel (restore / fork / diff vs now), Import ZIP on Home, Publish modal with ZIP export + File System Access folder push/pull.
- The Studio/Code panels in `ui/workspace/Body.tsx` are still a placeholder (file list + History panel) until M3–M5 replace them.
