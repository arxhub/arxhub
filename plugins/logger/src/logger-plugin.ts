import { Plugin, type PluginArgs, type PluginContext, type PluginHost } from '@arxhub/core'
import { bindPluginLogger, LogBufferKey, type Logger, RootLogger } from '@arxhub/logger'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { PluginVfs } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { LogFileWriter } from './log-file-writer'
import { LoggerExtension } from './logger-extension'
import { manifest } from './manifest'
import LogFooter from './ui/LogFooter.vue'
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
    // Logs is a hidden sidebar mini-app: no rail icon, opened only from the footer status. Its layout
    // still renders full content-surface when made active via shell.sidebar.setActive('arxhub.logs').
    shell.sidebar.register({
      id: 'arxhub.logs',
      icon: 'lu:scroll-text',
      title: 'Logs',
      layout: LogViewerPanel,
      region: 'bottom',
      hidden: true,
    })
    shell.footer.register({ id: 'arxhub.logger', component: markRaw(LogFooter), region: 'right' })
  }

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)
    const ext = ctx.extensions.get(LoggerExtension)
    const vfs = ctx.services.get(PluginVfs).state
    ext.bindVfs(vfs)
    this.writer = new LogFileWriter(vfs, ext.buffer, this.logger)
    ext.sessionFile.value = await this.writer.open(Date.now())
  }

  override async stop(ctx: PluginContext): Promise<void> {
    await this.writer?.dispose()
    this.writer = null
    await super.stop(ctx)
  }
}
