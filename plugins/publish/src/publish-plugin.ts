import { PluginConfig } from '@arxhub/config'
import { apiBaseUrl, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { ExplorerExtension } from '@arxhub/plugin-explorer/ui'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { HttpSyncRemote } from '@arxhub/sync'
import type { ActionItem } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { PluginVfs, VaultVfs } from '@arxhub/vfs'
import { Type } from '@sinclair/typebox'
import { manifest } from './manifest'
import { PUBLISH_NAMESPACE } from './namespace'
import { PublishExtension } from './publish-extension'
import { Publisher } from './publisher'

export const PublishConfigSchema = Type.Object(
  {
    // The server ORIGIN (e.g. https://hub.example.com) — the /publish route prefix is appended here.
    serverUrl: Type.String({ title: 'Server URL', description: 'ArxHub server origin, e.g. https://hub.example.com', default: '' }),
  },
  { description: 'Share selected notes and folders through public links. Restart ArxHub after changing the server.' },
)

export class PublishPlugin extends Plugin {
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

    const publish = ctx.extensions.get(PublishExtension)
    const explorer = ctx.extensions.get(ExplorerExtension)
    // Menu invokers don't await onSelect, so failures are logged here instead of surfacing as
    // unhandled rejections (same policy as the explorer's own actions).
    const run = (action: Promise<void>, context: string): void => {
      action.catch((error) => {
        this.logger.error(`${context} failed`, error)
        toaster.create({ title: `Could not ${context}`, description: String(error), type: 'error' })
      })
    }
    explorer.registerNodeActions((node) => {
      if (!publish.enabled) return []
      const path = node.entry.pathname
      const actions: ActionItem[] = [
        {
          id: 'publish',
          label: publish.isPublished(path) ? 'Republish' : 'Publish',
          icon: 'lu:globe',
          onSelect: () =>
            run(
              publish.publish(path).then(() => {
                toaster.create({ title: 'Published', description: publish.publicUrl(path) ?? path, type: 'success' })
              }),
              `publish ${path}`,
            ),
        },
      ]
      if (publish.isPublished(path)) {
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
    if (cfg == null || !cfg.serverUrl) return

    // Publishing WRITES require the owner's identity (the /publish routes sit behind the auth
    // guard); only the anonymous READ side is keyless.
    const keyring = ctx.extensions.get(KeyringExtension).keyring
    if (keyring == null) {
      this.logger.warn('Publishing is configured but no identity is set — add a recovery phrase in Security settings')
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
    })
    try {
      await publisher.load()
    } catch (error) {
      // A file must not take the boot down (FR-147) — the two reads above already say so with tryRead,
      // and this one was the exception that made a whole session land on the crash screen. The set of
      // published paths is shared state: another device (or, in the e2e stand, another worker) can be
      // rewriting it at the moment this boot reads it, and half a JSON document is a SyntaxError.
      //
      // Publishing then stays OFF for the session rather than starting from an empty set. That file is
      // the record of what is public; a publisher that could not read it would rewrite it from nothing
      // on the next publish and quietly unpublish everything the owner had shared.
      this.logger.error('Could not read the set of published paths — publishing is unavailable this session', error)
      return
    }
    const publish = ctx.extensions.get(PublishExtension)
    publish.serverUrl = cfg.serverUrl
    publish.publisher = publisher
  }
}
