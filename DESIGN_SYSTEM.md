# UnQStudio Design System

Swiss-minimalist, monochrome-first. One signature accent (vermilion) used sparingly for focus, primary calls to action and live state.

## Color tokens (CSS variables in `src/index.css`)

| Token | Obsidian Dark | Paper Light |
|-------|---------------|-------------|
| `--c-bg` | `#09090B` | `#FAFAFA` |
| `--c-panel` | `#111114` | `#FFFFFF` |
| `--c-subtle` | `#18181B` | `#F4F4F5` |
| `--c-line` | `rgba(255,255,255,.08)` | `rgba(9,9,11,.09)` |
| `--c-fg` / `--c-muted` / `--c-faint` | `#FAFAFA` / `#A1A1AA` / `#71717A` | `#09090B` / `#71717A` / `#A1A1AA` |
| `--c-accent` | `#FF6A3D` | `#E5481B` |

Tailwind utilities: `bg-bg bg-panel bg-subtle border-line text-fg text-muted text-faint bg-accent text-accent-fg`.

## Typography
Inter Variable (UI) and JetBrains Mono Variable (code), bundled locally (`@fontsource-variable/*`). Scale: 11 / 12 / 13 / 14 / 15 / 18+.
Headlines use `tracking-tight`; code is 13px mono.

## Spacing, radius, motion
4px grid. Radius: 6 (chips), 8 (controls), 12 (cards), 16 (modals). Borders are always 1px `--c-line`.
Motion: 150–250ms ease-out transforms/opacity only (60 fps); respects `prefers-reduced-motion`. Theme switch cross-fades colors in 250ms.

## Primitives (`src/ui/primitives/`)
Button (primary / accent / secondary / ghost / danger), Input / Textarea / Select / Switch, Modal / Drawer / ConfirmModal,
Dropdown (portal popover with menu or custom content), Tooltip, Tabs / Segmented, SplitPane (resizable, persisted), Toast, Badge, Kbd, Spinner.
