import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { generateMnemonic, keyringFromMnemonic, type MutableRequestSigner, validateMnemonic } from '@arxhub/crypto'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { Type } from '@sinclair/typebox'
import { KeyringExtension } from './keyring-extension'
import { manifest } from './manifest'

export const ProtectionConfigSchema = Type.Object({
  mnemonic: Type.String({ title: 'Recovery phrase (BIP39)', default: '' }),
})

export interface ProtectionPluginArgs extends PluginArgs {
  // Shared signer created at the composition root and also handed to the HTTP VFS. When the mnemonic
  // resolves to a keyring, it is installed here so every outgoing request is signed.
  signer?: MutableRequestSigner
}

// Client-side protection plugin: owns the user's identity (a BIP39 mnemonic), derives the keyring, and
// publishes it via KeyringExtension for other plugins (sync uses the encryption key). Also installs
// the keyring into the request-signer so the HTTP VFS can authenticate to a protected server.
export class ProtectionPlugin extends Plugin {
  private readonly signer?: MutableRequestSigner

  constructor(args: ProtectionPluginArgs) {
    super(args, manifest)
    this.signer = args.signer
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(KeyringExtension, () => ({}))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    const config = ctx.services.get(PluginConfig)
    const settings = ctx.extensions.get(SettingsExtension)
    // order 5 → above Sync (10): identity is a prerequisite for encrypted sync.
    settings.register({ id: 'protection', title: 'Security', schema: ProtectionConfigSchema, order: 5, config })
  }

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)
    const config = ctx.services.get(PluginConfig)
    const { mnemonic } = await config.read(ProtectionConfigSchema)
    let phrase = mnemonic.trim()

    if (!phrase) {
      // First run: mint an identity so the app always has a key. Required because the working-tree VFS
      // is itself protected — without an identity the client could not read its own files. Persisted so
      // it is stable across restarts; the user can view/replace it in Security settings (and later
      // import another device's phrase, e.g. via QR).
      phrase = generateMnemonic()
      await config.write(ProtectionConfigSchema, { mnemonic: phrase })
      this.logger.info('Generated a new recovery phrase — back it up from Security settings')
    } else if (!validateMnemonic(phrase)) {
      this.logger.warn('Configured recovery phrase is not a valid BIP39 mnemonic; identity not established')
      return
    }

    const keyring = keyringFromMnemonic(phrase)
    ctx.extensions.get(KeyringExtension).keyring = keyring
    this.signer?.install(keyring)
  }
}
