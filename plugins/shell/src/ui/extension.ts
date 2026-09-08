import { Extension, type ExtensionArgs } from '@arxhub/core'
import { markRaw, reactive, shallowRef } from 'vue'
import { StatusRegistry } from './status'
import { TabTypeRegistry } from './tab-type-registry'
import type { SidebarItem } from './types'
import type { Workspace } from './workspace'
import type { WorkspaceStorage } from './workspace-storage'

export type { SidebarItem }

// Typed by hand rather than inferred. `reactive()` infers through `UnwrapNestedRefs`, whose declaration
// reaches `LooseRequired` in `@vue/shared` — a name the emitted `.d.ts` cannot get to, so the build
// reports the field as unnameable (TS2883). An annotation is what the compiler asks for, and it costs
// nothing here: one fixed shape, which goes away with the last mini-app (F-23…F-25).
export interface SidebarRegistry {
  items: SidebarItem[]
  activeId: string
  register(item: SidebarItem): void
  unregister(id: string): void
  setActive(id: string): void
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
// itself as each plugin moves over (F-23…F-25).
//
// What is already gone: `header`, `content` and `setContent` (F-12) — zero call sites, and the header
// never rendered once — `footer` with `FooterItem`/`ShellItem.region` (F-13), whose five call sites now
// say what they contribute instead of where to put it, and `tabs` with `MobileTab` (F-18), the phone's
// second dictionary for what `types` now says once. All three were removed rather than reworked.
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
