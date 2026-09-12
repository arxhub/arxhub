import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { EventBus } from '@arxhub/events'
import { createPanelStore } from './panel-store'
import type { PanelStore } from './types'
import { restoreAndPersistWorkspace } from './workspace-persistence'

type PanelStoreExtensionArgs = ExtensionArgs & { bus: EventBus }

export class PanelStoreExtension extends Extension {
  readonly store: PanelStore
  readonly stopLegacyPersistence: () => void

  constructor(args: PanelStoreExtensionArgs) {
    super(args)
    this.store = createPanelStore(args.bus)
    // Definitions aren't restored (they come fresh from each plugin's own registration this boot), but
    // groups/layout/activeGroupId are — a restored group's definitionId resolves the moment a plugin
    // registers it, and every plugin's configure() runs well before this is ever rendered.
    this.stopLegacyPersistence = restoreAndPersistWorkspace(this.store)
  }
}
