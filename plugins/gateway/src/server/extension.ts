import { Extension, type ExtensionArgs, type Plugin } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { Gateway, NamespacedGateway } from './gateway'

export class GatewayServerExtension extends Extension {
  readonly gateway: Gateway

  constructor(args: ExtensionArgs) {
    super(args)
    this.gateway = new Gateway(this.logger)
  }

  // The specialized, namespace-scoped gateway for a plugin: `forPlugin(this).use(routes)` mounts the
  // plugin's RELATIVE routes under `/api/<manifest.namespace>`. arxhub owns the `/api` + namespace; the
  // plugin never hardcodes the prefix. A plugin that mounts routes MUST declare manifest.namespace.
  forPlugin(plugin: Plugin): NamespacedGateway {
    const namespace = plugin.manifest.namespace
    if (namespace == null) throw illegalState(`Plugin "${plugin.name}" mounts routes but declares no manifest.namespace`)
    return new NamespacedGateway(this.gateway, namespace)
  }
}
