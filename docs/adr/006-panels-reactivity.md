# ADR: Panel Store Reactivity

## 1. Context

The panel store holds layout state (groups, layout tree, active group, open tabs).
UI components need to react to changes automatically. The store must also be callable
from non-Vue code (Web Components in Shadow DOM, scripts in iframes, future React UI).

## 2. Decision

Use **Vue's built-in `ref` and `readonly`** as a module-level singleton.

### Why not Pinia

Pinia stores are bound to a Vue app instance (`app.use(pinia)`). Code outside the Vue
tree cannot call `usePanelStore()` without access to the app context. A plain module
singleton has no such constraint — any code can `import { panelStore }` and call its
methods imperatively.

### Why not nanostores or zustand

Both are good for multi-framework projects. React is not a near-term requirement and
Vue is already a dependency, so an extra library is unnecessary overhead right now.

### How it works

Vue components that read store state in templates auto-rerender on mutation.
Non-Vue code calls mutation methods imperatively — no bridge needed.

### React migration path

Add `subscribe(fn)` (via `watchEffect`) and `getSnapshot()`. Consume in React via
`useSyncExternalStore`. No changes to the core store shape are required.

## 3. Consequences

- Zero extra dependencies.
- Follows existing `toaster` pattern in `@arxhub/uikit`.
- Any JS code can call store methods imperatively.
- Vue components get reactivity for free.
- React bridge can be added later without redesign.
