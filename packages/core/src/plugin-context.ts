import type { LazyContainer } from '@arxhub/di'
import type { EventBus } from '@arxhub/events'
import type { ExtensionContainer } from './extension'
import type { Plugin } from './plugin'

// A DI scope (the per-plugin child of the root `services` container). Domain packages type their
// scope configurers against this without re-importing the container.
export type ServiceScope = LazyContainer<object>

// Configures a single plugin's DI scope. Run once per plugin (as its context is built) with the
// plugin being configured — so the configurer can tune the scope from the plugin's `manifest` (e.g.
// its id) or its `constructor` (class-level metadata). This is how a domain package (e.g. @arxhub/vfs)
// binds a per-plugin service without core depending on it.
export type ScopeConfigureCallback = (scope: ServiceScope, plugin: Plugin) => void

// The narrow host a plugin configures during its `setup` phase (before any context is built). Lets a
// plugin wire instance-level infrastructure that applies to EVERY plugin — e.g. VfsPlugin registers
// the root VFS service + a per-plugin VFS scope binding here. Deliberately NOT the whole ArxHub: no
// plugin registry, no lifecycle control.
export interface PluginHost {
  // The root DI scope. Register shared infrastructure services here (e.g. RootVfs) so they're
  // resolvable from every plugin's scope.
  readonly services: ServiceScope
  configureScope(configure: ScopeConfigureCallback): void
}

// What a plugin sees during its lifecycle (create/configure/start/stop). Deliberately narrow: no
// plugin registry, no start/stop — inter-plugin communication stays via extensions. Core is
// domain-agnostic, so anything concrete (the VFS, the logger, etc.) is resolved from `services` by
// DI; the token (e.g. Vfs from @arxhub/vfs, Logger from @arxhub/logger) is owned by its domain
// package and bound via a ScopeConfigurer. (The base Plugin still exposes its own `this.logger`.)
export interface PluginContext {
  readonly extensions: ExtensionContainer
  readonly events: EventBus
  // This plugin's own DI scope (a child of the root services container). Falls through to shared
  // services on a miss; locally-bound tokens (e.g. Vfs, the per-plugin Logger) stay isolated to this
  // plugin.
  readonly services: LazyContainer<object>
}
