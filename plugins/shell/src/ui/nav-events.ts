// The dictionary of the application's navigation events, all of them at the `Workspace` level: the
// shell cares that "an object of such a type was opened", not that "a panel landed in a group".
//
// On the branch this is declaration-merged into `@arxhub/events`' EventMap and emitted through the
// app-wide bus. Here it is a local map with an emit callback, because the shell package does not
// depend on `@arxhub/events` and adding the dependency is a separate step. The callback's signature is
// exactly `EventBus.emit`, so the day the shell does take that dependency the wiring is
// `emit: bus.emit.bind(bus)` and this map moves into the merged declaration unchanged.
export interface WorkspaceEvents {
  // A type took its place in the row — either the person entered it for the first time, or opened an
  // unpinned one.
  'workspace:type-opened': { typeId: string }
  // A type was taken out of the row together with its tabs. The objects stay in the vault.
  'workspace:type-closed': { typeId: string }
  'workspace:type-activated': { typeId: string }
  'workspace:object-opened': { typeId: string; key: string }
  'workspace:object-closed': { typeId: string; key: string }
  'workspace:object-activated': { typeId: string; key: string }
  // A tab's object did not come back from its snapshot: the tab stays and is marked.
  'workspace:object-gone': { typeId: string; key: string }
}

export type WorkspaceEmit = <K extends keyof WorkspaceEvents>(event: K, payload: WorkspaceEvents[K]) => void
