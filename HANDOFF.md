# HANDOFF

Resume at the first unchecked milestone in `PROGRESS.md`. Commands: `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Conventions
- Core layers (`src/core/*`) are UI-free; add features behind interfaces.
- Never commit tokens. Push with an ephemeral `http.extraheader`; keep `git remote -v` clean.
- Absolute VFS paths (`/src/App.tsx`). Locks only gate the `ai` actor (`vfs.write(path, c, {actor:'ai'})`).
- Checkpoint timeline: `vfs.checkpoint()`, `vfs.undo()/redo()/restore(id)`; `ensure` an AI turn creates a `kind: 'ai'` checkpoint.

## State at M4
VFS, runtime and AI are final. Studio layout lives in `ui/workspace/Body.tsx`; Code Mode is a temporary placeholder there until M5. `store/workspace.ts` exposes `diffTarget/showDiff` for the diff viewer.
