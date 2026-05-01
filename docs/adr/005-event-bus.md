# ADR: Global Event Bus

## 1. Context

Panels rendered with `v-show` stay mounted but do not receive Vue lifecycle events
when tabs switch. A panel playing video has no way to know it became hidden. Additionally,
app-wide events need a way to propagate across unrelated parts of the system without coupling them.

## 2. Decision

ArxHub uses a **global typed event bus** (`@arxhub/events`) built on `eventemitter3`.

### Why eventemitter3

Battle-tested, tiny, fast. No need to implement listener management from scratch.

### How it works

`EventMap` is a TypeScript interface that maps event names to payload types.
Plugins extend it via declaration merging to add their own events:

```typescript
// my-plugin — adds its own events without touching core
declare module '@arxhub/events' {
  interface EventMap {
    'my-plugin:file-opened': { pathname: string }
  }
}
```

The `eventBus` singleton is a typed `EventEmitter<EventMap>` instance.
`panelStore` emits panel lifecycle events; panels subscribe in `onMounted`
and clean up in `onUnmounted`.

### Why not Vue's event system

Vue events (`emit`) are scoped to parent-child component relationships.
The event bus crosses arbitrary boundaries: store → panel component,
plugin → plugin, non-Vue Web Component → Vue component.

## 3. Consequences

- Any code (Vue, Web Component, iframe bridge, Node server) can emit or listen.
- Panels can pause/resume work based on activation events.
- Plugins publish their own events without modifying core.
- `eventemitter3` is the only dependency in `@arxhub/events`.
