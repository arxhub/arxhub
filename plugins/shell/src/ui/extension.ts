import { Extension, type ExtensionArgs } from '@arxhub/core'
import { shallowRef } from 'vue'
import { StatusRegistry } from './status'
import { TabTypeRegistry } from './tab-type-registry'
import type { Workspace } from './workspace'
import type { WorkspaceStorage } from './workspace-storage'

// One navigation model, and two registries carrying it.
//
// `types` is the model: a plugin declares a tab TYPE once instead of describing the same thing twice (a
// rail item for the desktop, a bar key for the phone), and both frames draw the same registry. `status`
// is the same idea for the bar — a plugin says WHAT it contributes rather than WHERE to put it, and one
// registration is laid out three ways (the desktop bar, the phone's status block, the background line).
//
// What is gone: `header`, `content` and `setContent` (F-12) — zero call sites, and the header never
// rendered once — `footer` with `FooterItem`/`ShellItem.region` (F-13), whose five call sites now say
// what they contribute instead of where to put it, `tabs` with `MobileTab` (F-18), the phone's second
// dictionary for what `types` now says once, and `sidebar` with `SidebarItem`/`SidebarRegistry`
// (F-24/F-25), the mini-app model the type registry replaced. All four were removed rather than
// reworked, each once its last registrar had moved.
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

  get attachedWorkspace(): Workspace | null {
    return this.desk.value?.workspace ?? null
  }

  get workspaceStorage(): WorkspaceStorage {
    const desk = this.desk.value
    if (desk == null) throw new Error('No workspace attached to the shell: the instance must call attachWorkspace() before mounting a frame')
    return desk.storage
  }
}
