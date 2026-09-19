import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { HotkeysExtension } from './hotkeys-extension'
import { manifest } from './manifest'

// The owner of the keyboard: one listener on the window for the whole application, in place of the
// four that each decided their own order by the accident of when their component mounted.
export class HotkeysPlugin extends Plugin {
  private readonly onKeydown = (event: KeyboardEvent): void => {
    this.hotkeys?.dispatch(event)
  }
  private hotkeys: HotkeysExtension | null = null

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    // Its OWN extension, in create(): `ArxHub` instantiates extensions between the phases, so nothing
    // foreign exists yet here — and by configure() it is too late to register.
    ctx.extensions.register(HotkeysExtension)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    // The registry consumes nobody: plugins consume IT. Held so the listener has something to ask,
    // and taken here rather than in start() because configure() is where a foreign extension is
    // reached for — even when the foreign one is your own.
    this.hotkeys = ctx.extensions.get(HotkeysExtension)
  }

  override start(_ctx: PluginContext): Promise<void> {
    // Capture, so the order between a chord and a library keymap is decided by the layer stack rather
    // than by which DOM node the library happened to listen on. A chord nothing claims is left
    // untouched, so listening first costs nobody anything.
    window.addEventListener('keydown', this.onKeydown, true)
    return super.start(_ctx)
  }

  override stop(_ctx: PluginContext): Promise<void> {
    window.removeEventListener('keydown', this.onKeydown, true)
    return super.stop(_ctx)
  }
}
