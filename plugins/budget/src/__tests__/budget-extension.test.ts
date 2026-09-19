import type { Logger } from '@arxhub/logger'
import type { DeleteOptions } from '@arxhub/vfs'
import { describe, expect, it, vi } from 'vitest'
import { BudgetExtension } from '../budget-extension'
import type { BudgetAccount, BudgetAttachment, BudgetData } from '../model'
import { ReceiptPhotoStore } from '../receipt-photo-store'
import type { BudgetStore } from '../store'

function silentLogger(): Logger {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  }
  return logger
}

function copy(data: BudgetData): BudgetData {
  return structuredClone(data)
}

function budgetData(): BudgetData {
  return {
    version: 2,
    places: [],
    accounts: [{ id: 'cash', name: 'Cash', currency: 'USD', openingBalance: 0 }],
    categories: [{ id: 'food', name: 'Food', kind: 'expense' }],
    transactions: [],
  }
}

function usedBudgetData(): BudgetData {
  const data = budgetData()
  data.transactions.push({
    id: 'lunch',
    accountId: 'cash',
    categoryId: 'food',
    kind: 'expense',
    amount: 1250,
    date: '2026-09-19',
    note: 'Lunch',
    placeId: null,
    items: [],
    attachments: [],
    fiscalReceipt: null,
  })
  return data
}

class FakeBudgetStore {
  private current: BudgetData
  loadFailure: Error | null = null
  readonly updateFailures: Error[] = []
  loadCalls = 0
  updateCalls = 0
  writes = 0

  constructor(data: BudgetData = budgetData()) {
    this.current = copy(data)
  }

  async load(): Promise<BudgetData> {
    this.loadCalls++
    if (this.loadFailure) throw this.loadFailure
    return copy(this.current)
  }

  async update(change: (current: BudgetData) => BudgetData): Promise<BudgetData> {
    this.updateCalls++
    const failure = this.updateFailures.shift()
    if (failure) throw failure
    const next = change(copy(this.current))
    this.current = copy(next)
    this.writes++
    return copy(this.current)
  }

  snapshot(): BudgetData {
    return copy(this.current)
  }
}

interface UpdateGate {
  reached: Promise<void>
  release(): void
}

class GatedBudgetStore extends FakeBudgetStore {
  private updateGate: { reached(): void; wait: Promise<void>; release(): void } | null = null

  gateNextUpdate(): UpdateGate {
    let reached: (() => void) | null = null
    let release: (() => void) | null = null
    const reachedPromise = new Promise<void>((resolve) => {
      reached = resolve
    })
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    this.updateGate = {
      reached: () => reached?.(),
      wait,
      release: () => release?.(),
    }
    return { reached: reachedPromise, release: () => this.updateGate?.release() }
  }

  override async update(change: (current: BudgetData) => BudgetData): Promise<BudgetData> {
    const gate = this.updateGate
    if (gate) {
      gate.reached()
      await gate.wait
      this.updateGate = null
    }
    return super.update(change)
  }
}

function extension(store: FakeBudgetStore, prepare?: () => Promise<void>): BudgetExtension {
  return new BudgetExtension({ logger: silentLogger(), store: store as unknown as BudgetStore, prepare })
}

function changedAccount(previous: BudgetAccount, name: string): Omit<BudgetAccount, 'id'> {
  return { name, currency: previous.currency, openingBalance: previous.openingBalance }
}

class PhotoVfs {
  readonly files = new Map<string, Uint8Array>()
  readonly deletes: Array<{ path: string; options?: DeleteOptions }> = []
  deleteFailure: Error | null = null

  async write(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(path, bytes.slice())
  }

  async read(path: string): Promise<Uint8Array> {
    const bytes = this.files.get(path)
    if (!bytes) throw new Error(`missing ${path}`)
    return bytes.slice()
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    this.deletes.push({ path, options })
    if (this.deleteFailure) throw this.deleteFailure
    this.files.delete(path)
  }
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const attachment: BudgetAttachment = {
  id: '11111111-1111-4111-8111-111111111111',
  path: 'receipts/11111111-1111-4111-8111-111111111111.jpg',
  name: 'Receipt',
  mimeType: 'image/jpeg',
  size: jpeg.length,
}
const sharedAttachment: BudgetAttachment = {
  ...attachment,
  id: '22222222-2222-4222-8222-222222222222',
  path: 'receipts/22222222-2222-4222-8222-222222222222.jpg',
}

describe('concurrent edits', () => {
  it('does not overwrite an entry changed by another extension while a form was open', async () => {
    const store = new FakeBudgetStore()
    const first = extension(store)
    const second = extension(store)
    await Promise.all([first.refresh(), second.refresh()])

    const firstPrevious = first.data.value.accounts[0]
    const stalePrevious = second.data.value.accounts[0]
    await first.saveAccount(changedAccount(firstPrevious, 'Main account'), firstPrevious)

    // A storage revision refreshes the page, but a form already open still holds its earlier record.
    await second.refresh()
    expect(second.data.value.accounts[0].name).toBe('Main account')

    await expect(second.saveAccount(changedAccount(stalePrevious, 'Stale overwrite'), stalePrevious)).rejects.toThrow('changed elsewhere')
    expect(store.snapshot().accounts[0].name).toBe('Main account')
  })
})

describe('mutation guards', () => {
  it('refuses to delete an account or category used by a transaction', async () => {
    const store = new FakeBudgetStore(usedBudgetData())
    const budget = extension(store)
    await budget.refresh()

    await expect(budget.removeAccount(budget.data.value.accounts[0])).rejects.toThrow('account has transactions')
    await expect(budget.removeCategory(budget.data.value.categories[0])).rejects.toThrow('category has transactions')

    expect(store.writes).toBe(0)
    expect(store.snapshot()).toEqual(usedBudgetData())
  })

  it('does not write after the initial load failed', async () => {
    const store = new FakeBudgetStore()
    store.loadFailure = new Error('unreadable budget')
    const budget = extension(store)

    await expect(budget.refresh()).rejects.toThrow('unreadable budget')
    expect(budget.status.value).toBe('failed')
    expect(budget.error.value).toBe('unreadable budget')

    const previous = store.snapshot().accounts[0]
    await expect(budget.saveAccount(changedAccount(previous, 'Must not land'), previous)).rejects.toThrow('Open the budget successfully')
    expect(store.updateCalls).toBe(0)
    expect(store.snapshot().accounts[0].name).toBe('Cash')
  })

  it('does not read or write when pending-storage preparation refuses offline access', async () => {
    const store = new FakeBudgetStore()
    let offline = true
    const prepare = vi.fn(async () => {
      if (offline) throw new Error('turn sync on')
    })
    const budget = extension(store, prepare)

    await expect(budget.refresh()).rejects.toThrow('turn sync on')
    expect(store.loadCalls).toBe(0)

    offline = false
    await budget.refresh()
    const previous = budget.data.value.accounts[0]
    offline = true
    await expect(budget.saveAccount(changedAccount(previous, 'Must not land'), previous)).rejects.toThrow('turn sync on')

    expect(store.updateCalls).toBe(0)
    expect(store.snapshot().accounts[0].name).toBe('Cash')
  })

  it('runs a later write after an earlier queued write failed', async () => {
    const store = new FakeBudgetStore()
    const budget = extension(store)
    await budget.refresh()
    const previous = budget.data.value.accounts[0]
    store.updateFailures.push(new Error('disk unavailable'))

    await expect(budget.saveAccount(changedAccount(previous, 'First attempt'), previous)).rejects.toThrow('disk unavailable')
    expect(budget.busy.value).toBe(false)

    await budget.saveAccount(changedAccount(previous, 'Recovered'), previous)
    expect(budget.busy.value).toBe(false)
    expect(store.snapshot().accounts[0].name).toBe('Recovered')
    expect(store.updateCalls).toBe(2)
  })
})

describe('stop()', () => {
  it('waits for an in-flight write and refuses later writes', async () => {
    const store = new GatedBudgetStore()
    const budget = extension(store)
    await budget.refresh()
    const previous = budget.data.value.accounts[0]
    const gate = store.gateNextUpdate()

    const writing = budget.saveAccount(changedAccount(previous, 'Saved before stop'), previous)
    await gate.reached

    let stopped = false
    const stopping = budget.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)

    gate.release()
    await Promise.all([writing, stopping])
    expect(stopped).toBe(true)
    expect(budget.status.value).toBe('stopped')
    expect(store.snapshot().accounts[0].name).toBe('Saved before stop')
    await expect(budget.saveAccount(changedAccount(previous, 'Too late'), previous)).rejects.toThrow('Budget is stopped')
  })
})

describe('receipt photo lifecycle', () => {
  it('checks the freshest budget under the mutation lock and keeps a photo referenced by another copy', async () => {
    const store = new FakeBudgetStore(usedBudgetData())
    const vfs = new PhotoVfs()
    await vfs.write(attachment.path, jpeg)
    let reached: (() => void) | undefined
    let release: (() => void) | undefined
    const waitingForLock = new Promise<void>((resolve) => {
      reached = resolve
    })
    const lockAvailable = new Promise<void>((resolve) => {
      release = resolve
    })
    const mutate = async <T>(work: () => Promise<T>): Promise<T> => {
      reached?.()
      await lockAvailable
      return work()
    }
    const budget = new BudgetExtension({
      logger: silentLogger(),
      store: store as unknown as BudgetStore,
      photos: new ReceiptPhotoStore(vfs),
      mutate,
    })
    await budget.refresh()

    const discarding = budget.discardReceiptPhoto(attachment)
    await waitingForLock
    await store.update((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) => ({ ...transaction, attachments: [attachment] })),
    }))
    release?.()
    await discarding

    expect(vfs.files.get(attachment.path)).toEqual(jpeg)
    expect(vfs.deletes).toEqual([])
  })

  it('keeps the photo when storage preparation, photo materialization, or the fresh budget read fails', async () => {
    for (const failure of ['prepare', 'preparePhoto', 'load'] as const) {
      const store = new FakeBudgetStore()
      const vfs = new PhotoVfs()
      await vfs.write(attachment.path, jpeg)
      const expected = new Error(`${failure} failed`)
      if (failure === 'load') store.loadFailure = expected
      const budget = new BudgetExtension({
        logger: silentLogger(),
        store: store as unknown as BudgetStore,
        photos: new ReceiptPhotoStore(vfs),
        prepare: failure === 'prepare' ? () => Promise.reject(expected) : undefined,
        preparePhoto: failure === 'preparePhoto' ? () => Promise.reject(expected) : undefined,
      })

      await expect(budget.discardReceiptPhoto(attachment)).rejects.toThrow(`${failure} failed`)
      expect(vfs.files.get(attachment.path)).toEqual(jpeg)
      expect(vfs.deletes).toEqual([])
    }
  })

  it('validates an attachment before asking the repository to materialize its path', async () => {
    const vfs = new PhotoVfs()
    const preparePhoto = vi.fn(async () => undefined)
    const budget = new BudgetExtension({
      logger: silentLogger(),
      store: new FakeBudgetStore() as unknown as BudgetStore,
      photos: new ReceiptPhotoStore(vfs),
      preparePhoto,
    })

    await expect(budget.readReceiptPhoto({ ...attachment, path: '../private-file' })).rejects.toThrow(/receipts.*uuid/)
    await expect(budget.readReceiptPhoto({ ...attachment, id: '22222222-2222-4222-8222-222222222222' })).rejects.toThrow(
      /Invalid receipt photo path/,
    )
    expect(preparePhoto).not.toHaveBeenCalled()
    expect(vfs.files.size).toBe(0)
  })

  it('does not delete photos when a stale transaction removal is refused', async () => {
    const initial = usedBudgetData()
    initial.transactions[0].attachments = [attachment]
    const store = new FakeBudgetStore(initial)
    const vfs = new PhotoVfs()
    await vfs.write(attachment.path, jpeg)
    const budget = new BudgetExtension({
      logger: silentLogger(),
      store: store as unknown as BudgetStore,
      photos: new ReceiptPhotoStore(vfs),
    })
    await budget.refresh()
    const stale = budget.data.value.transactions[0]
    await store.update((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) => ({ ...transaction, note: 'Changed elsewhere' })),
    }))

    await expect(budget.removeTransaction(stale)).rejects.toThrow(/changed elsewhere/)
    expect(vfs.files.get(attachment.path)).toEqual(jpeg)
    expect(vfs.deletes).toEqual([])
  })

  it('removes only photos left unreferenced after a successful transaction removal', async () => {
    const initial = usedBudgetData()
    initial.transactions[0].attachments = [attachment, sharedAttachment]
    initial.transactions.push({
      ...initial.transactions[0],
      id: 'dinner',
      note: 'Dinner',
      attachments: [sharedAttachment],
    })
    const store = new FakeBudgetStore(initial)
    const vfs = new PhotoVfs()
    await vfs.write(attachment.path, jpeg)
    await vfs.write(sharedAttachment.path, jpeg)
    const budget = new BudgetExtension({
      logger: silentLogger(),
      store: store as unknown as BudgetStore,
      photos: new ReceiptPhotoStore(vfs),
    })
    await budget.refresh()

    await budget.removeTransaction(budget.data.value.transactions[0])

    expect(store.snapshot().transactions.map((transaction) => transaction.id)).toEqual(['dinner'])
    expect(vfs.files.has(attachment.path)).toBe(false)
    expect(vfs.files.get(sharedAttachment.path)).toEqual(jpeg)
    expect(vfs.deletes).toEqual([{ path: attachment.path, options: { force: true } }])
  })

  it('keeps the successful metadata removal when orphan cleanup fails', async () => {
    const initial = usedBudgetData()
    initial.transactions[0].attachments = [attachment]
    const store = new FakeBudgetStore(initial)
    const vfs = new PhotoVfs()
    await vfs.write(attachment.path, jpeg)
    vfs.deleteFailure = new Error('photo storage unavailable')
    const logger = silentLogger()
    const warning = vi.spyOn(logger, 'warn')
    const budget = new BudgetExtension({
      logger,
      store: store as unknown as BudgetStore,
      photos: new ReceiptPhotoStore(vfs),
    })
    await budget.refresh()

    await expect(budget.removeTransaction(budget.data.value.transactions[0])).resolves.toBeUndefined()
    expect(store.snapshot().transactions).toEqual([])
    expect(vfs.files.get(attachment.path)).toEqual(jpeg)
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(attachment.path), expect.any(Error))
  })
})
