export interface PanelTabDragData extends Record<string, unknown> {
  type: 'panel-tab'
  instanceId: string
  groupId: string
  index: number
}

export function isPanelTabDragData(data: Record<string, unknown>): data is PanelTabDragData {
  return data.type === 'panel-tab' && typeof data.instanceId === 'string' && typeof data.groupId === 'string' && typeof data.index === 'number'
}
