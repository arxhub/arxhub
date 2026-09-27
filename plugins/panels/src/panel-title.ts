import type { PanelInstance, PanelStore } from './types'

export function panelTitle(store: Pick<PanelStore, 'getDefinition'>, instance: PanelInstance): string {
  const title = store.getDefinition(instance.definitionId)?.title
  return typeof title === 'function' ? title() : instance.title
}
