import type { Component, DeepReadonly, Ref } from 'vue'

export type PanelComponent = Component

export interface PanelDefinition {
  id: string
  title: string
  icon?: string
  component: PanelComponent
  handles?: string[]
}

export interface PanelInstance {
  instanceId: string
  definitionId: string
  title: string
  props?: Record<string, unknown>
}

export interface PanelGroup {
  id: string
  instances: PanelInstance[]
  activeInstanceId: string | null
}

export type LayoutLeaf = { type: 'leaf'; groupId: string }
export type LayoutSplit = {
  type: 'split'
  splitId: string
  direction: 'horizontal' | 'vertical'
  ratio: number
  first: LayoutNode
  second: LayoutNode
}
export type LayoutNode = LayoutLeaf | LayoutSplit

export interface PanelStore {
  readonly definitions: DeepReadonly<Ref<PanelDefinition[]>>
  readonly groups: DeepReadonly<Ref<Record<string, PanelGroup>>>
  readonly layout: DeepReadonly<Ref<LayoutNode | null>>
  readonly activeGroupId: DeepReadonly<Ref<string | null>>
  registerPanel(def: PanelDefinition): void
  getDefinition(id: string): PanelDefinition | undefined
  getPanelsForFile(ext: string): PanelDefinition[]
  openPanel(definitionId: string, props?: Record<string, unknown>, title?: string, targetGroupId?: string): string
  activatePanel(instanceId: string, groupId: string): void
  closePanel(instanceId: string, groupId: string): void
  activateGroup(groupId: string): void
  splitGroup(groupId: string, direction: 'horizontal' | 'vertical'): string
  closeGroup(groupId: string): void
  setRatio(splitId: string, ratio: number): void
  movePanel(instanceId: string, fromGroupId: string, toGroupId: string, toIndex: number): void
}
