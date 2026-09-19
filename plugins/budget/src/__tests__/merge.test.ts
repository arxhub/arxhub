import { describe, expect, test } from 'vitest'
import { mergeBudgets } from '../merge'
import { type BudgetData, type BudgetTransaction, parseBudget, serializeBudget } from '../model'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const bytes = (data: BudgetData) => encoder.encode(serializeBudget(data))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
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

const baseData = (): BudgetData => ({
  version: 2,
  accounts: [
    { id: 'a', name: 'Cash', currency: 'RUB', openingBalance: 0 },
    { id: 'b', name: 'Card', currency: 'USD', openingBalance: 0 },
  ],
  categories: [
    { id: 'income', name: 'Income', kind: 'income' },
    { id: 'expense', name: 'Expense', kind: 'expense' },
  ],
  places: [{ id: 'shop', name: 'Shop', latitude: 54.71, longitude: 20.45 }],
  transactions: [],
})

function merged(base: BudgetData | null, local: BudgetData, remote: BudgetData): BudgetData | null {
  const result = mergeBudgets(base ? bytes(base) : null, bytes(local), bytes(remote))
  return result ? parseBudget(decoder.decode(result)) : null
}

describe('mergeBudgets', () => {
  test('merges independent additions and edits by stable id', () => {
    const base = baseData()
    const local = clone(base)
    local.accounts[0].name = 'Wallet'
    local.transactions.push(
      transaction({ id: 'local', accountId: 'a', categoryId: 'expense', kind: 'expense', amount: 100, date: '2026-09-01', placeId: 'shop' }),
    )
    const remote = clone(base)
    remote.accounts[1].name = 'Travel card'
    remote.transactions.push(
      transaction({ id: 'remote', accountId: 'b', categoryId: 'income', kind: 'income', amount: 200, date: '2026-09-02' }),
    )

    const result = merged(base, local, remote)
    expect(result?.accounts.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'a', name: 'Wallet' },
      { id: 'b', name: 'Travel card' },
    ])
    expect(result?.transactions.map((item) => item.id)).toEqual(['local', 'remote'])
  })

  test('accepts the same edit on both sides and a one-sided deletion', () => {
    const base = baseData()
    const both = clone(base)
    both.categories[0].name = 'Salary'
    both.accounts = both.accounts.filter((account) => account.id !== 'b')
    expect(merged(base, both, clone(both))).toEqual(parseBudget(serializeBudget(both)))
  })

  test('declines incompatible edits and edit-versus-delete', () => {
    const base = baseData()
    const local = clone(base)
    local.accounts[0].name = 'Local'
    const remote = clone(base)
    remote.accounts[0].name = 'Remote'
    expect(merged(base, local, remote)).toBeNull()

    remote.accounts = remote.accounts.filter((account) => account.id !== 'a')
    expect(merged(base, local, remote)).toBeNull()
  })

  test('unions independent records without a common ancestor', () => {
    const local = baseData()
    local.transactions.push(transaction({ id: 'local', accountId: 'a', categoryId: 'expense', kind: 'expense', amount: 1, date: '2026-09-01' }))
    const remote = baseData()
    remote.transactions.push(
      transaction({ id: 'remote', accountId: 'b', categoryId: 'expense', kind: 'expense', amount: 2, date: '2026-09-01' }),
    )
    expect(merged(null, local, remote)?.transactions.map((item) => item.id)).toEqual(['local', 'remote'])
  })

  test('declines a merge whose independently valid changes break a reference', () => {
    const base = baseData()
    const local = clone(base)
    local.accounts = local.accounts.filter((account) => account.id !== 'a')
    const remote = clone(base)
    remote.transactions.push(
      transaction({ id: 'remote', accountId: 'a', categoryId: 'expense', kind: 'expense', amount: 1, date: '2026-09-01' }),
    )
    expect(merged(base, local, remote)).toBeNull()
  })

  test('declines currency reinterpretation when another side adds a transaction', () => {
    const base = baseData()
    const local = clone(base)
    local.accounts[0].currency = 'USD'
    const remote = clone(base)
    remote.transactions.push(
      transaction({
        id: 'remote',
        accountId: 'a',
        categoryId: 'expense',
        kind: 'expense',
        amount: 100,
        date: '2026-09-01',
      }),
    )
    expect(merged(base, local, remote)).toBeNull()
  })

  test('merges independent places and declines deletion when another side starts referencing the place', () => {
    const base = baseData()
    const local = clone(base)
    local.places.push({ id: 'cafe', name: 'Cafe', latitude: null, longitude: null })
    const remote = clone(base)
    remote.places[0].name = 'Main shop'
    expect(merged(base, local, remote)?.places.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'cafe', name: 'Cafe' },
      { id: 'shop', name: 'Main shop' },
    ])

    const deleted = clone(base)
    deleted.places = []
    const used = clone(base)
    used.transactions.push(
      transaction({ id: 'at-shop', accountId: 'a', categoryId: 'expense', kind: 'expense', amount: 1, date: '2026-09-01', placeId: 'shop' }),
    )
    expect(merged(base, deleted, used)).toBeNull()
  })

  test('merges a migrated v1 side with v2 and emits v2', () => {
    const legacy = encoder.encode(
      [
        '{"type":"budget","version":1}',
        '{"type":"account","id":"a","name":"Cash","currency":"RUB","openingBalance":0}',
        '{"type":"category","id":"expense","name":"Expense","kind":"expense"}',
        '',
      ].join('\n'),
    )
    const remote = baseData()
    remote.accounts = remote.accounts.filter((account) => account.id === 'a')
    remote.categories = remote.categories.filter((category) => category.id === 'expense')
    const result = mergeBudgets(null, legacy, bytes(remote))
    expect(result).not.toBeNull()
    expect(parseBudget(decoder.decode(result as Uint8Array))).toMatchObject({ version: 2, places: remote.places })
  })

  test('declines two independently added transactions carrying the same fiscal receipt', () => {
    const base = baseData()
    const receipt = { fn: '1234567890123456', fd: '42', fp: '777', issuedAt: '2026-09-01T12:00', total: 100, operation: 1 as const }
    const local = clone(base)
    local.transactions.push(
      transaction({
        id: 'local',
        accountId: 'a',
        categoryId: 'expense',
        kind: 'expense',
        amount: 100,
        date: '2026-09-01',
        fiscalReceipt: receipt,
      }),
    )
    const remote = clone(base)
    remote.transactions.push(
      transaction({
        id: 'remote',
        accountId: 'a',
        categoryId: 'expense',
        kind: 'expense',
        amount: 100,
        date: '2026-09-01',
        fiscalReceipt: receipt,
      }),
    )

    expect(merged(base, local, remote)).toBeNull()
  })

  test('returns null instead of throwing for invalid input', () => {
    const valid = bytes(baseData())
    expect(mergeBudgets(null, encoder.encode('not JSONL'), valid)).toBeNull()
    expect(mergeBudgets(null, valid, new Uint8Array([0xff]))).toBeNull()
  })

  test('always emits canonical JSONL that round-trips', () => {
    const base = baseData()
    const result = mergeBudgets(bytes(base), bytes(clone(base)), bytes(clone(base)))
    expect(result).not.toBeNull()
    const text = decoder.decode(result as Uint8Array)
    expect(text.endsWith('\n')).toBe(true)
    expect(serializeBudget(parseBudget(text))).toBe(text)
  })
})
