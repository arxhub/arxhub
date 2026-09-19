import { Plugin, type PluginArgs, type PluginContext, type PluginHost } from '@arxhub/core'
import { bindPluginLogger, LogBufferKey, type Logger, RootLogger } from '@arxhub/logger'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { PluginVfs } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { LOGS_TYPE_ID } from './contributions'
import { LogFileWriter } from './log-file-writer'
import { LoggerExtension } from './logger-extension'
import { manifest } from './manifest'
import LogStatus from './ui/LogStatus.vue'
import LogViewerPanel from './ui/LogViewerPanel.vue'

// Provides logging via DI (binds the instance's base logger as RootLogger + a per-plugin scoped
// Logger), exposes the application LogBuffer to the UI via LoggerExtension, contributes the "Logs"
// type + its status item, and persists the session to an NDJSON file under state/.
export class LoggerPlugin extends Plugin {
  // The instance's base, unprefixed logger, captured before the base constructor binds this.logger.
  private readonly rootLogger: Logger
  private writer: LogFileWriter | null = null
  private bringUp: Promise<void> | null = null
  private stopping = false

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
    // A type with no objects — the viewer IS the type, there is nothing in it to open twice — and an
    // unpinned one: the log is read when something has gone wrong, so it holds no permanent key in the
    // row. Unpinned is not hidden, which is the whole of F-25: the status item below opens it, and the
    // sheet's "Open new" section lists it like every other type, so it is reachable without one.
    shell.types.register({
      id: LOGS_TYPE_ID,
      icon: 'lu:scroll-text',
      title: 'Logs',
      order: 910,
      pinned: false,
      content: markRaw(LogViewerPanel),
    })
    // A state, not an action: it says what the session's log holds — a dot at the worst level present
    // and the counts. Opening the viewer is a way into that state, not a second thing the item does.
    shell.status.register({ id: 'arxhub.logger', kind: 'status', component: markRaw(LogStatus) })
  }

  override start(ctx: PluginContext): Promise<void> {
    // Opening the session file can touch a remote VFS (browser client) — do not hold first paint.
    this.stopping = false
    this.bringUp = this.openSession(ctx)
    return super.start(ctx)
  }

  private async openSession(ctx: PluginContext): Promise<void> {
    const ext = ctx.extensions.get(LoggerExtension)
    const vfs = ctx.services.get(PluginVfs).state
    ext.bindVfs(vfs)
    this.writer = new LogFileWriter(vfs, ext.buffer, this.logger)
    try {
      const path = await this.writer.open(Date.now())
      if (this.stopping) {
        await this.writer.dispose().catch(() => {})
        this.writer = null
        return
      }
      ext.sessionFile.value = path
    } catch (error) {
      // Losing the session file must not take the app down — the live buffer and the viewer stay
      // usable, and this is exactly the situation the user needs a log for.
      this.logger.error('Could not open the log session file — this session will not be persisted', error)
      this.writer = null
    }
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    await this.writer?.dispose()
    this.writer = null
    await super.stop(ctx)
  }
}
