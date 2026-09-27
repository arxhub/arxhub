import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { KeyringExtension } from '@arxhub/plugin-protection'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { ShellExtension } from '@arxhub/plugin-shell'
import { PluginVfs } from '@arxhub/vfs'
import { Type } from '@sinclair/typebox'
import { markRaw, watch } from 'vue'
import { BudgetExtension } from './budget-extension'
import { type BudgetCapture, browserBudgetCapture } from './capture-media'
import { BUDGET_TYPE_ID } from './contributions'
import { budgetError } from './errors'
import { messages, t } from './i18n/messages'
import { manifest } from './manifest'
import { mergeBudgets } from './merge'
import { downloadReceipt } from './receipt-client'
import { ReceiptPhotoStore } from './receipt-photo-store'
import { BudgetStore } from './store'
import BudgetMonthsSheet from './ui/BudgetMonthsSheet.vue'
import BudgetPage from './ui/BudgetPage.vue'
import { budgetBar, budgetSummary } from './ui/budget-view'

export interface BudgetPluginArgs extends PluginArgs {
  capture?: BudgetCapture
  receiptServerUrlRequired?: boolean
}

const budgetMetadata = (path: string): boolean => path === 'budget.jsonl' || /^conflict-[0-9a-f]{8}-budget(?:-\d+)?\.jsonl$/.test(path)

// What the form says about each field is the catalog's `config` section; the schema describes the file.
const BudgetConfigSchema = Type.Object({
  receiptServerUrl: Type.Optional(Type.String({ default: '' })),
})

export class BudgetPlugin extends Plugin {
  private bringUp: Promise<void> | null = null
  private unwatch: (() => void) | null = null
  private unregisterMerger: (() => void) | null = null
  private readonly capture: BudgetCapture
  private readonly receiptServerUrlRequired: boolean

  constructor(args: BudgetPluginArgs) {
    super(args, manifest)
    this.capture = args.capture ?? browserBudgetCapture
    this.receiptServerUrlRequired = args.receiptServerUrlRequired ?? false
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(BudgetExtension, () => ({
      store: new BudgetStore(ctx.services.get(PluginVfs).storage),
      // A pending file is absent locally, not an empty budget. Fetch it before either read or write.
      prepare: () => ctx.extensions.get(RepositoryExtension).materializeStorageIfPending(manifest.name, budgetMetadata),
      mutate: (work) => ctx.extensions.get(RepositoryExtension).mutateStorage(manifest.name, work, budgetMetadata),
      preparePhoto: (path) =>
        ctx.extensions.get(RepositoryExtension).materializeStorageIfPending(manifest.name, (candidate) => candidate === path),
      photos: new ReceiptPhotoStore(ctx.services.get(PluginVfs).storage),
      capture: this.capture,
      lookupReceipt: async (receipt, options) => {
        const config = await ctx.services.get(PluginConfig).tryRead(BudgetConfigSchema)
        const serverUrl = config?.receiptServerUrl?.trim() ?? ''
        if (serverUrl) {
          let url: URL
          try {
            url = new URL(serverUrl)
          } catch {
            throw budgetError('BudgetReceiptServerInvalid')
          }
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
            throw budgetError('BudgetReceiptServerOrigin')
          }
        } else if (this.receiptServerUrlRequired) {
          throw budgetError('BudgetReceiptServerMissing')
        }
        const keyring = ctx.extensions.get(KeyringExtension).keyring
        if (!keyring) throw budgetError('BudgetIdentityMissing')
        const signer = new MutableRequestSigner()
        signer.install(keyring)
        return downloadReceipt(serverUrl, signer, receipt, options)
      },
    }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions.get(SettingsExtension).register({
      id: 'budget',
      title: () => t('settings.title'),
      description: () => t('settings.description'),
      icon: 'lu:receipt-text',
      schema: BudgetConfigSchema,
      order: 12,
      config: ctx.services.get(PluginConfig),
      messages,
    })
    const repository = ctx.extensions.get(RepositoryExtension)
    const budget = ctx.extensions.get(BudgetExtension)
    ctx.extensions.get(ShellExtension).types.register({
      id: BUDGET_TYPE_ID,
      title: () => t('type.title'),
      icon: 'lu:wallet',
      order: 30,
      pinned: false,
      content: markRaw(BudgetPage),
      bar: () => budgetBar(budget, this.logger),
      summary: () => budgetSummary(budget),
      sheet: { title: () => t('type.months'), content: markRaw(BudgetMonthsSheet) },
    })
    this.unwatch = watch(repository.storageRevision, () => {
      void budget.refresh().catch((error) => this.logger.error('Could not reload the budget after sync', error))
    })
    this.unregisterMerger = repository.registerContentMerger({
      id: 'budget',
      matches: (path) => path === 'storage/budget/budget.jsonl',
      merge: async (_path, base, local, remote) => {
        const merged = mergeBudgets(base, local, remote)
        return merged ? { merged, conflicts: 0 } : null
      },
    })
  }

  override start(ctx: PluginContext): Promise<void> {
    this.bringUp = ctx.extensions.get(BudgetExtension).refresh()
    void this.bringUp.catch((error) => this.logger.error('Could not open the budget', error))
    return super.start(ctx)
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.unwatch?.()
    this.unwatch = null
    this.unregisterMerger?.()
    this.unregisterMerger = null
    await this.bringUp?.catch(() => {})
    await ctx.extensions.get(BudgetExtension).stop()
    await super.stop(ctx)
  }
}
