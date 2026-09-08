import { Plugin, type PluginArgs, type PluginContext, type PluginHost } from '@arxhub/core'
import { bindPluginLogger, LogBufferKey, type Logger, RootLogger } from '@arxhub/logger'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { PluginVfs } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { LogFileWriter } from './log-file-writer'
import { LoggerExtension } from './logger-extension'
import { manifest } from './manifest'
import LogStatus from './ui/LogStatus.vue'
import LogViewerPanel from './ui/LogViewerPanel.vue'

// Provides logging via DI (binds the instance's base logger as RootLogger + a per-plugin scoped
// Logger), exposes the application LogBuffer to the UI via LoggerExtension, contributes the Log
// Viewer panel + footer status, and persists the session to an NDJSON file under state/.
export class LoggerPlugin extends Plugin {
  // The instance's base, unprefixed logger, captured before the base constructor binds this.logger.
  private readonly rootLogger: Logger
  private writer: LogFileWriter | null = null

  constructor(args: PluginArgs) {
    super(args, manifest)
    this.rootLogger = args.logger
  }

  override setup(host: PluginHost): void {
    host.services.bind(RootLogger, () => this.rootLogger)
    host.configureScope(bindPluginLogger)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(LoggerExtension, () => ({ buffer: ctx.services.get(LogBufferKey) }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const shell = ctx.extensions.get(ShellExtension)
    // Logs is a hidden sidebar mini-app: no rail icon, opened only from its status item. Its layout
    // still renders full content-surface when made active via shell.sidebar.setActive('arxhub.logs').
    shell.sidebar.register({
      id: 'arxhub.logs',
      icon: 'lu:scroll-text',
      title: 'Logs',
      layout: LogViewerPanel,
      region: 'bottom',
      hidden: true,
    })
    // A state, not an action: it says what the session's log holds — a dot at the worst level present
    // and the counts. Opening the viewer is a way into that state, not a second thing the item does.
    shell.status.register({ id: 'arxhub.logger', kind: 'status', component: markRaw(LogStatus) })
  }

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)
    const ext = ctx.extensions.get(LoggerExtension)
    const vfs = ctx.services.get(PluginVfs).state
    ext.bindVfs(vfs)
    this.writer = new LogFileWriter(vfs, ext.buffer, this.logger)
    try {
      ext.sessionFile.value = await this.writer.open(Date.now())
    } catch (error) {
      // Losing the session file must not take the app down — the live buffer and the viewer stay
      // usable, and this is exactly the situation the user needs a log for.
      this.logger.error('Could not open the log session file — this session will not be persisted', error)
      this.writer = null
    }
  }

  override async stop(ctx: PluginContext): Promise<void> {
    await this.writer?.dispose()
    this.writer = null
    await super.stop(ctx)
  }
}
