import { Extension, type ExtensionArgs } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { ref, shallowRef } from 'vue'
import type { BudgetCapture } from './capture-media'
import { budgetError } from './errors'
import type { ImportedReceipt, ReceiptLookupOptions } from './fiscal'
import {
  type BudgetAccount,
  type BudgetAttachment,
  type BudgetCategory,
  type BudgetData,
  type BudgetPlace,
  type BudgetTransaction,
  emptyBudget,
  type FiscalReceipt,
  validateBudgetAttachment,
  validateFiscalReceipt,
} from './model'
import type { ReceiptPhotoStore } from './receipt-photo-store'
import type { BudgetStore } from './store'

interface BudgetExtensionArgs extends ExtensionArgs {
  store: BudgetStore
  prepare?: () => Promise<void>
  mutate?: <T>(work: () => Promise<T>) => Promise<T>
  preparePhoto?: (path: string) => Promise<void>
  photos?: ReceiptPhotoStore
  capture?: BudgetCapture
  lookupReceipt?: (receipt: FiscalReceipt, options?: ReceiptLookupOptions) => Promise<ImportedReceipt>
}

// A form holds the record it opened. A sync or another tab must not turn Save into an overwrite of a
// newer transaction; the user keeps their draft and can compare it with the refreshed record.
function requireUnchanged<T extends { id: string }>(records: T[], previous: T): void {
  const actual = records.find((record) => record.id === previous.id)
  if (!actual || JSON.stringify(actual) !== JSON.stringify(previous)) {
    throw budgetError('BudgetEntryChanged')
  }
}

function replace<T extends { id: string }>(records: T[], next: T, previous?: T): T[] {
  if (!previous) return [...records, next]
  requireUnchanged(records, previous)
  return records.map((record) => (record.id === previous.id ? next : record))
}

function receiptPhotoAttachment(value: BudgetAttachment): BudgetAttachment {
  const checked = validateBudgetAttachment(value)
  const pathId = checked.path.slice('receipts/'.length, checked.path.lastIndexOf('.'))
  if (pathId !== checked.id) throw budgetError('BudgetPhotoPathInvalid')
  return checked
}

export class BudgetExtension extends Extension {
  readonly data = shallowRef<BudgetData>(emptyBudget())
  readonly status = ref<'opening' | 'ready' | 'failed' | 'stopped'>('opening')
  readonly error = ref<string | null>(null)
  // The cause itself, so the screen can say it in the language it is showing now; `error` is its English text.
  readonly failure = shallowRef<unknown>(null)
  readonly busy = ref(false)
  private readonly store: BudgetStore
  private readonly prepare: () => Promise<void>
  private readonly mutate: <T>(work: () => Promise<T>) => Promise<T>
  private readonly preparePhoto: (path: string) => Promise<void>
  private readonly photos?: ReceiptPhotoStore
  private readonly capture?: BudgetCapture
  private readonly receiptLookup?: BudgetExtensionArgs['lookupReceipt']
  private queue: Promise<unknown> = Promise.resolve()
  private pending = 0
  private stopping = false

  constructor(args: BudgetExtensionArgs) {
    super(args)
    this.store = args.store
    this.prepare = args.prepare ?? (() => Promise.resolve())
    this.mutate = args.mutate ?? ((work) => work())
    this.preparePhoto = args.preparePhoto ?? (() => Promise.resolve())
    this.photos = args.photos
    this.capture = args.capture
    this.receiptLookup = args.lookupReceipt
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    if (this.stopping) return Promise.reject(illegalState('Budget is stopped'))
    this.pending++
    this.busy.value = true
    const task = this.queue.then(action, action).finally(() => {
      this.busy.value = --this.pending > 0
    })
    this.queue = task.catch(() => {})
    return task
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.prepare()
        this.data.value = await this.store.load()
        this.status.value = 'ready'
        this.error.value = null
        this.failure.value = null
      } catch (error) {
        this.status.value = 'failed'
        this.error.value = error instanceof Error ? error.message : String(error)
        this.failure.value = error
        throw error
      }
    })
  }

  private change(update: (data: BudgetData) => BudgetData): Promise<void> {
    return this.enqueue(async () => {
      if (this.status.value !== 'ready') throw budgetError('BudgetNotReady')
      try {
        await this.prepare()
        this.data.value = await this.mutate(() => this.store.update(update))
        this.error.value = null
      } catch (error) {
        this.logger.error('Could not save the budget change', error)
        throw error
      }
    })
  }

  saveAccount(input: Omit<BudgetAccount, 'id'>, previous?: BudgetAccount): Promise<void> {
    const account = {
      id: previous?.id ?? crypto.randomUUID(),
      ...input,
      name: input.name.trim(),
      currency: input.currency.trim().toUpperCase(),
    }
    return this.change((data) => {
      if (previous && previous.currency !== account.currency && data.transactions.some((entry) => entry.accountId === previous.id)) {
        throw budgetError('BudgetAccountCurrencyLocked')
      }
      return { ...data, accounts: replace(data.accounts, account, previous) }
    })
  }

  saveCategory(input: Omit<BudgetCategory, 'id'>, previous?: BudgetCategory): Promise<void> {
    const category = { id: previous?.id ?? crypto.randomUUID(), ...input, name: input.name.trim() }
    return this.change((data) => {
      if (previous && previous.kind !== category.kind && data.transactions.some((entry) => entry.categoryId === previous.id)) {
        throw budgetError('BudgetCategoryKindLocked')
      }
      return { ...data, categories: replace(data.categories, category, previous) }
    })
  }

  saveTransaction(input: Omit<BudgetTransaction, 'id'>, previous?: BudgetTransaction): Promise<void> {
    const transaction = { id: previous?.id ?? crypto.randomUUID(), ...input, note: input.note.trim() }
    return this.change((data) => ({ ...data, transactions: replace(data.transactions, transaction, previous) }))
  }

  removeAccount(previous: BudgetAccount): Promise<void> {
    return this.change((data) => {
      requireUnchanged(data.accounts, previous)
      if (data.transactions.some((entry) => entry.accountId === previous.id)) throw budgetError('BudgetAccountInUse')
      return { ...data, accounts: data.accounts.filter((entry) => entry.id !== previous.id) }
    })
  }

  removeCategory(previous: BudgetCategory): Promise<void> {
    return this.change((data) => {
      requireUnchanged(data.categories, previous)
      if (data.transactions.some((entry) => entry.categoryId === previous.id)) throw budgetError('BudgetCategoryInUse')
      return { ...data, categories: data.categories.filter((entry) => entry.id !== previous.id) }
    })
  }

  async removeTransaction(previous: BudgetTransaction): Promise<void> {
    await this.change((data) => {
      requireUnchanged(data.transactions, previous)
      return { ...data, transactions: data.transactions.filter((entry) => entry.id !== previous.id) }
    })
    // Metadata is the source of truth and is already durably removed. Photo cleanup is best effort:
    // every discard re-reads the latest budget so a photo reused concurrently is retained.
    for (const attachment of previous.attachments) {
      try {
        await this.discardReceiptPhoto(attachment)
      } catch (error) {
        this.logger.warn(`Could not discard unused receipt photo ${attachment.path}`, error)
      }
    }
  }

  async savePlace(input: Omit<BudgetPlace, 'id'>, previous?: BudgetPlace): Promise<BudgetPlace> {
    const place = { id: previous?.id ?? crypto.randomUUID(), ...input, name: input.name.trim() }
    await this.change((data) => ({ ...data, places: replace(data.places, place, previous) }))
    return place
  }

  removePlace(previous: BudgetPlace): Promise<void> {
    return this.change((data) => {
      requireUnchanged(data.places, previous)
      if (data.transactions.some((entry) => entry.placeId === previous.id)) throw budgetError('BudgetPlaceInUse')
      return { ...data, places: data.places.filter((entry) => entry.id !== previous.id) }
    })
  }

  locate(options?: { signal?: AbortSignal }) {
    if (!this.capture) return Promise.reject(budgetError('BudgetLocationUnavailable'))
    return this.capture.locate(options)
  }

  scanReceiptPhoto(file: Blob, options?: { signal?: AbortSignal }): Promise<string | null> {
    if (!this.capture) return Promise.reject(budgetError('BudgetQrUnavailable'))
    return this.capture.scanReceiptPhoto(file, options)
  }

  addReceiptPhoto(file: File): Promise<BudgetAttachment> {
    return this.enqueue(async () => {
      if (this.status.value !== 'ready' || !this.photos) throw budgetError('BudgetPhotoNotReady')
      const photos = this.photos
      await this.prepare()
      return this.mutate(() => photos.add(file))
    })
  }

  async readReceiptPhoto(attachment: BudgetAttachment): Promise<Blob> {
    if (!this.photos) throw budgetError('BudgetPhotosUnavailable')
    // Never ask the repository to materialize a caller-controlled path before the domain has
    // established that it is confined to the receipt-photo namespace.
    const checked = receiptPhotoAttachment(attachment)
    await this.preparePhoto(checked.path)
    return this.photos.read(checked)
  }

  discardReceiptPhoto(attachment: BudgetAttachment): Promise<void> {
    return this.enqueue(async () => {
      if (!this.photos) return
      const photos = this.photos
      const checked = receiptPhotoAttachment(attachment)
      await this.prepare()
      // A force-delete of an absent local pending file cannot remove its remote repository entry.
      // Materializing it first clears pending state; another sync may race it back to pending, which
      // safely leaves an orphan rather than deleting a referenced photo.
      await this.preparePhoto(checked.path)
      await this.mutate(async () => {
        const current = await this.store.load()
        if (current.transactions.some((entry) => entry.attachments.some((item) => item.path === checked.path))) return
        await photos.discard(checked)
      })
    })
  }

  lookupReceipt(receipt: FiscalReceipt, options?: ReceiptLookupOptions): Promise<ImportedReceipt> {
    if (!this.receiptLookup) return Promise.reject(budgetError('BudgetReceiptLookupUnavailable'))
    return this.receiptLookup(validateFiscalReceipt(receipt), options)
  }

  async stop(): Promise<void> {
    this.stopping = true
    await this.queue
    this.status.value = 'stopped'
  }
}
