# 2026-06-28

## Focus
Redesigned the desktop app footer into a unified, Linear-crisp status bar across its three components (shell container + logger + sync), and fixed a misleading sync status indicator.

## Why / what triggered it
- **Footer redesign** — triggered by a user request ("lets redesign footer part") with a screenshot showing the bar (`Logs 1866 1`, gear, green dot + "Not synced", Sync button). Ran the `impeccable` skill (critique → polish) per the project's DESIGN context. Done because the two halves had divergent type/spacing/dot vocabularies and several DESIGN.md violations.
- **Green-dot-while-"Not synced" fix (bug-241)** — triggered by the critique. Root cause: `SyncStatus` is only `idle|syncing|error`; before the first sync, status is `idle` with `lastSynced=null`, but the dot keyed off status alone → `idle` always rendered green (success) while the label said "Not synced".
- **Footer item reorder** — triggered by a follow-up user request specifying the layout `LOGS | SyncStatus | Sync Button | Gear` (gear moved to rightmost; was status → gear → Sync).

## What changed
- `plugins/shell/src/ui/desktop/AppFooter.vue`: `border-top` accent-a2 → `gray-6` hairline; removed `box-shadow` (flat-at-rest); container now owns `font-sans` + `--font-size-xs` + `gray-11` (dropped dead `font-mono`/micro override children were fighting); `align-items: stretch` for full-height segments.
- `plugins/sync/src/ui/SyncFooter.vue`: derive 4-way view state `never|synced|syncing|error` (splits `idle` on `lastSynced`) → gray/green/accent-pulse/red dot; ticking relative time ("Synced 5s ago" advances via 1s timer, cleaned up on unmount); `prefers-reduced-motion` guard; reordered to status → Sync → gear.
- `plugins/logger/src/ui/LogFooter.vue`: dot precedence error > warn > clean (was always amber); counts capped at `999+`; `gap` 6 → 8 (on-grid); added `focus-visible` ring. Unified `.fx-item` segment vocabulary shared with sync footer.
- Bookkeeping (not in git — `.wolf/` likely ignored): logged bug-241; added cerebrum learnings (Biome/TS-server lint `.vue` `<script>` in isolation → template-only identifiers are false-positive "unused"; footer = status-bar pattern).

## State
- Working: `vue-tsc` clean for all three footer files (only the known repo-wide pre-existing errors remain — see cerebrum). Biome "unused" warnings on SyncFooter are false positives (template-only references).
- In flight: all 3 footer files modified, **uncommitted**. Not yet visually verified in the running app.

## Next steps
- [ ] Visually verify in the running app (`pnpm --filter @arxhub/dev dev`, or `openwolf designqc`) — confirm dot colors, spin, hover segments, and the new item order render correctly.
- [ ] Decide whether to merge SyncStatus + Sync into one clickable status segment (VSCode-style, tighter) vs. keeping the explicit Sync button — currently kept explicit; user was offered the merge and hasn't chosen.
- [ ] Consider extracting the duplicated `.fx-item` segment style into a `uikit/core` `StatusBarItem` if a 3rd consumer appears.
- [ ] Commit the footer changes to `main`.
