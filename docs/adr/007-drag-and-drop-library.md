# ADR: Drag-and-Drop Library

## 1. Context

The panels package needs two drag-and-drop features:
1. **Tab drag between panel groups** — users drag tabs from one group's tab bar to another, or reorder tabs within a group (VS Code–style tiling layout).
2. **File-tree drag-and-drop** — planned feature where tree nodes can be reparented, reordered above/below siblings, or moved into folders.

Both features require:
- Drop position indicators (left/right edge for tabs, above/below/into for tree nodes)
- Visual feedback during drag (dimmed source, highlighted targets)
- Correct integration with the store's immutable update pattern (no direct array mutation)

## 2. Decision

Use **`@atlaskit/pragmatic-drag-and-drop`** (core) and **`@atlaskit/pragmatic-drag-and-drop-hitbox`** (geometry utilities).

### Why not SortableJS / vue-draggable-plus

SortableJS is the most common Vue drag-drop library but is a poor fit here for two reasons:

1. **Model mismatch.** It expects `v-model` two-way binding — it mutates the array directly and then notifies the framework. The panel store uses an immutable update pattern: every change goes through a store method that emits events (`panel:opened`, `panel:closed`, `panel:activated`) on the event bus. Letting SortableJS mutate the array bypasses those emissions entirely. Intercepting `@add`/`@remove` events to re-route through the store creates a double-update race.

2. **`v-show` conflict.** `PanelView.vue` uses `v-show` (not `v-if`) to show/hide panel instances. SortableJS reorders DOM nodes directly and expects the framework to reconcile, which conflicts with Vue's virtual DOM diffing when elements are conditionally hidden rather than removed.

### Why not native HTML5 DnD API

Zero dependencies is appealing, but:
- No closest-edge detection (left/right for tabs, above/below/into for tree nodes) — must be implemented manually per-element.
- Ghost image customization is limited and cross-browser inconsistent.
- No `tree-item` abstraction — the file-tree requirement would need a second custom implementation.
- Amounts to ~200+ lines of geometry math that `@atlaskit/pragmatic-drag-and-drop-hitbox` already provides correctly.

### How pragmatic-drag-and-drop fits

The library is framework-agnostic vanilla JS with three primitives: `draggable()`, `dropTargetForElements()`, `monitorForElements()`. Each returns a cleanup function, which maps directly to Vue 3's `onMounted`/`onUnmounted` lifecycle.

Key capabilities used:

- **`attachClosestEdge` / `extractClosestEdge`** (hitbox package) — detects left/right edge of a tab during hover, drives the drop indicator without custom geometry.
- **`attachInstruction` / `extractInstruction`** with tree-item mode — provides `reorder-above`, `reorder-below`, `make-child`, `reparent` instructions for the future file tree, with no additional library.
- **Centralized `monitorForElements`** at the layout root — all store mutations happen in one place; individual components only manage their own visual state (`isDragging`, `closestEdge`, `isDragOver`).

Data is passed via `getInitialData` / `getData` typed objects, not shared mutable state.

### Vue integration pattern

A thin `useDraggableTab` composable (~70 lines) bridges `draggable()` and `dropTargetForElements()` to reactive Vue refs. This is the only framework-specific code needed. The composable is called once per `DraggableTab.vue` component instance and cleans up on `onUnmounted`.

## 3. Consequences

- Two new npm packages: `@atlaskit/pragmatic-drag-and-drop` (~4.7 KB gzipped) and `@atlaskit/pragmatic-drag-and-drop-hitbox` (~1.5 KB gzipped).
- A `useDraggableTab` composable is required as a Vue bridge (~70 lines); pdnd has no official Vue bindings.
- Store mutations remain centralized and event-emitting — no bypass of the immutable update pattern.
- File-tree drag-and-drop can reuse the same library with the `tree-item` hitbox — no second dependency needed.
- pdnd documentation and examples are React-centric; Vue usage requires reading the framework-agnostic API docs.
