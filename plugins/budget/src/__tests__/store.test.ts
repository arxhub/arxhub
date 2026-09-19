import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from '@arxhub/core'
import { validation } from '@arxhub/errors'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { type BudgetData, type BudgetTransaction, serializeBudget } from '../model'
import { BUDGET_PATH, BudgetStore, MAX_BUDGET_UPDATE_RETRIES } from '../store'

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silent,
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const transaction = (
  value: Partial<BudgetTransaction> & Pick<BudgetTransaction, 'id' | 'accountId' | 'categoryId' | 'kind' | 'amount' | 'date'>,
): BudgetTransaction => ({
  note: '',
  placeId: null,
  items: [],
  attachments: [],
  fiscalReceipt: null,
  ...value,
})

const seed = (): BudgetData => ({
  version: 2,
  accounts: [{ id: 'cash', name: 'Cash', currency: 'USD', openingBalance: 0 }],
  categories: [{ id: 'food', name: 'Food', kind: 'expense' }],
  places: [],
  transactions: [],
})

class FirstSwapGate {
  private arrivals = 0
  private release: (() => void) | undefined
  private readonly ready = new Promise<void>((resolve) => {
    this.release = resolve
  })

  async arrive(): Promise<void> {
    this.arrivals++
    if (this.arrivals === 2) this.release?.()
    await this.ready
  }
}

class GatedNodeFileSystem extends NodeFileSystem {
  private firstSwap = true
  private readonly gate: FirstSwapGate

  constructor(root: string, gate: FirstSwapGate) {
    super(root, silent)
    this.gate = gate
  }

  override async compareAndSwap(pathname: string, expected: Uint8Array | null, next: Uint8Array): Promise<boolean> {
    if (this.firstSwap) {
      this.firstSwap = false
      await this.gate.arrive()
    }
    return super.compareAndSwap(pathname, expected, next)
  }
}

describe('BudgetStore', () => {
  let directory: string
  let vfs: NodeFileSystem

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'arxhub-budget-'))
    vfs = new NodeFileSystem(directory, silent)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('a missing file loads empty without writing a file', async () => {
    expect(await new BudgetStore(vfs).load()).toEqual({ version: 2, accounts: [], categories: [], places: [], transactions: [] })
    expect(await vfs.exists(BUDGET_PATH)).toBe(false)
  })

  test('loads v1 in memory without rewriting the existing file', async () => {
    const legacy = encoder.encode(
      [
        '{"type":"budget","version":1}',
        '{"type":"account","id":"cash","name":"Cash","currency":"USD","openingBalance":0}',
        '{"type":"category","id":"food","name":"Food","kind":"expense"}',
        '{"type":"transaction","id":"old","accountId":"cash","categoryId":"food","kind":"expense","amount":1,"date":"2026-09-01","note":""}',
        '',
      ].join('\n'),
    )
    await vfs.write(BUDGET_PATH, legacy)

    const loaded = await new BudgetStore(vfs).load()

    expect(loaded).toMatchObject({ version: 2, places: [] })
    expect(loaded.transactions[0]).toMatchObject({ placeId: null, items: [], attachments: [], fiscalReceipt: null })
    expect(await vfs.read(BUDGET_PATH)).toEqual(legacy)
  })

  test('an invalid existing file is neither treated as empty nor replaced by update', async () => {
    const damaged = encoder.encode('{"type":"budget","version":1}\nnot-json\n')
    await vfs.write(BUDGET_PATH, damaged)
    const store = new BudgetStore(vfs)

    await expect(store.load()).rejects.toThrow(/line 2/)
    await expect(store.update(() => seed())).rejects.toThrow(/line 2/)
    expect(await vfs.read(BUDGET_PATH)).toEqual(damaged)
  })

  test('an unreadable file error propagates instead of becoming an empty budget', async () => {
    vi.spyOn(vfs, 'read').mockRejectedValue(validation('disk is unreadable'))
    await expect(new BudgetStore(vfs).load()).rejects.toThrow(/disk is unreadable/)
  })

  test('validation happens before the first write', async () => {
    await expect(
      new BudgetStore(vfs).update(() => ({
        ...seed(),
        transactions: [transaction({ id: 'bad', accountId: 'gone', categoryId: 'food', kind: 'expense', amount: 1, date: '2026-09-01' })],
      })),
    ).rejects.toThrow(/missing account/)
    expect(await vfs.exists(BUDGET_PATH)).toBe(false)
  })

  test('two tabs losing the same CAS both preserve their independent transaction', async () => {
    await vfs.write(BUDGET_PATH, encoder.encode(serializeBudget(seed())))
    const gate = new FirstSwapGate()
    const first = new BudgetStore(new GatedNodeFileSystem(directory, gate))
    const second = new BudgetStore(new GatedNodeFileSystem(directory, gate))
    const add =
      (id: string, amount: number) =>
      (current: BudgetData): BudgetData => ({
        ...current,
        transactions: [
          ...current.transactions,
          transaction({ id, accountId: 'cash', categoryId: 'food', kind: 'expense', amount, date: '2026-09-01' }),
        ],
      })

    await Promise.all([first.update(add('one', 100)), second.update(add('two', 200))])

    const loaded = await new BudgetStore(vfs).load()
    expect(loaded.transactions.map((item) => item.id).sort()).toEqual(['one', 'two'])
  })

  test('gives up after the bounded number of CAS losses', async () => {
    const swap = vi.spyOn(vfs, 'compareAndSwap').mockResolvedValue(false)
    await expect(new BudgetStore(vfs).update(() => seed())).rejects.toThrow(/10 concurrent changes/)
    expect(swap).toHaveBeenCalledTimes(MAX_BUDGET_UPDATE_RETRIES)
    expect(await vfs.exists(BUDGET_PATH)).toBe(false)
  })

  test('refuses repository conflict copies, including their versioned suffixes', async () => {
    await vfs.write(BUDGET_PATH, encoder.encode(serializeBudget(seed())))
    await vfs.write('conflict-deadbeef-budget-2.jsonl', encoder.encode(serializeBudget(seed())))
    const store = new BudgetStore(vfs)

    await expect(store.load()).rejects.toThrow(/unresolved conflict copy.*conflict-deadbeef-budget-2\.jsonl/)
    await expect(store.update((current) => current)).rejects.toThrow(/unresolved conflict copy/)
    expect(decoder.decode(await vfs.read(BUDGET_PATH))).toBe(serializeBudget(seed()))
  })
})
