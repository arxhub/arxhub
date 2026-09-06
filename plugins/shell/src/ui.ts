export { default as AboutSettingsPage } from './ui/AboutSettingsPage.vue'
export type { FooterItem, MobileTab, ShellItem } from './ui/extension'
export { ShellExtension } from './ui/extension'
export { default as MiniAppShell } from './ui/MiniAppShell.vue'
export type { WorkspaceEmit, WorkspaceEvents } from './ui/nav-events'
export { OBJECT_GONE_MESSAGE, OBJECT_GONE_TITLE, ObjectGoneView } from './ui/object-gone'
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
export type { SidebarItem } from './ui/types'
export { RAIL_MAX, RAIL_MIN, useRailWidth } from './ui/use-rail-width'
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
