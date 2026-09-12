import type { HostedPanel, Json, PanelHost } from '@arxhub/plugin-shell/ui'
import { nanoid } from 'nanoid'
import { type Component, defineComponent, h, markRaw, type PropType } from 'vue'
import { getAllGroupIds } from './panel-store'
import type { LayoutNode, PanelGroup, PanelInstance, PanelStore } from './types'
import PanelsLayout from './ui/PanelsLayout.vue'

// The panels side of the navigation model: one `PanelStore` per tab type, seen through the shell's
// `PanelHost` port. The port lives in `@arxhub/plugin-shell/ui` and its implementation lives here,
// because that is the direction the dependency already runs — `panels` peer-depends on `shell`, and
// `shell` must not depend on `panels`.
//
// A type is the level ABOVE groups: the type owns a store, and a group stays what it always was, a
// cell of the layout. Splitting, ratios and drag-and-drop keep working unchanged INSIDE a type.
//
// Dragging a tab from one type to another is therefore not offered, and is deliberately not offered
// as something that refuses either. `movePanel`/`movePanelToZone` address a group inside one store,
// and a store belongs to one type — so another type's tab bar simply is not a drop target. An absent
// capability is an absent control, never a disabled one: there is nothing to explain, because nothing
// failed. Do not "fix" this by adding a drop target that says no.

const HOSTED_DEFINITION_ID = 'arxhub.panels.hosted'

// One definition serves every panel a host opens, and the panel's own component travels in its props.
//
// The store addresses a panel by a generated instance id over a registered definition; a hosted panel
// is addressed by a stable object key and brings its own component. Registering one definition per key
// is the obvious alternative and it cannot express `replace`: a definition is registered once and the
// store has no way to update it, so swapping a gone-object placeholder back for the object would have
// to close and reopen the tab — which moves it to the end of the row. Through a passthrough definition
// the swap is `retargetPanel` on the same instance, and the tab does not move.
const HostedPanelView = defineComponent({
  name: 'HostedPanel',
  inheritAttrs: false,
  props: {
    hostedKey: { type: String, required: true },
    component: { type: [Object, Function] as PropType<Component>, required: true },
    componentProps: { type: Object as PropType<Record<string, unknown>>, required: true },
  },
  setup: (props) => () => h(props.component, props.componentProps),
})

// A layout as it is written down: keys, not group ids. Group ids are `nanoid()` and therefore
// different on every boot, so the identity of a cell is its PLACE in the tree — with no id field,
// "a tab pointing at a group that does not exist" and "an orphan group" are unrepresentable rather
// than merely checkable.
type LeafSnapshot = { keys: string[]; active: string | null }
type SplitSnapshot = { d: 'h' | 'v'; r: number; a: LayoutSnapshot; b: LayoutSnapshot }
type LayoutSnapshot = SplitSnapshot | LeafSnapshot

// Nine parts of one screen is already not a desk. The limit is not cosmetic: the tree walk is
// recursive, and a hand-edited depth of ten thousand would blow the stack before the app mounts.
const MAX_LAYOUT_DEPTH = 8

function isSplitSnapshot(node: LayoutSnapshot): node is SplitSnapshot {
  return (node as SplitSnapshot).d != null
}

// What comes off the disk is data, not an order. Failing the check drops the layout WHOLE and keeps
// the tabs: losing the arrangement is annoying, losing the tabs is not acceptable.
function sane(node: unknown, depth: number): node is LayoutSnapshot {
  if (node == null || typeof node !== 'object' || depth > MAX_LAYOUT_DEPTH) return false
  const record = node as Record<string, unknown>
  if (record.d === 'h' || record.d === 'v') {
    return typeof record.r === 'number' && Number.isFinite(record.r) && sane(record.a, depth + 1) && sane(record.b, depth + 1)
  }
  return Array.isArray(record.keys) && record.keys.every((key) => typeof key === 'string')
}

function clampRatio(ratio: number): number {
  return Math.max(0.1, Math.min(0.9, ratio))
}

function hostedKeyOf(instance: { props?: { readonly [key: string]: unknown } }): string | null {
  const key = instance.props?.hostedKey
  return typeof key === 'string' ? key : null
}

// The key a panel answers to. A hosted panel carries its own stable one; a panel opened straight on
// the store falls back to its instance id, so it is addressable — and closable, and activatable — the
// same way, without the store having to grow a second identity.
function keyOf(instance: PanelInstance): string {
  return hostedKeyOf(instance) ?? instance.instanceId
}

function hostedProps(panel: HostedPanel): Record<string, unknown> {
  // markRaw on the component: it goes into the store's reactive `groups`, and a reactive proxy over a
  // component definition breaks identity comparison and makes Vue walk the whole definition.
  return {
    hostedKey: panel.key,
    component: markRaw(panel.component),
    componentProps: panel.props,
    ...(panel.requestClose ? { requestClose: panel.requestClose } : {}),
  }
}

interface Located {
  groupId: string
  instanceId: string
}

// One type's panels. Everything past the port — groups, splits, ratios, drag-and-drop — stays in the
// store this wraps, and `store` is exposed so a frame can render the type's own `PanelsLayout` over it.
export class StorePanelHost implements PanelHost {
  readonly store: PanelStore
  // The frame renders this and asks nothing else about the host. `markRaw` because it goes straight
  // into a `<component :is>`; a reactive proxy over a component definition breaks identity comparison
  // and makes Vue walk the whole definition.
  readonly view: Component

  constructor(store: PanelStore) {
    this.store = store
    // Guarded, because a store can legitimately be handed to more than one host over an application's
    // life — a type taken out of the row and entered again builds a new one, and while there is a single
    // application store the wiring hands that same one over. Registering twice is not an error the store
    // has any use for, and the warning it prints is noise about nothing.
    if (this.store.getDefinition(HOSTED_DEFINITION_ID) == null) {
      this.store.registerPanel({ id: HOSTED_DEFINITION_ID, title: 'Panel', component: HostedPanelView })
    }
    this.view = markRaw(defineComponent({ name: 'StorePanels', setup: () => () => h(PanelsLayout, { store }) }))
  }

  keys(): string[] {
    return this.store.getOrderedGroupIds().flatMap((groupId) => {
      const group = this.store.groups.value[groupId]
      return group == null ? [] : group.instances.map((instance) => keyOf(instance))
    })
  }

  has(key: string): boolean {
    return this.locate(key) != null
  }

  // Utility panels have no object snapshot; their instance id lets the workspace list and activate them.
  panel(key: string): HostedPanel | undefined {
    const found = this.locate(key)
    if (found == null) return undefined
    const group = this.store.groups.value[found.groupId]
    const instance = group?.instances.find((it) => it.instanceId === found.instanceId)
    if (instance == null) return undefined
    const props = instance.props ?? {}
    const hosted = hostedKeyOf(instance)
    if (hosted != null) {
      return {
        key: hosted,
        title: instance.title,
        component: props.component as Component,
        props: (props.componentProps ?? {}) as Record<string, unknown>,
      }
    }
    const definition = this.store.getDefinition(instance.definitionId)
    if (definition == null) return undefined
    return { key, title: instance.title, component: definition.component, props: { ...props } }
  }

  open(panel: HostedPanel): void {
    // De-duplication by key lives here rather than in every caller: re-opening what is open IS
    // switching to it, wherever it happens to sit.
    if (this.has(panel.key)) {
      this.activate(panel.key)
      return
    }
    this.store.openPanel(HOSTED_DEFINITION_ID, hostedProps(panel), panel.title)
  }

  replace(key: string, panel: HostedPanel): void {
    const found = this.locate(key)
    if (found == null) return
    // Keep the live instance even when a rename changes its object key.
    this.store.retargetPanel(found.instanceId, found.groupId, hostedProps(panel), panel.title)
  }

  close(key: string): void {
    const found = this.locate(key)
    if (found == null) return
    this.store.closePanel(found.instanceId, found.groupId)
  }

  activate(key: string): void {
    const found = this.locate(key)
    if (found == null) return
    // The group first: a tab in a split that is not the active cell has to bring its cell forward
    // too, or the person is switched to a tab they cannot see.
    this.store.activateGroup(found.groupId)
    this.store.activatePanel(found.instanceId, found.groupId)
  }

  activeKey(): string | null {
    const groupId = this.store.activeGroupId.value
    if (groupId == null) return null
    const group = this.store.groups.value[groupId]
    if (group == null || group.activeInstanceId == null) return null
    const instance = group.instances.find((it) => it.instanceId === group.activeInstanceId)
    return instance == null ? null : keyOf(instance)
  }

  serializeLayout(): Json | null {
    const root = this.store.layout.value
    if (root == null) return null

    const walk = (node: LayoutNode): LayoutSnapshot | null => {
      if (node.type === 'leaf') {
        const group = this.store.groups.value[node.groupId]
        // An empty leaf is not written down: a restored empty half of the screen is a dead zone the
        // person has no way to fill.
        if (group == null || group.instances.length === 0) return null
        const active = group.activeInstanceId
        const instances = group.instances
        return {
          keys: instances.map(keyOf),
          active: instances.filter((it) => it.instanceId === active).map(keyOf)[0] ?? null,
        }
      }
      const a = walk(node.first)
      const b = walk(node.second)
      // One half collapsed — there is no split at this level any more, only the other half.
      if (a == null) return b
      if (b == null) return a
      return { d: node.direction === 'horizontal' ? 'h' : 'v', r: node.ratio, a, b }
    }

    const snapshot = walk(root)
    // A single cell: there is nothing to say about it, and restoring puts everything in one anyway.
    return snapshot == null || !isSplitSnapshot(snapshot) ? null : snapshot
  }

  applyLayout(snapshot: Json | null): void {
    if (snapshot == null || !sane(snapshot, 0)) return

    // Every panel that is open, in the order it was opened. The layout only arranges these — it can
    // neither raise a tab nor drop one.
    //
    // Include utility panels: replacing the groups must preserve everything already open.
    const open = new Map<string, PanelInstance>()
    let hosted = false
    for (const groupId of this.store.getOrderedGroupIds()) {
      const group = this.store.groups.value[groupId]
      if (group == null) continue
      for (const instance of group.instances) {
        hosted ||= hostedKeyOf(instance) != null
        open.set(keyOf(instance), { ...instance })
      }
    }
    // The workspace raised nothing, so it has nothing to arrange — and no business rebuilding a layout
    // made entirely of somebody else's panels.
    if (!hosted) return

    const taken = new Set<string>()
    const built: Record<string, PanelGroup> = {}
    let firstGroupId: string | null = null

    const build = (node: LayoutSnapshot): LayoutNode => {
      if (isSplitSnapshot(node)) {
        return {
          type: 'split',
          splitId: nanoid(),
          direction: node.d === 'h' ? 'horizontal' : 'vertical',
          // The ratio is clamped on READ as well as on write: a record may carry anything from an
          // older version or from devtools.
          ratio: clampRatio(node.r),
          first: build(node.a),
          second: build(node.b),
        }
      }
      const groupId = nanoid()
      // A key with no panel behind it is dropped silently: the object was deleted from another
      // device, and a layout has no right to resurrect it.
      const instances = node.keys.flatMap((key) => {
        const instance = open.get(key)
        if (instance == null || taken.has(key)) return []
        taken.add(key)
        return [instance]
      })
      const active = node.active != null && taken.has(node.active) ? open.get(node.active) : undefined
      built[groupId] = {
        id: groupId,
        instances,
        activeInstanceId: (active ?? instances[0])?.instanceId ?? null,
      }
      firstGroupId ??= groupId
      return { type: 'leaf', groupId }
    }

    const tree = build(snapshot)

    // A panel the recorded layout says nothing about — opened later, on another device, or by an opener
    // that never went through the workspace — lands in the first cell rather than getting lost.
    const orphans = [...open.entries()].filter(([key]) => !taken.has(key)).map(([, instance]) => instance)
    if (orphans.length > 0 && firstGroupId != null) {
      const group = built[firstGroupId]
      built[firstGroupId] = {
        ...group,
        instances: [...group.instances, ...orphans],
        activeInstanceId: group.activeInstanceId ?? orphans[0].instanceId,
      }
    }

    // A leaf left empty collapses: half a screen with no tabs in it is useless.
    const prune = (node: LayoutNode): LayoutNode | null => {
      if (node.type === 'leaf') return built[node.groupId].instances.length > 0 ? node : null
      const a = prune(node.first)
      const b = prune(node.second)
      if (a == null) return b
      if (b == null) return a
      return { ...node, first: a, second: b }
    }
    const pruned = prune(tree)
    if (pruned == null) return

    const alive = new Set(getAllGroupIds(pruned))
    this.store.restore({
      groups: Object.fromEntries(Object.entries(built).filter(([id]) => alive.has(id))),
      layout: pruned,
      activeGroupId: getAllGroupIds(pruned)[0] ?? null,
    })
  }

  private locate(key: string): Located | undefined {
    for (const [groupId, group] of Object.entries(this.store.groups.value)) {
      const instance = group.instances.find((it) => keyOf(it) === key)
      if (instance != null) return { groupId, instanceId: instance.instanceId }
    }
    return undefined
  }
}
