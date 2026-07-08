import { PluginConfig } from '@arxhub/config'
import { apiBaseUrl, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { ExplorerExtension } from '@arxhub/plugin-explorer/ui'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { HttpSyncRemote } from '@arxhub/sync'
import type { ActionItem } from '@arxhub/uikit/core'
import { PluginVfs, VaultVfs } from '@arxhub/vfs'
import { Type } from '@sinclair/typebox'
import { manifest } from './manifest'
import { PUBLISH_NAMESPACE } from './namespace'
import { PublishExtension } from './publish-extension'
import { Publisher } from './publisher'

export const PublishConfigSchema = Type.Object({
  // The server ORIGIN (e.g. https://hub.example.com) — the /publish route prefix is appended here.
  serverUrl: Type.String({ title: 'Server URL', description: 'ArxHub server origin, e.g. https://hub.example.com', default: '' }),
})

export class PublishPlugin extends Plugin {
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

    const publish = ctx.extensions.get(PublishExtension)
    const explorer = ctx.extensions.get(ExplorerExtension)
    // Menu invokers don't await onSelect, so failures are logged here instead of surfacing as
    // unhandled rejections (same policy as the explorer's own actions).
    const run = (action: Promise<void>, context: string): void => {
      action.catch((error) => this.logger.error(`${context} failed`, error))
    }
    explorer.registerNodeActions((node) => {
      if (!publish.enabled) return []
      const path = node.entry.pathname
      const actions: ActionItem[] = [
        {
          id: 'publish',
          label: publish.isPublished(path) ? 'Republish' : 'Publish',
          icon: 'lu:globe',
          onSelect: () => run(publish.publish(path), `publish ${path}`),
        },
      ]
      if (publish.isPublished(path)) {
        actions.push({
          id: 'unpublish',
          label: 'Unpublish',
          icon: 'lu:eye-off',
          onSelect: () => run(publish.unpublish(path), `unpublish ${path}`),
        })
      }
      return actions
    })
  }

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)

    const cfg = await ctx.services.get(PluginConfig).read(PublishConfigSchema)
    if (!cfg.serverUrl) return

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
    await publisher.load()
    ctx.extensions.get(PublishExtension).publisher = publisher
  }
}
