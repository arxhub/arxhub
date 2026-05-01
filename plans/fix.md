# Fix Plan — Panels + Event Bus

## Completed ✅

| # | Task | File(s) |
|---|------|---------|
| 1 | Vue-only `PanelComponent` | types.ts, PanelView.vue |
| 2 | `closeGroup` emit after mutations | panel-store.ts |
| 3 | `closePanel` deactivated-before-closed ordering | panel-store.ts |
| 4 | Duplicate registration guard | panel-store.ts |
| 5 | Consolidate split handlers | PanelTabBar.vue |
| 6 | Add `lucide-vue-next` to workspace | pnpm-workspace.yaml, panels/package.json |
| 7 | Replace emoji + close `<button>` with icons | PanelTabBar.vue |
| 8 | ResizeHandle touch TODO | ResizeHandle.vue |
| 9 | Remove dead scrollbar CSS | DesktopLayout.vue |

---

## Remaining

### 1 — ADR 004 stale docs

**File:** `docs/adr/004-panels-architecture.md`

Web Component and HTML string support was removed from the implementation but the doc
still references it in three places:

- **Line 29** (`PanelDefinition` section): `component — Vue component, Web Component class, or HTML string`
  → change to: `component — Vue component`

- **Lines 52–54** (Rendering section): remove the "Non-Vue components are isolated" block entirely

- **Line 70** (Consequences): `Non-Vue plugin authors can use Web Components or HTML strings.`
  → remove this line

---

### 2 — `panel:closed` fires before state mutation

**File:** `packages/panels/src/panel-store.ts` — `closePanel`

`panel:closed` is emitted before `groups.value[groupId]` is updated, so a listener
reading `panelStore.groups` on that event still sees the closed panel in the instances
array. `group:closed` was already fixed to fire after mutations — make `panel:closed`
consistent: emit it after `groups.value[groupId]` is updated on line 628.

---

### 3 — `aria-label` on icon-only split buttons

**File:** `packages/panels/src/ui/PanelTabBar.vue`

`<Columns2>` and `<Rows2>` render as SVGs with no visible text. `title` is mouse-only.
Add `aria-label` to both action buttons:

```html
<button class="action-btn" aria-label="Split right" title="Split right" @click="onSplit('horizontal')">
<button class="action-btn" aria-label="Split down" title="Split down" @click="onSplit('vertical')">
```
