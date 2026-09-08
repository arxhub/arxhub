import { useArxHub } from '@arxhub/uikit/hooks'
import { ShellExtension } from './extension'
import type { StatusRegistry } from './status'
import type { TabTypeRegistry } from './tab-type-registry'
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
// It used to carry a bridge as well: mini-apps registered on `ShellExtension.sidebar` were read as types
// with no objects, and `sidebar.activeId` was kept in step with the active type in both directions. Both
// halves are gone with F-24/F-25 — settings, search and the log viewer register types of their own, so
// there is nothing left to translate and nothing left to keep in step.
export function useNavigation(): Navigation {
  const shell = useArxHub().extensions.get(ShellExtension)
  return {
    shell,
    workspace: shell.workspace,
    storage: shell.workspaceStorage,
    types: shell.types,
    status: shell.status,
  }
}
