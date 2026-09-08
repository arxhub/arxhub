import { Extension, type ExtensionArgs } from '@arxhub/core'
import { markRaw, reactive, shallowRef } from 'vue'
import { StatusRegistry } from './status'
import { TabTypeRegistry } from './tab-type-registry'
import type { SidebarItem } from './types'
import type { Workspace } from './workspace'
import type { WorkspaceStorage } from './workspace-storage'

export type { SidebarItem }

// A key in the mobile frame's bottom bar. The bar is the only navigation a phone gets, so a plugin
// that owns something reachable there contributes a tab instead of a strip widget — the desktop frame
// ignores these entirely.
export interface MobileTab {
  id: string
  // Icon spec string resolved by uikit's Icon registry.
  icon: string
  title: string
  order?: number
  // Read on every render: a count the tab carries (open documents, unread logs). 0 shows no badge.
  badge?: () => number
  // Selecting a tab is an action, not a route — it may activate a mini-app, raise a sheet, or open a
  // panel. The frame only asks whether the tab reads as active, which is the tab's own business.
  active?: () => boolean
  onSelect: () => void
  // What being active MEANS for this key, which decides how the bar states it.
  //
  // A 'place' is where you are — one of the mini-apps — and exactly one is ever active, so it takes
  // the accent, the same as a selected row or tab anywhere else in the app.
  //
  // A 'layer' is something open on top of where you are: the navigation panel, the More sheet. It can
  // be active at the same time as a place, and when both wore the accent the bar showed two selected
  // keys and answered neither "where am I" nor "what is open". A layer states itself with a raised
  // fill instead.
  role?: 'place' | 'layer'
  // Binds a screen-edge drag to this tab, so the two layers reachable one-handed do not cost a trip
  // to the bar. At most one tab per edge; a later claim on a taken edge is ignored.
  gesture?: 'left-edge' | 'right-edge'
}

// The two remaining registries are typed by hand rather than inferred. `reactive()` infers through
// `UnwrapNestedRefs`, whose declaration reaches `LooseRequired` in `@vue/shared` — a name the emitted
// `.d.ts` cannot get to, so the build reports the field as unnameable (TS2883). An annotation is what
// the compiler asks for, and it costs nothing here: two fixed shapes, both of which go away with the
// last mini-app (F-18/F-21).
export interface SidebarRegistry {
  items: SidebarItem[]
  activeId: string
  register(item: SidebarItem): void
  unregister(id: string): void
  setActive(id: string): void
}

export interface MobileTabRegistry {
  items: MobileTab[]
  register(tab: MobileTab): void
  unregister(id: string): void
}

// Two navigation models live here at once, on purpose, and the frames run on the new one.
//
// `types` is it: a plugin declares a tab TYPE once instead of describing the same thing twice (a rail
// item for the desktop, a bar key for the phone), and both frames draw the same registry. `status` is
// the same idea for the bar — a plugin says WHAT it contributes rather than WHERE to put it, and one
// registration is laid out three ways (the desktop bar, the phone's status block, the background line).
//
// The old `sidebar` is still here because four plugins still register through it. `use-navigation.ts`
// reads a `SidebarItem` as a type with no objects so those keep reaching the screen; the bridge empties
// itself as each plugin moves over (F-23…F-25). `tabs` has no registrar left at all and no renderer —
// it goes with F-18.
//
// What is already gone: `header`, `content` and `setContent` (F-12) — zero call sites, and the header
// never rendered once — and `footer` with `FooterItem`/`ShellItem.region` (F-13), whose five call sites
// now say what they contribute instead of where to put it. Both were removed rather than reworked.
export class ShellExtension extends Extension {
  // The tab-type registry: the row and the "open new" section of the search sheet are built from it.
  readonly types: TabTypeRegistry
  // The desktop status bar, the status block of the phone's sheet and the background line, all from the
  // same registrations.
  readonly status: StatusRegistry

  // shallowRef, not a plain field: the two halves are put here by the composition root before the
  // first mount, and a frame that read a plain field during its own setup would never see the write if
  // that order ever changed.
  private readonly desk = shallowRef<{ workspace: Workspace; storage: WorkspaceStorage } | null>(null)

  readonly sidebar: SidebarRegistry = reactive({
    items: [] as SidebarItem[],
    activeId: '',
    register(item: SidebarItem): void {
      this.items = [...this.items, { ...item, layout: item.layout ? markRaw(item.layout) : undefined }]
      if (!this.activeId && item.region !== 'bottom') {
        this.activeId = item.id
      }
    },
    unregister(id: string): void {
      this.items = this.items.filter((i) => i.id !== id)
    },
    setActive(id: string): void {
      this.activeId = id
    },
  })

  readonly tabs: MobileTabRegistry = reactive({
    items: [] as MobileTab[],
    register(tab: MobileTab): void {
      this.items = [...this.items, tab]
    },
    unregister(id: string): void {
      this.items = this.items.filter((t) => t.id !== id)
    },
  })

  constructor(args: ExtensionArgs) {
    super(args)
    const warn = (message: string): void => {
      this.logger.warn(message)
    }
    this.types = new TabTypeRegistry(warn)
    this.status = new StatusRegistry(warn)
  }

  // The desk both frames render. It is put here rather than built here because only a composition root
  // may hold both halves: the workspace needs a panel host per type, and the shell must not import the
  // panels plugin to get one. The instance builds them and hands them over before anything mounts.
  attachWorkspace(workspace: Workspace, storage: WorkspaceStorage): void {
    this.desk.value = { workspace, storage }
  }

  get workspace(): Workspace {
    const desk = this.desk.value
    // A frame with no desk has nothing to draw at all, and finding that out as `undefined is not an
    // object` three components deep is how a missing wiring line becomes an afternoon.
    if (desk == null) throw new Error('No workspace attached to the shell: the instance must call attachWorkspace() before mounting a frame')
    return desk.workspace
  }

  get workspaceStorage(): WorkspaceStorage {
    const desk = this.desk.value
    if (desk == null) throw new Error('No workspace attached to the shell: the instance must call attachWorkspace() before mounting a frame')
    return desk.storage
  }
}
