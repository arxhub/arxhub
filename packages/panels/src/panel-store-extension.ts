import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { EventBus } from '@arxhub/events'
import { createPanelStore } from './panel-store'
import type { PanelStore } from './types'

type PanelStoreExtensionArgs = ExtensionArgs & { bus: EventBus }

export class PanelStoreExtension extends Extension {
  readonly store: PanelStore

  constructor(args: PanelStoreExtensionArgs) {
    super(args)
    this.store = createPanelStore(args.bus)
  }
}
