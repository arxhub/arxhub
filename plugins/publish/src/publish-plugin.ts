import { PluginConfig } from '@arxhub/config'
import { apiBaseUrl, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { basename } from '@arxhub/path'
import { ExplorerExtension } from '@arxhub/plugin-explorer'
import { NotesExtension } from '@arxhub/plugin-notes'
import { KeyringExtension } from '@arxhub/plugin-protection'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { ShellExtension } from '@arxhub/plugin-shell'
import { HttpSyncRemote } from '@arxhub/sync'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { PluginVfs, VaultVfs } from '@arxhub/vfs'
import { type Static, Type } from '@sinclair/typebox'
import { markRaw } from 'vue'
import { PUBLISH_TYPE_ID } from './contributions'
import { manifest } from './manifest'
import { PUBLISH_NAMESPACE } from './namespace'
import { PublishExtension } from './publish-extension'
import { DEFAULT_HISTORY_LIMIT } from './publish-history'
import { Publisher } from './publisher'
import { reportFailures } from './report'
import PublicationsPage from './ui/PublicationsPage.vue'

export const PublishConfigSchema = Type.Object(
  {
    // The server ORIGIN (e.g. https://hub.example.com) — the /publish route prefix is appended here.
    // Optional, not for want of a default: an empty address is the normal "publishing is off" state
    // (applyConfig below reads it that way), so clearing the field must not be blocked by the form
    // treating a required-and-empty field as invalid the moment the section opens (same trap
    // `index.exclude` in `plugins/search` found first).
    serverUrl: Type.Optional(
      Type.String({ title: 'Server URL', description: 'ArxHub server origin, e.g. https://hub.example.com', default: '' }),
    ),
    // Dotted, like the search plugin's keys: TOML writes it as one quoted key, which is what the generated
    // form reads — a nested table would never reach it.
    'history.limit': Type.Integer({
      title: 'History length',
      description: 'How many publications are remembered — each one can be rolled back to.',
      default: DEFAULT_HISTORY_LIMIT,
      minimum: 1,
    }),
  },
  { description: 'Share selected notes and folders through public links.' },
)

// Honest about both halves of what publishing is: the content stops being encrypted, and a copy once
// downloaded is out of the owner's hands for good — unpublishing only stops serving new ones (Q-05).
function publishWarning(path: string, folder: boolean): string {
  const subject = folder ? `"${basename(path)}" and everything inside it, attachments included,` : `"${basename(path)}" and its attachments`
  return `${subject} will be uploaded unencrypted and readable by anyone with the link. Unpublishing stops serving them, but cannot recall copies already downloaded.`
}

export class PublishPlugin extends Plugin {
  // Guards a rebuild against a config write that lands while a previous one is still loading the
  // published-paths file — without it two overlapping applyConfig() calls could race to assign
  // PublishExtension.publisher, and the loser's (possibly stale) result would win.
  private applying: Promise<void> = Promise.resolve()
  // Detached from start() so a slow published-paths read cannot hold the first paint (same shape as
  // SyncPlugin / SearchPlugin). stop() awaits it before clearing the publisher.
  private bringUp: Promise<void> | null = null
  private stopping = false
  // Cleared when config.watch delivers a save while boot tryRead is still in flight (TH-24-01).
  private bootConfigPending = true

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(PublishExtension, () => ({}))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const config = ctx.services.get(PluginConfig)
    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'publish', title: 'Publishing', schema: PublishConfigSchema, order: 11, config })

    // A-33 first said no type here: publishing is something done TO a note that belongs to another type,
    // and a key opening an empty panel is worse than no key. The premise changed with the history (F-12): a
    // set of publications IS a set of objects — the roots and the journal — with a view of its own. Unpinned,
    // like Search and Logs, so it still holds no permanent key in the row; the sheet's "Open new" is the way
    // in. Publishing itself stays in the tree (below) — this is where the owner sees what is public.
    ctx.extensions.get(ShellExtension).types.register({
      id: PUBLISH_TYPE_ID,
      icon: 'lu:globe',
      title: 'Publications',
      order: 20,
      pinned: false,
      content: markRaw(PublicationsPage),
    })

    // The server address applies without a restart: every write of THIS section rebuilds the remote
    // (or tears it down when serverUrl is cleared) the same way start() builds it the first time.
    config.watch(PublishConfigSchema, (cfg) => {
      this.bootConfigPending = false
      this.queueApplyConfig(ctx, cfg)
    })

    const publish = ctx.extensions.get(PublishExtension)
    publish.readFile = (path) => ctx.services.get(VaultVfs).read(path)
    publish.beforeRead = (path) => ctx.extensions.get(NotesExtension).beforeClose(path)
    const explorer = ctx.extensions.get(ExplorerExtension)
    // One reporter for the tree actions and the Publications page, so a failure reads the same wherever the
    // click came from and lands in this plugin's log.
    const run = reportFailures(this.logger)
    publish.run = run
    explorer.registerNodeActions((node) => {
      const path = node.entry.pathname
      const exports = node.entry.kind === 'file' ? publish.documentActions(path) : []
      if (!publish.enabled) return exports
      const published = publish.isPublished(path)
      const publishNow = () =>
        run(
          publish.publish(path).then(() => {
            toaster.create({ title: 'Published', description: publish.publicUrl(path) ?? path, type: 'success' })
          }),
          `publish ${path}`,
        )
      const actions: ActionItem[] = [
        ...exports,
        {
          id: 'publish',
          label: published ? 'Republish' : 'Publish',
          icon: 'lu:globe',
          // The question is asked once, at the moment a path LEAVES encryption (FR-167). A republish
          // changes what a reader sees, not who can see it, so asking again would only teach the owner
          // to click through.
          onSelect: () => {
            if (published) return publishNow()
            modals.openConfirmModal({
              title: 'Publish',
              content: publishWarning(path, node.entry.kind === 'dir'),
              labels: { confirm: 'Publish', cancel: 'Cancel' },
              confirmProps: { danger: true },
              onConfirm: publishNow,
            })
          },
        },
      ]
      if (published) {
        actions.push({
          id: 'copy-link',
          label: 'Copy public link',
          icon: 'lu:link',
          onSelect: () => {
            const url = publish.publicUrl(path)
            if (url == null) return
            run(
              navigator.clipboard.writeText(url).then(() => {
                toaster.create({ title: 'Link copied', description: url, type: 'success' })
              }),
              `copy link for ${path}`,
            )
          },
        })
        actions.push({
          id: 'unpublish',
          label: 'Unpublish',
          icon: 'lu:eye-off',
          onSelect: () =>
            run(
              publish.unpublish(path).then(() => {
                toaster.create({ title: 'Unpublished', description: path, type: 'success' })
              }),
              `unpublish ${path}`,
            ),
        })
      }
      return actions
    })
  }

  override start(ctx: PluginContext): Promise<void> {
    this.stopping = false
    this.bootConfigPending = true
    this.bringUp = this.startPublish(ctx)
    void this.bringUp.catch((error) => this.logger.error('Could not initialize publishing', error))
    return super.start(ctx)
  }

  private async startPublish(ctx: PluginContext): Promise<void> {
    // tryRead, not read: an unreachable settings store leaves publishing idle rather than aborting
    // the boot (FR-147).
    const cfg = await ctx.services.get(PluginConfig).tryRead(PublishConfigSchema)
    if (this.stopping) return
    if (this.bootConfigPending) this.queueApplyConfig(ctx, cfg)
    await this.applying
  }

  // Serialises rebuilds behind `applying` so a config write that lands mid-load joins the queue
  // instead of racing the load already in flight — see the field's own comment.
  private queueApplyConfig(ctx: PluginContext, cfg: Static<typeof PublishConfigSchema> | null): void {
    this.applying = this.applying.then(
      () => this.applyConfig(ctx, cfg),
      () => this.applyConfig(ctx, cfg),
    )
    this.applying.catch((error) => this.logger.error('Could not apply the new Publish configuration', error))
  }

  // Builds (or tears down) the remote exactly the way the plugin's own start() used to inline — the
  // one place that decision is made, called from startPublish on boot and from the config watcher below on
  // every later save, so "restart ArxHub after changing the server" is no longer true.
  private async applyConfig(ctx: PluginContext, cfg: Static<typeof PublishConfigSchema> | null): Promise<void> {
    if (this.stopping) return
    const publish = ctx.extensions.get(PublishExtension)

    if (cfg == null || !cfg.serverUrl) {
      publish.publisher = null
      publish.serverUrl = ''
      return
    }

    // Publishing WRITES require the owner's identity (the /publish routes sit behind the auth
    // guard); only the anonymous READ side is keyless.
    const keyring = ctx.extensions.get(KeyringExtension).keyring
    if (keyring == null) {
      this.logger.warn('Publishing is configured but no identity is set — add a recovery phrase in Security settings')
      publish.publisher = null
      publish.serverUrl = ''
      return
    }

    const signer = new MutableRequestSigner()
    signer.install(keyring)
    // Plaintext public store: the SAME object-store client sync uses (HttpSyncRemote) pointed at the
    // publish namespace, with NO EncryptedSyncRemote wrapper — chunks + manifest are uploaded as-is so
    // the server can reassemble and anonymous readers can fetch them.
    const remote = new HttpSyncRemote({ baseUrl: apiBaseUrl(cfg.serverUrl, PUBLISH_NAMESPACE), signer })

    const publisher = new Publisher({
      vault: ctx.services.get(VaultVfs),
      storage: ctx.services.get(PluginVfs).storage,
      remote,
      logger: this.logger,
      render: (raw, path) => ctx.extensions.get(PublishExtension).renderArx(raw, path),
      beforeRead: (path) => ctx.extensions.get(NotesExtension).beforeClose(path),
      historyLimit: cfg['history.limit'],
    })
    try {
      await publisher.load()
    } catch (error) {
      // A file must not take the boot down (FR-147) — the caller already reads with tryRead on boot,
      // and this one was the exception that made a whole session land on the crash screen. The set of
      // published paths is shared state: another device (or, in the e2e stand, another worker) can be
      // rewriting it at the moment this reads it, and half a JSON document is a SyntaxError.
      //
      // Publishing is left exactly as it was — the previous remote if one was running, off otherwise —
      // rather than started from an empty set. That file is the record of what is public; a publisher
      // that could not read it would rewrite it from nothing on the next publish and quietly unpublish
      // everything the owner had shared.
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Could not read the set of published paths — publishing is unavailable this session',
      )
      return
    }
    if (this.stopping) return
    publish.serverUrl = cfg.serverUrl
    publish.publisher = publisher
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    await this.applying.catch(() => {})
    const publish = ctx.extensions.get(PublishExtension)
    publish.publisher = null
    publish.serverUrl = ''
    await super.stop(ctx)
  }
}
