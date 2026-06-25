import { createKey, type LazyContainer } from '@arxhub/di'
import { Logger } from './logger'

// Root logger — the instance's base, unprefixed logger. DI key resolving directly to the logger the
// instance bound via LoggerPlugin. The per-plugin `Logger` is derived from it. Not normally read
// directly by plugins (they use the scoped `Logger`, or the equivalent this.logger).
export const RootLogger = createKey<Logger>('RootLogger')

// Structural shape of the plugin handed to the configurer — only its name is needed here. Kept
// local (rather than importing Plugin from @arxhub/core) so this leaf package stays free of a core
// dependency; @arxhub/core depends on @arxhub/logger, not the other way around.
type NamedPlugin = { manifest: { name: string } }

// ScopeConfigurer for PluginHost.configureScope (called from LoggerPlugin.setup): binds a per-plugin
// `Logger` into each plugin's DI scope, derived from the instance-bound RootLogger + the plugin name.
// Lazy — RootLogger is only resolved when a plugin actually reads its scoped Logger.
export function bindPluginLogger(scope: LazyContainer<object>, plugin: NamedPlugin): void {
  scope.bind(Logger, () => scope.get(RootLogger).child(`[${plugin.manifest.name}] - `))
}
