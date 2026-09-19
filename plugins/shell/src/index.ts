export { ShellExtension } from './ui/extension'
export { overlayLayerId, SHEET_LAYER, typeLayerId } from './ui/hotkeys'
export type { WorkspaceEmit, WorkspaceEvents } from './ui/nav-events'
export type { NavHost } from './ui/nav-host'
export type { HostedPanel, PanelHost } from './ui/panel-host'
export { ShellPlugin } from './ui/plugin'
export { type StatusBusy, type StatusBusyEntry, type StatusItem, StatusRegistry } from './ui/status'
export type {
  ContentTabType,
  Json,
  ObjectGone,
  ObjectLabel,
  ObjectRef,
  ObjectsRole,
  ObjectTabType,
  OpenedObject,
  TabType,
  TabTypeCreate,
  TabTypeNav,
  TabTypeOpen,
} from './ui/tab-type'
export { isObjectGone, isObjectType, isPinned, objectGone } from './ui/tab-type'
export { TabTypeRegistry } from './ui/tab-type-registry'
export {
  type OpenedTab,
  type TabState,
  type TypeRowItem,
  type TypeState,
  type TypeWorkspace,
  Workspace,
  type WorkspaceOptions,
  type WorkspaceState,
} from './ui/workspace'
export {
  COLUMN_MAX,
  COLUMN_MIN,
  type ColumnState,
  clampColumnWidth,
  type StorageLike,
  WORKSPACE_BACKUP_KEY,
  WORKSPACE_KEY,
  WORKSPACE_VERSION,
  WorkspaceStorage,
  type WorkspaceStorageOptions,
} from './ui/workspace-storage'
