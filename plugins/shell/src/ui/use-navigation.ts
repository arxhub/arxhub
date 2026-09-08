import { useArxHub } from '@arxhub/uikit/hooks'
import { markRaw, watch, watchEffect } from 'vue'
import { ShellExtension } from './extension'
import type { StatusRegistry } from './status'
import type { TabTypeRegistry } from './tab-type-registry'
import type { SidebarItem } from './types'
import type { Workspace } from './workspace'
import type { WorkspaceStorage } from './workspace-storage'

export interface Navigation {
  readonly shell: ShellExtension
  readonly workspace: Workspace
  readonly storage: WorkspaceStorage
  readonly types: TabTypeRegistry
  readonly status: StatusRegistry
}

// What both frames read. They differ in where a thing lands on screen, never in what it is — so the
// derivation lives here and a plugin's contribution reaches the phone the moment it reaches the
// desktop, with no second wiring to forget.
//
// Call it once per frame, from the frame's own setup: it also runs the two migrations below, and both
// of them install watchers that must live for as long as the application does.
export function useNavigation(): Navigation {
  const shell = useArxHub().extensions.get(ShellExtension)
  const navigation: Navigation = {
    shell,
    workspace: shell.workspace,
    storage: shell.workspaceStorage,
    types: shell.types,
    status: shell.status,
  }
  adoptMiniApps(navigation)
  return navigation
}

// The order a mini-app of the 'bottom' region takes in the row. It is a utility — settings, logs —
// and sits after the places you work in, exactly as it sits at the foot of the desktop rail.
const BOTTOM_ORDER = 900

// Mini-apps that have not become types yet, shown as types anyway.
//
// The frames read the type registry now, and four plugins still register a `SidebarItem` instead of a
// type: settings (F-23 landed only the panel-store half), search (F-24), logger (F-25) and anything a
// third party wrote against today's API. Dropping them from the row would take Settings, Search and
// the log viewer off the screen for the sake of a migration that is not theirs.
//
// So a mini-app is read as what it always was: a type with no objects, whose content is its layout. It
// is a translation, not a second model — the row, the accent, the KeepAlive and the persistence all
// come from the one registry — and it empties itself as each plugin registers a type of its own,
// because a type already registered under that id is never overwritten.
function toContentType(item: SidebarItem): Parameters<TabTypeRegistry['register']>[0] {
  return {
    id: item.id,
    icon: item.icon,
    title: item.title,
    order: (item.region === 'bottom' ? BOTTOM_ORDER : 0) + (item.order ?? 0),
    // A hidden mini-app has no rail icon and never had one: it is opened from a status item
    // (`sidebar.setActive('arxhub.logs')`), which the two-way sync below turns into activating the
    // type. Unpinned is exactly that — no place in the row, still reachable.
    pinned: item.hidden !== true,
    content: item.layout == null ? markRaw({ render: () => null }) : markRaw(item.layout),
  }
}

function adoptMiniApps(navigation: Navigation): void {
  const { shell, workspace, types } = navigation

  // An effect rather than a one-shot: registration happens as plugins configure, and a plugin that
  // registers later (or a maintenance boot that leaves one out) must not depend on having beaten the
  // first render.
  watchEffect(() => {
    for (const item of shell.sidebar.items) {
      if (!types.has(item.id)) types.register(toContentType(item))
    }
  })

  // The one bridge that has to run in both directions. Five plugins reach a mini-app by name —
  // `sidebar.setActive('arxhub.settings')` from the sync, auth, maintenance and settings status items,
  // `'arxhub.logs'` from the logger's — and the row is what answers now; while the old registry is
  // still the thing those call sites know, the two have to agree on where the person is.
  //
  // Neither watcher is immediate and both compare first, so this settles rather than oscillates.
  watch(
    () => shell.sidebar.activeId,
    (id) => {
      if (id !== '' && workspace.activeTypeId.value !== id) workspace.activateType(id)
    },
  )
  watch(workspace.activeTypeId, (id) => {
    if (id != null && shell.sidebar.activeId !== id) shell.sidebar.setActive(id)
  })
}
