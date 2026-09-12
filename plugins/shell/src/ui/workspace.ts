import { type Component, type ComputedRef, computed, ref } from 'vue'
import type { WorkspaceEmit } from './nav-events'
import { ObjectGoneView } from './object-gone'
import type { PanelHost } from './panel-host'
import { isObjectGone, isObjectType, type Json, type ObjectRef, type OpenedObject, objectGone, type TabType } from './tab-type'
import type { TabTypeRegistry } from './tab-type-registry'

// The space of one type. A type with objects gets its own panel host: groups, splitting and ratios
// live INSIDE the type, because a group is a cell of the layout and not a grouping of meaning. A type
// without objects opens no host: there is nothing to open in it, it is its own content.
export type TypeWorkspace =
  | { readonly kind: 'objects'; readonly panels: PanelHost; readonly objects: Map<string, OpenedObject> }
  | { readonly kind: 'content' }

// A tab as the shell sees it: exactly what has to be drawn as a row in the list of what is open.
export interface OpenedTab {
  readonly typeId: string
  readonly key: string
  readonly title: string
  readonly subtitle?: string
  // The tab's object did not come back from its snapshot. The tab is in place and marked.
  readonly gone: boolean
}

// A key of the row: the type plus what the workspace knows about it.
export interface TypeRowItem {
  readonly type: TabType
  readonly active: boolean
  // The badge count. 0 means no badge: either nothing is open, or the type never declared the "what is
  // open" role and has no second level at all.
  readonly count: number
}

export interface TabState {
  key: string
  title: string
  // The object's snapshot — whatever the type's `snapshot()` returned. The workspace does not look
  // inside it.
  object: Json
}

export interface TypeState {
  id: string
  activeKey: string | null
  tabs: TabState[]
  // Splits and ratios. Subordinate to the tab list: the layout can neither create a tab nor delete
  // one — it only arranges what `tabs` raised. No field — one cell, exactly as before.
  layout?: Json | null
}

// The pure data of a workspace. Separate from where and how it is stored: the device, the key version
// and localStorage are the storage layer's business.
export interface WorkspaceState {
  activeTypeId: string | null
  types: TypeState[]
}

export interface WorkspaceOptions {
  types: TabTypeRegistry
  // Where a type's open objects live. Required rather than defaulted to the panels package: the shell
  // must not import another plugin, so whoever assembles a `Workspace` names the host.
  createPanels: () => PanelHost
  // Announcements about what happened. Optional — a workspace with no listener is a workspace nobody
  // is saving yet, which is exactly the state before the persistence step lands.
  emit?: WorkspaceEmit
  // What a tab whose object is gone shows. The wording is shared, the presentation is the shell's.
  goneView?: Component
}

// The composite key of a mark. The separator is a character that occurs in neither a type id nor an
// object key — and it is written by NAME, not as a raw byte: a raw NUL in a source file is invisible
// to the eye and makes the file binary to git, after which its diff stops existing.
const GONE_SEPARATOR = '\u0000'

function goneId(typeId: string, key: string): string {
  return `${typeId}${GONE_SEPARATOR}${key}`
}

// The level ABOVE panel groups: the types and what is open inside them.
//
// The old model had one panel store for the whole application, and types could only be expressed as
// groups — seven types would have meant seven areas on screen at once. Here each type gets its own
// host and `Workspace` holds them all, plus the active type.
export class Workspace {
  private readonly types: TabTypeRegistry
  private readonly emit: WorkspaceEmit
  private readonly createPanels: () => PanelHost
  private readonly goneView: Component

  private readonly closing = new WeakMap<OpenedObject, Promise<void>>()
  private readonly spaces = new Map<string, TypeWorkspace>()
  // The order of the types open right now. Pinned ones stand in the row without it — this order is
  // about what the person opened, not about what is available to them.
  private readonly order = ref<string[]>([])
  private readonly active = ref<string | null>(null)
  // The "this object is gone" marks, one set for the whole workspace rather than one per type: the
  // state is shared and has no per-type wording.
  private readonly gone = ref<ReadonlySet<string>>(new Set())

  readonly activeTypeId: ComputedRef<string | null> = computed(() => this.active.value)
  readonly openTypeIds: ComputedRef<readonly string[]> = computed(() => this.order.value)

  // The row: pinned types always, unpinned ones for as long as they are open.
  readonly row: ComputedRef<TypeRowItem[]> = computed(() => {
    const pinned = this.types.pinned.value
    const pinnedIds = new Set(pinned.map((it) => it.id))
    const opened = this.order.value.filter((id) => !pinnedIds.has(id)).flatMap((id) => this.types.get(id) ?? [])
    return [...pinned, ...opened].map((type) => ({
      type,
      active: type.id === this.active.value,
      count: this.countOf(type),
    }))
  })

  constructor(options: WorkspaceOptions) {
    this.types = options.types
    this.createPanels = options.createPanels
    this.emit = options.emit ?? (() => {})
    this.goneView = options.goneView ?? ObjectGoneView
  }

  spaceOf(typeId: string): TypeWorkspace | undefined {
    return this.spaces.get(typeId)
  }

  panelsOf(typeId: string): PanelHost | undefined {
    const space = this.spaces.get(typeId)
    return space?.kind === 'objects' ? space.panels : undefined
  }

  // Switch to a type. An unpinned one takes its place in the row on the way, and a type never visited
  // before opens its space — entering a type IS opening it.
  activateType(typeId: string): void {
    const type = this.types.get(typeId)
    if (type == null) return
    if (this.ensureSpace(type)) this.emit('workspace:type-opened', { typeId })
    if (this.active.value === typeId) return
    this.active.value = typeId
    this.emit('workspace:type-activated', { typeId })
  }

  // Take a type out of the row together with its tabs. The objects stay in the vault: the row is a
  // list of what the person is busy with, not an archive of everything they ever opened.
  closeType(typeId: string): void {
    if (!this.spaces.has(typeId)) return
    this.spaces.delete(typeId)
    this.order.value = this.order.value.filter((it) => it !== typeId)
    this.forgetGone((id) => id === typeId)
    if (this.active.value === typeId) {
      const next =
        this.order.value[this.order.value.length - 1] ??
        (this.types.get(typeId)?.pinned === false ? this.types.pinned.value[0]?.id : null) ??
        null
      this.active.value = null
      if (next != null) this.activateType(next)
    }
    this.emit('workspace:type-closed', { typeId })
  }

  // Open an object — which is also the operation "switch to it". Callers do not need to check whether
  // it is already open: the de-duplication lives here, in one place. The type is still called every
  // time — on a repeat open it can reveal the right place inside the already-open object.
  async openObject(typeId: string, ref: ObjectRef): Promise<OpenedTab | null> {
    const type = this.types.get(typeId)
    if (type == null || !isObjectType(type)) return null

    // The object first, the switch second: a failed open leaves the person where they were.
    const object = await type.objects.open(ref)

    this.activateType(typeId)
    const space = this.spaces.get(typeId)
    if (space?.kind !== 'objects') return null

    if (!space.panels.has(object.key)) {
      space.objects.set(object.key, object)
      space.panels.open(this.hosted(typeId, object))
      this.emit('workspace:object-opened', { typeId, key: object.key })
    } else {
      // The object came back: the file was created again, or a rename was undone. The "this object is
      // gone" placeholder has to give way to the object itself, and IN ITS PLACE — the person never
      // moved that tab, so it does not move. Without this, re-opening a marked tab would leave the
      // gone message on screen on top of an object that exists.
      if (this.isGone(typeId, object.key)) {
        space.objects.set(object.key, object)
        space.panels.replace(object.key, this.hosted(typeId, object))
        this.forgetGone((id, key) => id === typeId && key === object.key)
      }
      space.panels.activate(object.key)
    }

    this.emit('workspace:object-activated', { typeId, key: object.key })
    return this.tabOf(typeId, object.key)
  }

  // Switch to an open tab. It restores the tab's type too: otherwise a "Welcome.md" tab would show the
  // contents of the neighbouring type.
  activateObject(typeId: string, key: string): void {
    const space = this.spaces.get(typeId)
    if (space?.kind !== 'objects' || !space.panels.has(key)) return

    this.activateType(typeId)
    space.panels.activate(key)
    this.emit('workspace:object-activated', { typeId, key })
  }

  closeObject(typeId: string, key: string, options: { discard?: boolean } = {}): void | Promise<void> {
    const space = this.spaces.get(typeId)
    if (space?.kind !== 'objects' || !space.panels.has(key)) return
    const object = space.objects.get(key)
    const finish = () => {
      // A rename, deletion or replacement while saving supersedes this close request.
      if (this.spaces.get(typeId) !== space || space.objects.get(key) !== object) return
      space.panels.close(key)
      space.objects.delete(key)
      this.forgetGone((id, objectKey) => id === typeId && objectKey === key)
      this.emit('workspace:object-closed', { typeId, key })
      const next = this.activeTab(typeId)
      if (next != null) this.emit('workspace:object-activated', { typeId, key: next.key })
    }
    if (options.discard || object?.beforeClose == null) return finish()
    const pending = this.closing.get(object)
    if (pending != null) return pending
    const beforeClose = object.beforeClose
    const operation = Promise.resolve()
      .then(beforeClose)
      .then(
        (saved) => {
          if (saved) finish()
        },
        () => {
          // The object owns error reporting. A rejected save must never become permission to close it.
        },
      )
      .finally(() => this.closing.delete(object))
    this.closing.set(object, operation)
    return operation
  }

  private hosted(typeId: string, object: OpenedObject) {
    return {
      key: object.key,
      title: object.title,
      component: object.component,
      props: object.props,
      requestClose: () => this.closeObject(typeId, object.key),
    }
  }

  tabsOf(typeId: string): OpenedTab[] {
    const space = this.spaces.get(typeId)
    if (space?.kind !== 'objects') return []
    return space.panels.keys().flatMap((key) => this.tabOf(typeId, key) ?? [])
  }

  // The active tab of a type, and with no argument the active tab of the active type.
  activeTab(typeId?: string): OpenedTab | null {
    const id = typeId ?? this.active.value
    if (id == null) return null
    const space = this.spaces.get(id)
    if (space?.kind !== 'objects') return null
    const key = space.panels.activeKey()
    return key == null ? null : this.tabOf(id, key)
  }

  objectOf(typeId: string, key: string): OpenedObject | undefined {
    const space = this.spaces.get(typeId)
    if (space?.kind !== 'objects') return undefined
    return space.objects.get(key) ?? this.adopted(space, key)
  }

  // The active type's dock: declared by the type, filled by the active object.
  dock(): Component | null {
    const id = this.active.value
    if (id == null) return null
    const type = this.types.get(id)
    if (type?.dock == null) return null
    const tab = this.activeTab(id)
    return type.dock(tab == null ? null : (this.objectOf(id, tab.key) ?? null))
  }

  isGone(typeId: string, key: string): boolean {
    return this.gone.value.has(goneId(typeId, key))
  }

  replaceObject(typeId: string, key: string, object: OpenedObject): void {
    const space = this.spaces.get(typeId)
    if (space?.kind !== 'objects' || !space.panels.has(key)) return
    if (object.key !== key && space.panels.has(object.key)) this.closeObject(typeId, object.key, { discard: true })
    space.objects.delete(key)
    space.objects.set(object.key, object)
    space.panels.replace(key, this.hosted(typeId, object))
    this.forgetGone((id, candidate) => id === typeId && candidate === key)
    this.emit('workspace:object-opened', { typeId, key: object.key })
  }

  markGone(typeId: string, key: string): void {
    const space = this.spaces.get(typeId)
    const object = this.objectOf(typeId, key)
    if (space?.kind !== 'objects' || object == null || !space.panels.has(key)) return
    const placeholder = this.placeholderFor(typeId, { key, title: object.title, object: object.snapshot() })
    space.objects.set(key, placeholder)
    space.panels.replace(key, this.hosted(typeId, placeholder))
    this.gone.value = new Set([...this.gone.value, goneId(typeId, key)])
    this.emit('workspace:object-gone', { typeId, key })
  }

  // The workspace snapshot. Data only: where to keep it and how to version it is the storage layer's
  // decision.
  serialize(): WorkspaceState {
    const types: TypeState[] = this.order.value.flatMap((typeId) => {
      const space = this.spaces.get(typeId)
      if (space == null) return []
      if (space.kind === 'content') return [{ id: typeId, activeKey: null, tabs: [] }]
      const tabs = space.panels.keys().flatMap((key) => {
        const object = space.objects.get(key)
        return object == null ? [] : [{ key, title: object.title, object: object.snapshot() }]
      })
      const layout = space.panels.serializeLayout()
      return [{ id: typeId, activeKey: this.activeTab(typeId)?.key ?? null, tabs, ...(layout == null ? {} : { layout }) }]
    })
    return { activeTypeId: this.active.value, types }
  }

  // Give the desk back. Silently: a restore is not news, it is the initial state, and the shell has
  // nothing to answer it with. The one exception is an object that is gone — that has to be said.
  //
  // Everything that arrives is data, not an order: an unknown type, a tab with no key, or a snapshot
  // the type did not understand are dropped one by one. One malformed field has no right to bring the
  // start-up down.
  async restore(state: WorkspaceState): Promise<void> {
    this.reset()

    for (const typeState of Array.isArray(state.types) ? state.types : []) {
      const type = typeState == null ? undefined : this.types.get(typeState.id)
      if (type == null) continue
      this.ensureSpace(type)
      const space = this.spaces.get(type.id)
      if (space?.kind !== 'objects' || !isObjectType(type)) continue

      for (const tab of Array.isArray(typeState.tabs) ? typeState.tabs : []) {
        if (tab == null || typeof tab.key !== 'string') continue
        // The type is allowed to throw: `revive` reads a store, and a store can be unavailable — the
        // network is down, the server answers 500, the disk is busy. ONE tab failing must not cost the
        // whole start-up, and it used to: the exception left here for the instance's
        // `await storage.restore()`, which failed BEFORE `app.mount()`, and the person got a blank
        // white screen instead of an application.
        //
        // Unavailable is treated as "the object is gone" — but with its snapshot kept: the mark clears
        // itself once the store is back and the person opens the tab again.
        let revived: Awaited<ReturnType<typeof type.objects.revive>>
        try {
          revived = await type.objects.revive(tab.object)
        } catch {
          revived = objectGone
        }
        if (isObjectGone(revived)) {
          const placeholder = this.placeholderFor(type.id, tab)
          space.objects.set(tab.key, placeholder)
          space.panels.open(this.hosted(type.id, placeholder))
          this.gone.value = new Set([...this.gone.value, goneId(type.id, tab.key)])
          this.emit('workspace:object-gone', { typeId: type.id, key: tab.key })
          continue
        }
        space.objects.set(revived.key, revived)
        space.panels.open(this.hosted(type.id, revived))
      }

      // The layout is applied AFTER every tab has been raised: it only arranges them. Did not make
      // sense of it — the tabs stay in one cell, which is exactly how it was before it existed.
      space.panels.applyLayout(typeState.layout ?? null)

      if (typeState.activeKey != null && space.panels.has(typeState.activeKey)) space.panels.activate(typeState.activeKey)
    }

    const requested = state.activeTypeId
    this.active.value = requested != null && this.spaces.has(requested) ? requested : (this.order.value[this.order.value.length - 1] ?? null)
  }

  // Forget everything that is open. The type registry is left alone: the types are not going anywhere,
  // the tabs are.
  reset(): void {
    this.spaces.clear()
    this.order.value = []
    this.active.value = null
    this.gone.value = new Set()
  }

  private ensureSpace(type: TabType): boolean {
    if (this.spaces.has(type.id)) return false
    this.spaces.set(type.id, isObjectType(type) ? { kind: 'objects', panels: this.createPanels(), objects: new Map() } : { kind: 'content' })
    this.order.value = [...this.order.value, type.id]
    return true
  }

  private countOf(type: TabType): number {
    if (type.open == null) return 0
    return type.open.count?.() ?? this.tabsOf(type.id).length
  }

  // A panel the host holds that the workspace never opened. Every opener in the application still
  // writes to the panel store directly (the second half of F-21/F-22), so while that is true a type's
  // host legitimately holds tabs the workspace has no object for — and a list of what is open that
  // silently omits them would be worse than no list. Deliberately NOT put into `space.objects`:
  // `serialize` walks that map, and a panel with no snapshot has nothing to write down.
  private adopted(space: Extract<TypeWorkspace, { kind: 'objects' }>, key: string): OpenedObject | undefined {
    const panel = space.panels.panel(key)
    if (panel == null) return undefined
    return { key: panel.key, title: panel.title, component: panel.component, props: panel.props, snapshot: () => null }
  }

  private tabOf(typeId: string, key: string): OpenedTab | null {
    const space = this.spaces.get(typeId)
    if (space?.kind !== 'objects') return null
    const own = space.objects.get(key)
    const object = own ?? this.adopted(space, key)
    if (object == null) return null
    // An adopted panel has no type-side object, so there is nothing to ask `label()` about: its title
    // is whatever the host is showing.
    if (own == null) return { typeId, key, title: object.title, gone: false }

    const gone = this.isGone(typeId, key)
    const type = this.types.get(typeId)
    // A marked tab takes its label from the saved title: the object the type could have told us more
    // about is no longer there.
    const label = gone || type == null || !isObjectType(type) ? { title: object.title } : type.objects.label(object)
    return { typeId, key, title: label.title, subtitle: label.subtitle, gone }
  }

  private placeholderFor(typeId: string, tab: TabState): OpenedObject {
    return {
      key: tab.key,
      title: tab.title,
      component: this.goneView,
      // The way to close it goes in here too: text with no way out is not a message but a dead end,
      // and looking for the close in the search sheet or the type's second level means going two
      // screens away from the thing that broke.
      props: { typeId, objectKey: tab.key, title: tab.title, onClose: () => this.closeObject(typeId, tab.key) },
      // The snapshot is kept as it was: until the person decides what to do, the tab survives the next
      // start-up too — the object may yet come back.
      snapshot: () => tab.object,
    }
  }

  private forgetGone(matches: (typeId: string, key: string) => boolean): void {
    const next = new Set(
      [...this.gone.value].filter((id) => {
        const [typeId, key] = id.split(GONE_SEPARATOR)
        return !matches(typeId, key)
      }),
    )
    if (next.size !== this.gone.value.size) this.gone.value = next
  }
}
