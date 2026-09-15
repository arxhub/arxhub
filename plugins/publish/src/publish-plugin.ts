import { PluginConfig } from '@arxhub/config'
import { apiBaseUrl, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { basename } from '@arxhub/path'
import { ExplorerExtension } from '@arxhub/plugin-explorer/ui'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { HttpSyncRemote } from '@arxhub/sync'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { PluginVfs, VaultVfs } from '@arxhub/vfs'
import { type Static, Type } from '@sinclair/typebox'
import { manifest } from './manifest'
import { PUBLISH_NAMESPACE } from './namespace'
import { PublishExtension } from './publish-extension'
import { Publisher } from './publisher'

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

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(PublishExtension, () => ({}))
  }

  // Publishing registers NO tab type on `shell.types`, and that is a decision, not an omission (A-33): the
  // mobile prototype declares a «Публикация» type and this plugin deliberately does not. A type is a place
  // with objects of its own and a view for them, and publishing has neither — it is something done TO a note
  // that already belongs to another type, so its whole surface is the tree actions below plus one settings
  // section. A key in the type row that opens an empty panel is worse than no key at all.
  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const config = ctx.services.get(PluginConfig)
    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'publish', title: 'Publishing', schema: PublishConfigSchema, order: 11, config })

    // The server address applies without a restart: every write of THIS section rebuilds the remote
    // (or tears it down when serverUrl is cleared) the same way start() builds it the first time.
    config.watch(PublishConfigSchema, (cfg) => this.queueApplyConfig(ctx, cfg))

    const publish = ctx.extensions.get(PublishExtension)
    publish.readFile = (path) => ctx.services.get(VaultVfs).read(path)
    publish.beforeRead = (path) => ctx.extensions.get(NotesExtension).beforeClose(path)
    const explorer = ctx.extensions.get(ExplorerExtension)
    // Menu invokers don't await onSelect, so failures are logged here instead of surfacing as
    // unhandled rejections (same policy as the explorer's own actions).
    const run = (action: Promise<void>, context: string): void => {
      action.catch((error) => {
        this.logger.error({ error: error instanceof Error ? error.message : String(error) }, `${context} failed`)
        toaster.create({ title: `Could not ${context}`, description: String(error), type: 'error' })
      })
    }
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

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)

    // tryRead, not read: an unreachable settings store leaves publishing idle rather than aborting
    // the boot (FR-147).
    const cfg = await ctx.services.get(PluginConfig).tryRead(PublishConfigSchema)
    await this.applyConfig(ctx, cfg)
  }

  // Serialises rebuilds behind `applying` so a config write that lands mid-load joins the queue
  // instead of racing the load already in flight — see the field's own comment.
  private queueApplyConfig(ctx: PluginContext, cfg: Static<typeof PublishConfigSchema>): void {
    this.applying = this.applying.then(
      () => this.applyConfig(ctx, cfg),
      () => this.applyConfig(ctx, cfg),
    )
    this.applying.catch((error) => this.logger.error('Could not apply the new Publish configuration', error))
  }

  // Builds (or tears down) the remote exactly the way the plugin's own start() used to inline — the
  // one place that decision is made, called from start() on boot and from the config watcher below on
  // every later save, so "restart ArxHub after changing the server" is no longer true.
  private async applyConfig(ctx: PluginContext, cfg: Static<typeof PublishConfigSchema> | null): Promise<void> {
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
    publish.serverUrl = cfg.serverUrl
    publish.publisher = publisher
  }
}
