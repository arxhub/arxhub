import { Plugin, type PluginArgs, type PluginHost } from '@arxhub/core'
import { bindPluginLogger, type Logger, RootLogger } from '@arxhub/logger'
import { manifest } from './manifest'

// Provides logging via DI, mirroring VfsPlugin: binds the instance's base logger as the RootLogger
// service, then a per-plugin PluginLogger (a name-prefixed child) into every plugin's scope. Lets
// DI-resolved leaf services (e.g. the scoped PluginConfig) pull the owning plugin's logger from the
// container — the same logger a plugin already gets as this.logger, now also via ctx.services.get(Logger).
export class LoggerPlugin extends Plugin {
  // The instance's base, unprefixed logger (ArxHub's root logger), captured before the base
  // constructor prefixes `this.logger` with this plugin's own name.
  private readonly rootLogger: Logger

  constructor(args: PluginArgs) {
    super(args, manifest)
    this.rootLogger = args.logger
  }

  override setup(host: PluginHost): void {
    host.services.bind(RootLogger, () => this.rootLogger)
    host.configureScope(bindPluginLogger)
  }
}
