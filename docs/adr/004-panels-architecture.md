# ADR: Panels Architecture

## 1. Context

ArxHub needs a way to display content. Different file types need different viewers.
Plugins should be able to contribute their own viewers. Users need to view multiple
pieces of content side by side.

## 2. Decision

ArxHub uses a **tiling panel system** as its primary UI model.

### What is a Panel

A panel is a self-contained UI unit registered by a plugin and rendered by core.
The main app is just a panels renderer — it has no hard-coded content.

### Panel Definition

A plugin contributes a panel by registering a `PanelDefinition`:
- `id` — unique identifier (e.g. `arxhub.markdown-viewer`)
- `title` — default tab label
- `component` — Vue component (`Component`)
- `handles` — file extensions this panel can open (e.g. `['.md']`)

### Panel Instance

When a panel opens, a `PanelInstance` is created (nanoid instanceId, definitionId, title, props).
Multiple instances of the same type can be open at once.

### Groups and Tiling

Panels are organized into **groups**. Each group has its own tab bar and holds one or more
panel instances. Groups are arranged in a binary tree:

- **Leaf node** → one group
- **Split node** → two subtrees side by side (horizontal) or top/bottom (vertical), with a ratio

This lets users see multiple panels simultaneously. Splits are created via the tab bar
action buttons. The layout is not floating — all groups fill the available space.

### Rendering

Active panel in each group is shown; others use `v-show` to stay mounted (preserves state).

Panel components are standard Vue components rendered via `<component :is>`. Props declared
on the `PanelDefinition` are passed through at open time and bound with `v-bind`.

### Tab Navigation

Browser-style tabs per group. Click to activate, × to close. Closing the last tab in a
group auto-removes that group and collapses its parent split.

### File Association

Plugins declare `handles` on their panel definition. `getPanelsForFile(ext)` returns all
capable panels. "Open with" lets users pick. Default preferences are out of scope for MVP.

## 3. Consequences

- Plugins contribute panels without touching core.
- Users can tile content side by side without leaving the app.
- No floating panels; no drag-and-drop between groups in v1.

## 4. Future Considerations

**Non-Vue plugin authors** — `PanelComponent` is currently `Component` (Vue only). Supporting
Web Components (Shadow DOM) and sandboxed HTML strings (`<iframe srcdoc>`) is a natural
extension when there is a concrete need for non-Vue panel authors. The `PanelComponent` type
alias exists as a single change point for that expansion.
