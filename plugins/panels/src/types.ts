import type { Component, DeepReadonly, Ref } from 'vue'
import type { DropZone } from './composables/drag-types'

export type PanelComponent = Component

export interface PanelDefinition {
  id: string
  title: string
  icon?: string
  component: PanelComponent
  handles?: string[]
}

export interface PanelInstance {
  instanceId: string
  definitionId: string
  title: string
  props?: Record<string, unknown>
}

export interface PanelGroup {
  id: string
  instances: PanelInstance[]
  activeInstanceId: string | null
}

export type LayoutLeaf = { type: 'leaf'; groupId: string }
export type LayoutSplit = {
  type: 'split'
  splitId: string
  direction: 'horizontal' | 'vertical'
  ratio: number
  first: LayoutNode
  second: LayoutNode
}
export type LayoutNode = LayoutLeaf | LayoutSplit

// The device-local-persisted slice of a PanelStore's state — everything EXCEPT definitions, which come
// fresh from each plugin's own registration on every boot and would be stale component references if
// they were ever serialized themselves.
export interface PanelWorkspaceState {
  groups: Record<string, PanelGroup>
  layout: LayoutNode | null
  activeGroupId: string | null
}

export interface PanelStore {
  readonly definitions: DeepReadonly<Ref<PanelDefinition[]>>
  readonly groups: DeepReadonly<Ref<Record<string, PanelGroup>>>
  readonly layout: DeepReadonly<Ref<LayoutNode | null>>
  readonly activeGroupId: DeepReadonly<Ref<string | null>>
  // A snapshot fit to persist device-locally and hand back to restore() on a later boot.
  serialize(): PanelWorkspaceState
  // Replaces groups/layout/activeGroupId wholesale — for restoring a persisted snapshot, not for
  // incremental UI-driven changes (those go through the mutators below).
  restore(state: PanelWorkspaceState): void
  registerPanel(def: PanelDefinition): void
  getDefinition(id: string): PanelDefinition | undefined
  getPanelsForFile(ext: string): PanelDefinition[]
  // dedupe, when given, is checked against every open instance of this definitionId BEFORE a new one is
  // created: a match is activated in place and its instanceId returned, instead of opening a second copy.
  // Callers that want at most one instance of a panel — ever (Welcome, the SQL console) or per some key
  // (Settings' one-tab-per-section) — pass this instead of hand-rolling the same scan over `groups`.
  openPanel(
    definitionId: string,
    props?: Record<string, unknown>,
    title?: string,
    targetGroupId?: string,
    dedupe?: (instance: PanelInstance) => boolean,
  ): string
  activatePanel(instanceId: string, groupId: string): void
  closePanel(instanceId: string, groupId: string): void
  // Updates an already-open panel's identity in place — the file it shows moved (a vault rename), it did
  // not become a different document. Same instanceId, so PanelView (keyed by instanceId, not path) never
  // remounts the hosted component; only its `props`/`title` change reactively.
  retargetPanel(instanceId: string, groupId: string, props: Record<string, unknown>, title: string): void
  activateGroup(groupId: string): void
  splitGroup(groupId: string, direction: 'horizontal' | 'vertical'): string
  closeGroup(groupId: string): void
  setRatio(splitId: string, ratio: number): void
  // Leaf groups in layout tree order (pre-order: a split's first branch before its second) — how a
  // tab's keyboard "move to next/previous split" finds its neighbour without walking the tree itself.
  getOrderedGroupIds(): string[]
  movePanel(instanceId: string, fromGroupId: string, toGroupId: string, toIndex: number): void
  movePanelToZone(instanceId: string, fromGroupId: string, targetGroupId: string, zone: DropZone): void
}
