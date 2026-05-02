export interface PanelTabDragData extends Record<string, unknown> {
  type: 'panel-tab'
  instanceId: string
  groupId: string
  index: number
}

export function isPanelTabDragData(data: Record<string, unknown>): data is PanelTabDragData {
  return data.type === 'panel-tab' && typeof data.instanceId === 'string' && typeof data.groupId === 'string' && typeof data.index === 'number'
}

export type DropZone = 'top' | 'right' | 'bottom' | 'left' | 'center'

export function calculateDropZone(
  input: { clientX: number; clientY: number },
  el: Element,
): DropZone {
  const rect = el.getBoundingClientRect()
  const x = (input.clientX - rect.left) / rect.width
  const y = (input.clientY - rect.top) / rect.height
  const t = 0.25
  if (y < t) return 'top'
  if (y > 1 - t) return 'bottom'
  if (x < t) return 'left'
  if (x > 1 - t) return 'right'
  return 'center'
}

export interface PanelGroupBodyDropData extends Record<string, unknown> {
  type: 'panel-group-body'
  groupId: string
  zone: DropZone
}
