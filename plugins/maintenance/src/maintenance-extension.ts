import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { BootPolicy } from './boot-policy'

export interface MaintenanceExtensionArgs extends ExtensionArgs {
  policy: BootPolicy
}

// Publishes the boot policy the instance booted on, so the Plugins settings page writes to the same
// object the composition root reads at startup.
export class MaintenanceExtension extends Extension {
  readonly policy: BootPolicy

  constructor(args: MaintenanceExtensionArgs) {
    super(args)
    this.policy = args.policy
  }
}
