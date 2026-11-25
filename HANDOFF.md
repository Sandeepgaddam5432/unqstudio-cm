# HANDOFF

Resume at the first unchecked milestone in `PROGRESS.md`. Working dir: repo root. Commands: `npm run test`, `npx tsc --noEmit`, `npm run build`.

## Conventions
- Core layers (`src/core/*`) are UI-free; add features behind interfaces.
- Do not commit tokens. Push with an ephemeral `http.extraheader`; keep `git remote -v` clean.
- Absolute VFS paths (`/src/App.tsx`).
