import './events'
import type { EventBus } from '@arxhub/events'
import { nanoid } from 'nanoid'
import { markRaw, readonly, ref } from 'vue'
import type { DropZone } from './composables/drag-types'
import type { LayoutLeaf, LayoutNode, LayoutSplit, PanelDefinition, PanelGroup, PanelInstance, PanelStore } from './types'

function findAndReplace(node: LayoutNode, target: LayoutNode, replacement: LayoutNode): LayoutNode {
  if (node === target) return replacement
  if (node.type === 'leaf') return node
  return {
    ...node,
    first: findAndReplace(node.first, target, replacement),
    second: findAndReplace(node.second, target, replacement),
  }
}

function findLeaf(node: LayoutNode, groupId: string): LayoutLeaf | null {
  if (node.type === 'leaf') return node.groupId === groupId ? node : null
  return findLeaf(node.first, groupId) ?? findLeaf(node.second, groupId)
}

function findParentSplit(root: LayoutNode, groupId: string): { split: LayoutSplit; isFirst: boolean } | null {
  if (root.type === 'leaf') return null
  if (root.first.type === 'leaf' && root.first.groupId === groupId) return { split: root, isFirst: true }
  if (root.second.type === 'leaf' && root.second.groupId === groupId) return { split: root, isFirst: false }
  return findParentSplit(root.first, groupId) ?? findParentSplit(root.second, groupId)
}

function findSplitById(node: LayoutNode, splitId: string): LayoutSplit | null {
  if (node.type === 'leaf') return null
  if (node.splitId === splitId) return node
  return findSplitById(node.first, splitId) ?? findSplitById(node.second, splitId)
}

function getAllGroupIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.groupId]
  return [...getAllGroupIds(node.first), ...getAllGroupIds(node.second)]
}

export function createPanelStore(bus: EventBus): PanelStore {
  const definitions = ref<PanelDefinition[]>([])
  const groups = ref<Record<string, PanelGroup>>({})
  const layout = ref<LayoutNode | null>(null)
  const activeGroupId = ref<string | null>(null)

  const store: PanelStore = {
    definitions: readonly(definitions),
    groups: readonly(groups),
    layout: readonly(layout),
    activeGroupId: readonly(activeGroupId),

    registerPanel(def: PanelDefinition): void {
      if (definitions.value.some((d) => d.id === def.id)) {
        console.warn(`Panel already registered: ${def.id}`)
        return
      }
      definitions.value = [...definitions.value, { ...def, component: markRaw(def.component) }]
    },

    getDefinition(id: string): PanelDefinition | undefined {
      return definitions.value.find((d) => d.id === id)
    },

    getPanelsForFile(ext: string): PanelDefinition[] {
      return definitions.value.filter((d) => d.handles?.includes(ext))
    },

    openPanel(definitionId: string, props?: Record<string, unknown>, title?: string, targetGroupId?: string): string {
      const def = definitions.value.find((d) => d.id === definitionId)
      if (!def) throw new Error(`Panel definition not found: ${definitionId}`)

      const instanceId = nanoid()
      const instance: PanelInstance = {
        instanceId,
        definitionId,
        title: title ?? def.title,
        props,
      }

      let groupId = targetGroupId ?? activeGroupId.value

      if (!groupId || !groups.value[groupId]) {
        groupId = nanoid()
        const newGroup: PanelGroup = { id: groupId, instances: [instance], activeInstanceId: instanceId }
        groups.value[groupId] = newGroup
        layout.value = { type: 'leaf', groupId }
        activeGroupId.value = groupId
        bus.emit('group:created', { groupId })
        bus.emit('group:activated', { groupId })
        bus.emit('panel:opened', { instanceId, groupId, definitionId })
        bus.emit('panel:activated', { instanceId, groupId })
      } else {
        const group = groups.value[groupId]
        const prevActiveId = group.activeInstanceId
        groups.value[groupId] = {
          ...group,
          instances: [...group.instances, instance],
          activeInstanceId: instanceId,
        }
        if (prevActiveId) bus.emit('panel:deactivated', { instanceId: prevActiveId, groupId })
        bus.emit('panel:opened', { instanceId, groupId, definitionId })
        bus.emit('panel:activated', { instanceId, groupId })
      }

      return instanceId
    },

    activatePanel(instanceId: string, groupId: string): void {
      const group = groups.value[groupId]
      if (!group) return
      const prevActiveId = group.activeInstanceId
      if (prevActiveId === instanceId) return
      if (prevActiveId) bus.emit('panel:deactivated', { instanceId: prevActiveId, groupId })
      groups.value[groupId] = { ...group, activeInstanceId: instanceId }
      bus.emit('panel:activated', { instanceId, groupId })
    },

    closePanel(instanceId: string, groupId: string): void {
      const group = groups.value[groupId]
      if (!group) return

      const remaining = group.instances.filter((i) => i.instanceId !== instanceId)
      const wasActive = group.activeInstanceId === instanceId

      if (wasActive) bus.emit('panel:deactivated', { instanceId, groupId })

      if (remaining.length === 0) {
        store.closeGroup(groupId)
        bus.emit('panel:closed', { instanceId, groupId })
        return
      }

      let nextActiveId = group.activeInstanceId
      if (wasActive) {
        const idx = group.instances.findIndex((i) => i.instanceId === instanceId)
        nextActiveId = (group.instances[idx + 1] ?? group.instances[idx - 1])?.instanceId ?? null
      }

      groups.value[groupId] = { ...group, instances: remaining, activeInstanceId: nextActiveId }
      bus.emit('panel:closed', { instanceId, groupId })
      if (wasActive && nextActiveId) bus.emit('panel:activated', { instanceId: nextActiveId, groupId })
    },

    activateGroup(groupId: string): void {
      if (activeGroupId.value === groupId) return
      activeGroupId.value = groupId
      bus.emit('group:activated', { groupId })
    },

    splitGroup(groupId: string, direction: 'horizontal' | 'vertical'): string {
      if (!layout.value) return groupId
      const leaf = findLeaf(layout.value, groupId)
      if (!leaf) return groupId

      const newGroupId = nanoid()
      const newGroup: PanelGroup = { id: newGroupId, instances: [], activeInstanceId: null }
      groups.value[newGroupId] = newGroup

      const newLeaf: LayoutLeaf = { type: 'leaf', groupId: newGroupId }
      const newSplit: LayoutSplit = { type: 'split', splitId: nanoid(), direction, ratio: 0.5, first: leaf, second: newLeaf }
      layout.value = findAndReplace(layout.value, leaf, newSplit)

      activeGroupId.value = newGroupId
      bus.emit('group:created', { groupId: newGroupId })
      bus.emit('group:activated', { groupId: newGroupId })

      return newGroupId
    },

    closeGroup(groupId: string): void {
      if (!layout.value) return

      delete groups.value[groupId]

      if (layout.value.type === 'leaf') {
        layout.value = null
        activeGroupId.value = null
        bus.emit('group:closed', { groupId })
        return
      }

      const parentInfo = findParentSplit(layout.value, groupId)
      if (!parentInfo) return

      const { split, isFirst } = parentInfo
      const sibling = isFirst ? split.second : split.first
      layout.value = findAndReplace(layout.value, split, sibling)

      if (activeGroupId.value === groupId) {
        const remaining = getAllGroupIds(layout.value)
        activeGroupId.value = remaining[0] ?? null
      }

      bus.emit('group:closed', { groupId })
    },

    setRatio(splitId: string, ratio: number): void {
      if (!layout.value) return
      const split = findSplitById(layout.value, splitId)
      if (!split) return
      const newSplit: LayoutSplit = { ...split, ratio: Math.max(0.1, Math.min(0.9, ratio)) }
      layout.value = findAndReplace(layout.value, split, newSplit)
    },

    movePanel(instanceId: string, fromGroupId: string, toGroupId: string, toIndex: number): void {
      const fromGroup = groups.value[fromGroupId]
      const toGroup = groups.value[toGroupId]
      if (!fromGroup || !toGroup) return

      const srcIndex = fromGroup.instances.findIndex((i) => i.instanceId === instanceId)
      if (srcIndex === -1) return

      const instance = fromGroup.instances[srcIndex]

      if (fromGroupId === toGroupId) {
        // toIndex is an insertion point; dropping at srcIndex or srcIndex+1 leaves order unchanged.
        if (toIndex === srcIndex || toIndex === srcIndex + 1) return
        const instances = [...fromGroup.instances]
        instances.splice(srcIndex, 1)
        const normalizedIndex = toIndex > srcIndex ? toIndex - 1 : toIndex
        instances.splice(normalizedIndex, 0, instance)
        groups.value[fromGroupId] = { ...fromGroup, instances }
        // Reorder does not change activation — no deactivated/activated events emitted.
        bus.emit('panel:moved', { instanceId, fromGroupId, toGroupId, toIndex: normalizedIndex })
        return
      }

      const wasActive = fromGroup.activeInstanceId === instanceId
      const remainingInstances = fromGroup.instances.filter((i) => i.instanceId !== instanceId)
      const clampedIndex = Math.min(toIndex, toGroup.instances.length)
      const shouldCloseFromGroup = remainingInstances.length === 0

      let nextActiveFromId = fromGroup.activeInstanceId
      if (wasActive && !shouldCloseFromGroup) {
        nextActiveFromId = (remainingInstances[srcIndex] ?? remainingInstances[srcIndex - 1] ?? remainingInstances[0]).instanceId
      }

      const prevActiveToId = toGroup.activeInstanceId

      // --- all state mutations ---
      const newToInstances = [...toGroup.instances]
      newToInstances.splice(clampedIndex, 0, instance)
      groups.value[toGroupId] = { ...toGroup, instances: newToInstances, activeInstanceId: instanceId }

      if (!shouldCloseFromGroup) {
        groups.value[fromGroupId] = { ...fromGroup, instances: remainingInstances, activeInstanceId: nextActiveFromId }
      }

      activeGroupId.value = toGroupId

      // --- all event emissions after mutations are complete ---
      if (wasActive) bus.emit('panel:deactivated', { instanceId, groupId: fromGroupId })
      if (prevActiveToId && prevActiveToId !== instanceId) {
        bus.emit('panel:deactivated', { instanceId: prevActiveToId, groupId: toGroupId })
      }
      bus.emit('panel:moved', { instanceId, fromGroupId, toGroupId, toIndex: clampedIndex })
      if (!shouldCloseFromGroup && wasActive && nextActiveFromId) {
        bus.emit('panel:activated', { instanceId: nextActiveFromId, groupId: fromGroupId })
      }
      bus.emit('panel:activated', { instanceId, groupId: toGroupId })
      bus.emit('group:activated', { groupId: toGroupId })

      // Close empty fromGroup last so group:closed fires after all panel lifecycle events.
      if (shouldCloseFromGroup) store.closeGroup(fromGroupId)
    },

    movePanelToZone(instanceId: string, fromGroupId: string, targetGroupId: string, zone: DropZone): void {
      if (zone === 'center') {
        const targetGroup = groups.value[targetGroupId]
        if (!targetGroup) return
        store.movePanel(instanceId, fromGroupId, targetGroupId, targetGroup.instances.length)
        return
      }

      if (!layout.value) return
      const targetLeaf = findLeaf(layout.value, targetGroupId)
      if (!targetLeaf) return

      const newGroupId = nanoid()
      groups.value[newGroupId] = { id: newGroupId, instances: [], activeInstanceId: null }

      const isAfter = zone === 'right' || zone === 'bottom'
      const direction: 'horizontal' | 'vertical' = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
      const newLeaf: LayoutLeaf = { type: 'leaf', groupId: newGroupId }
      const newSplit: LayoutSplit = {
        type: 'split',
        splitId: nanoid(),
        direction,
        ratio: 0.5,
        first: isAfter ? targetLeaf : newLeaf,
        second: isAfter ? newLeaf : targetLeaf,
      }
      layout.value = findAndReplace(layout.value, targetLeaf, newSplit)
      bus.emit('group:created', { groupId: newGroupId })

      store.movePanel(instanceId, fromGroupId, newGroupId, 0)
    },
  }

  return store
}
