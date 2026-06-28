# 2026-06-28

## Focus
Audited every `@arxhub/uikit/core` component against `DESIGN.md` + Radix scale-step semantics, then fixed the violations: theme-token correctness, 8px-grid spacing, accessibility/states, API consistency, and stale docs.

## Why / what triggered it
- **The whole session** — triggered by the user's request "lets work with uikit, inspect it, find ui/ux issues, write a plan for fixes." Scope was explicitly set to *Everything* (correctness + a11y + API consistency + docs).
- **Contrast tokens (`--*-contrast`)** — triggered by the hardcoded `white` labels on Button (a known DESIGN.md bug). Mid-plan the user pushed back twice on inventing tokens, then — once it was clear Radix step-9 foreground is *hue-dependent* (cyan/red take white, but Sky/Mint/Lime/Yellow/Amber take dark) — asked to add them, and to cover gray/info/success/warning too. Done so a future light-foreground-accent theme can override label color instead of rendering invisible white.
- **Radix step corrections** — triggered by the user stating "we use radix color palette as base" and pasting the scale-step usage table. Revealed that several components used the wrong step for the role (e.g. Button secondary hover used gray-6, a *border* step, instead of gray-4). Corrected to the Radix model.
- **Hue→role token swaps, grid snaps, a11y gaps, API drift, stale docs** — triggered by the audit findings against DESIGN.md (role-binding rule, 8px grid, keyboard-first commitment, "no border stripe accents" rule).

## What changed
- `packages/theme-preset/src/semantic.css`: added `--danger/--warning/--info/--success-contrast` (default `var(--white)`).
- `themes/default/index.css`: added theme-owned `--accent-contrast` + `--gray-contrast`.
- `Button.vue`: `white`→`--accent-contrast`/`--danger-contrast`; `--red-*`→`--danger-*`; gap 6→8px; secondary hover gray-6→gray-4; added `:focus-visible` ring + `disabled` prop/state; **removed the `icon` variant + `icon` size** (use IconButton).
- `Input.vue`: text `white`→`--gray-12`; added `disabled`; resting border `transparent`→`var(--gray-7)` (reversed the plan's "keep transparent well" call — an empty input on a same-tone surface was invisible; see screenshot finding below). `Switch.vue`: thumb `white`→`--white` + `--shadow-sm`; off-track `--gray-3`→`--gray-5` (light-mode contrast — white thumb on near-white track was invisible).
- `Checkbox.vue`: neutral unchecked state (border gray-7), accent moved under `[data-state='checked']`.
- `MenuItem.vue`/`ActionMenuHost.vue`: `--red-*`→`--danger-*`; padding 5px/10px→4px/12px; ActionMenu got `role=menu/menuitem` + arrow-key roving focus + focus-on-open.
- `Notification.vue`: removed forbidden colored left-border stripe; close button → `IconButton` (aria+focus); Tailwind comments stripped; variant `error`→`danger` + added `warning`.
- `Badge.vue`: variants unified to `success|warning|danger|info|neutral` (was `success|alert|neutral`).
- `Card.vue`: made generic — `icon` prop + `#actions` slot, dropped the hardcoded `lu:type` icon + Copy button + magic `min-height`.
- `Dialog.vue`/`Toolbar.vue`/`Separator.vue`: dividers standardized to gray-6; Dialog backdrop literal rgba→`--black-a6`. `IconButton.vue`: active gray-4→gray-5. `ProgressBar.vue`: track 6→8px.
- `plugins/explorer/src/ui/FileTreeView.vue`: migrated the two `Button variant="icon"` → `secondary` (only consumer of the removed variant).
- `packages/uikit/AGENTS.md`: rewrote — removed stale `ui/`+`layout/` split, `desktop`/`mobile` entries, and `ContextMenu` (none exist).
- `.wolf/`: bugs 262–264 logged; cerebrum Key Learnings + memory.md updated (OpenWolf protocol).

## State
- Working / verified: LSP 0 errors across 14 uikit files; greps clean (no bare `white`, hex/rgba, palette-hue tokens, or off-grid px in components); no consumers of removed/renamed APIs; dev stand booted clean (HTTP 200, no log errors).
- In flight: **all 18 files are uncommitted** (`git status` clean of staging). Nothing half-done — the plan executed end to end.

## Next steps
- [ ] Commit the work (direct to `main`, no Co-Authored-By). Suggested message theme: `refactor(uikit): role-bound tokens, Radix steps, a11y states, unified variants`.
- [ ] **Decision pending:** Button secondary hover was changed to Radix-correct `gray-4`, but `DESIGN.md:223` still codifies `gray-6`. Either amend that DESIGN.md line to `gray-4` (recommended, matches Radix) or revert the button. Not yet resolved.
- [ ] Optional: mount a `<Toaster>` in the shell so `toaster.create()` + the refreshed `Notification.vue` actually render (currently a no-op — editors log via `arxhub.logger`).
- [ ] Optional follow-up from the audit: DESIGN.md could document the new `--*-contrast` token pair in its Colors section.
- [x] **Resolved — light is the default for now.** The app renders the Radix *light* scale (`:root` in `theme-preset/colors/*.css`). Re-baselined DESIGN.md frontmatter + §2 hexes + the load-bearing theme sentence from dark→light. Theme model confirmed = **VSCode/Obsidian-style**: a theme is a whole swappable unit the user selects (each declares its own brightness), NOT a global light/dark toggle. Dark/alternate themes will be authored as their own theme units later. Light-mode contrast bugs fixed: Input (gray-7 border) + Switch (gray-5 track + thumb shadow). Watch for further dark-first low-contrast spots as more screens are exercised in light.
