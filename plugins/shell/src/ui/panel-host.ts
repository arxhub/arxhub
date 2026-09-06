import type { Component } from 'vue'
import type { Json } from './tab-type'

// One open panel as the workspace hands it over. Everything past this — groups, splits, ratios,
// drag-and-drop — belongs to whoever implements the host.
export interface HostedPanel {
  key: string
  title: string
  component: Component
  props: Record<string, unknown>
}

// What `Workspace` needs from a panel container, and nothing else.
//
// This is a port owned by the shell rather than an import of `@arxhub/plugin-panels`, for two reasons
// that both hold today. A direct plugin-to-plugin import is the one thing plugins may not do — they
// talk through extensions — and the shell does not depend on the panels package at all. And the
// panels store as it stands is addressed by generated instance ids over registered definitions, which
// has no room for the stable per-object `key` the whole de-duplication rests on; making it key-
// addressed is its own step (one panel store per type), and until that lands `Workspace` is testable
// against a fake without waiting for it.
//
// Note what the port deliberately does NOT expose: groups. A group is a cell of the layout, and which
// cell a panel sits in is the host's business — `Workspace` only ever wanted "make this key the active
// one", which is `activate`.
export interface PanelHost {
  // The open keys in the order they are shown. This is what a tab list and the type's counter read, so
  // it has to be backed by reactive state or neither will ever update.
  keys(): string[]
  has(key: string): boolean
  open(panel: HostedPanel): void
  // Swap what a key shows, in place. The tab keeps its position: the person did not move it, so it
  // does not move.
  replace(key: string, panel: HostedPanel): void
  close(key: string): void
  activate(key: string): void
  // The active key of the host's active cell, or null when nothing is open.
  activeKey(): string | null
  // Splits and ratios, as data. `null` — a single cell: there is nothing to say about it, and the
  // field does not appear in the snapshot.
  serializeLayout(): Json | null
  applyLayout(snapshot: Json | null): void
}
