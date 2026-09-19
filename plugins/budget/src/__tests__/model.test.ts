import { describe, expect, test } from 'vitest'
import {
  accountBalance,
  type BudgetData,
  type BudgetTransaction,
  categoryTotals,
  emptyBudget,
  monthlyTotals,
  parseBudget,
  serializeBudget,
  validateBudget,
  validateBudgetAttachment,
  validateFiscalReceipt,
} from '../model'

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

const data = (): BudgetData => ({
  version: 2,
  accounts: [
    { id: 'rub', name: 'Cash', currency: 'RUB', openingBalance: 50_000 },
    { id: 'usd', name: 'Card', currency: 'USD', openingBalance: -500 },
  ],
  categories: [
    { id: 'salary', name: 'Salary', kind: 'income' },
    { id: 'food', name: 'Food', kind: 'expense' },
  ],
  places: [{ id: 'market', name: 'Market', latitude: 54.7104, longitude: 20.4522 }],
  transactions: [
    transaction({ id: 't3', accountId: 'rub', categoryId: 'food', kind: 'expense', amount: 1_250, date: '2026-08-31', note: 'Old' }),
    transaction({ id: 't1', accountId: 'rub', categoryId: 'salary', kind: 'income', amount: 100_000, date: '2026-09-01' }),
    transaction({
      id: 't2',
      accountId: 'rub',
      categoryId: 'food',
      kind: 'expense',
      amount: 12_345,
      date: '2026-09-02',
      note: 'Market',
      placeId: 'market',
      items: [{ id: 'i1', name: 'Apples', quantity: '1.25', unitPrice: 10_000, total: 12_000 }],
      attachments: [
        {
          id: 'photo',
          path: 'receipts/12345678-1234-1234-1234-123456789abc.jpg',
          name: 'Receipt',
          mimeType: 'image/jpeg',
          size: 123,
        },
      ],
      fiscalReceipt: { fn: '1234567890123456', fd: '42', fp: '777', issuedAt: '2026-09-02T12:34:56', total: 12_345, operation: 1 },
    }),
    transaction({ id: 't4', accountId: 'usd', categoryId: 'food', kind: 'expense', amount: 250, date: '2026-09-03' }),
  ],
})

describe('budget JSONL', () => {
  test('round-trips with a canonical record and id order plus a trailing newline', () => {
    const encoded = serializeBudget(data())
    expect(encoded.endsWith('\n')).toBe(true)
    expect(
      encoded
        .split('\n')
        .slice(0, -1)
        .map((line) => JSON.parse(line).type),
    ).toEqual(['budget', 'account', 'account', 'category', 'category', 'place', 'transaction', 'transaction', 'transaction', 'transaction'])
    expect(encoded.indexOf('"id":"rub"')).toBeLessThan(encoded.indexOf('"id":"usd"'))
    expect(serializeBudget(parseBudget(encoded))).toBe(encoded)
  })

  test('accepts a real leap date and rejects impossible or non-local-calendar date syntax', () => {
    const budget = data()
    budget.transactions[0].date = '2024-02-29'
    expect(validateBudget(budget).transactions[0].date).toBe('2024-02-29')
    for (const date of ['2023-02-29', '2026-04-31', '2026-9-01', '0000-01-01', '2026-01-01T00:00:00Z']) {
      const invalid = data()
      invalid.transactions[0].date = date
      expect(() => validateBudget(invalid), date).toThrow(/real local calendar date/)
    }
  })

  test('reports the damaged JSONL line and refuses blank, unknown, and future records', () => {
    expect(() => parseBudget('')).toThrow(/JSONL.*empty/)
    expect(() => parseBudget('{"type":"budget","version":1}\n\n')).toThrow(/line 2.*blank/)
    expect(() => parseBudget('{"type":"budget","version":3}\n')).toThrow(/line 1.*version/)
    expect(() => parseBudget('{"type":"budget","version":1,"future":true}\n')).toThrow(/line 1.*unknown field "future"/)
    expect(() => parseBudget('{"type":"budget","version":1}\n{"type":"future","id":"x"}\n')).toThrow(/line 2.*unknown record type/)
    expect(() => parseBudget('{"type":"budget","version":1}\nnot-json\n')).toThrow(/line 2.*invalid JSON/)
    expect(() =>
      parseBudget('{"type":"budget","version":1}\n{"type":"account","id":"a","name":"A","currency":"usd","openingBalance":0}\n'),
    ).toThrow(/line 2.*currency/)
  })

  test('migrates v1 records in memory and writes canonical v2', () => {
    const legacy = [
      '{"type":"budget","version":1}',
      '{"type":"account","id":"a","name":"A","currency":"RUB","openingBalance":0}',
      '{"type":"category","id":"c","name":"C","kind":"expense"}',
      '{"type":"transaction","id":"t","accountId":"a","categoryId":"c","kind":"expense","amount":1,"date":"2026-09-01","note":"legacy"}',
      '',
    ].join('\n')
    const migrated = parseBudget(legacy)
    expect(migrated).toMatchObject({ version: 2, places: [] })
    expect(migrated.transactions[0]).toMatchObject({ placeId: null, items: [], attachments: [], fiscalReceipt: null })
    expect(serializeBudget(migrated)).toMatch(/^\{"type":"budget","version":2\}/)
  })

  test('strictly validates fields, ids, references, kinds, and positive minor-unit amounts', () => {
    const unknown = data() as BudgetData & { future?: boolean }
    unknown.future = true
    expect(() => validateBudget(unknown)).toThrow(/unknown field "future"/)

    const badId = data()
    badId.accounts[0].id = 'not an id'
    expect(() => validateBudget(badId)).toThrow(/identifier/)

    const duplicate = data()
    duplicate.transactions[1].id = duplicate.transactions[0].id
    expect(() => validateBudget(duplicate)).toThrow(/duplicate transaction id/)

    const missing = data()
    missing.transactions[0].accountId = 'gone'
    expect(() => validateBudget(missing)).toThrow(/missing account/)

    const mismatch = data()
    mismatch.transactions[0].kind = 'income'
    expect(() => validateBudget(mismatch)).toThrow(/does not match category/)

    const zero = data()
    zero.transactions[0].amount = 0
    expect(() => validateBudget(zero)).toThrow(/must be positive/)
  })

  test('validates places, item ids and quantities, receipt attachments, and place references', () => {
    const halfCoordinate = data()
    halfCoordinate.places[0].longitude = null
    expect(() => validateBudget(halfCoordinate)).toThrow(/latitude and longitude/)

    const missingPlace = data()
    missingPlace.transactions[2].placeId = 'gone'
    expect(() => validateBudget(missingPlace)).toThrow(/missing place/)

    const badQuantity = data()
    badQuantity.transactions[2].items[0].quantity = '1.1234567'
    expect(() => validateBudget(badQuantity)).toThrow(/quantity/)

    const duplicateItem = data()
    duplicateItem.transactions[2].items.push({ ...duplicateItem.transactions[2].items[0] })
    expect(() => validateBudget(duplicateItem)).toThrow(/duplicate item id/)

    const unsafePath = data()
    unsafePath.transactions[2].attachments[0].path = '../receipt.jpg'
    expect(() => validateBudget(unsafePath)).toThrow(/receipts.*uuid/)

    const wrongMime = data()
    wrongMime.transactions[2].attachments[0].mimeType = 'image/png'
    expect(() => validateBudget(wrongMime)).toThrow(/mimeType/)

    expect(
      validateBudgetAttachment({
        id: 'a',
        path: 'receipts/12345678-1234-1234-1234-123456789abc.webp',
        name: 'Photo',
        mimeType: 'image/webp',
        size: 10 * 1024 * 1024,
      }),
    ).toMatchObject({ mimeType: 'image/webp' })
  })

  test('enforces fiscal identity, amount, RUB and supported operation semantics while preserving operations 3 and 4', () => {
    const duplicate = data()
    duplicate.transactions.push(
      transaction({
        id: 'duplicate-receipt',
        accountId: 'rub',
        categoryId: 'food',
        kind: 'expense',
        amount: 12_345,
        date: '2026-09-02',
        fiscalReceipt: { ...duplicate.transactions[2].fiscalReceipt } as NonNullable<BudgetTransaction['fiscalReceipt']>,
      }),
    )
    expect(() => validateBudget(duplicate)).toThrow(/already attached/)

    const paddedDuplicate = data()
    paddedDuplicate.transactions.push(
      transaction({
        id: 'padded-duplicate',
        accountId: 'rub',
        categoryId: 'food',
        kind: 'expense',
        amount: 12_345,
        date: '2026-09-02',
        fiscalReceipt: {
          ...(paddedDuplicate.transactions[2].fiscalReceipt as NonNullable<BudgetTransaction['fiscalReceipt']>),
          fd: '00042',
          fp: '000777',
        },
      }),
    )
    expect(() => validateBudget(paddedDuplicate)).toThrow(/already attached/)

    const nonRub = data()
    nonRub.transactions[2].accountId = 'usd'
    expect(() => validateBudget(nonRub)).toThrow(/RUB account/)

    const wrongTotal = data()
    const receipt = wrongTotal.transactions[2].fiscalReceipt
    if (receipt) receipt.total++
    expect(() => validateBudget(wrongTotal)).toThrow(/does not match/)

    const returnReceipt = data()
    if (returnReceipt.transactions[2].fiscalReceipt) returnReceipt.transactions[2].fiscalReceipt.operation = 3
    expect(validateBudget(returnReceipt).transactions[2].fiscalReceipt?.operation).toBe(3)
  })

  test('strictly validates fiscal field ranges and local timestamps', () => {
    const valid = { fn: '0000123456789012', fd: '00042', fp: '4294967295', issuedAt: '2026-09-02T23:59', total: 1, operation: 4 as const }
    expect(validateFiscalReceipt(valid)).toEqual(valid)
    expect(() => validateFiscalReceipt({ ...valid, fn: '123' })).toThrow(/16 decimal digits/)
    expect(() => validateFiscalReceipt({ ...valid, fd: '0' })).toThrow(/positive decimal/)
    expect(() => validateFiscalReceipt({ ...valid, fp: '4294967296' })).toThrow(/4294967295/)
    expect(() => validateFiscalReceipt({ ...valid, issuedAt: '2026-09-02T23:59Z' })).toThrow(/without a timezone/)
    expect(() => validateFiscalReceipt({ ...valid, issuedAt: '2026-09-02T24:00' })).toThrow(/real local time/)
    expect(() => validateFiscalReceipt({ ...valid, total: 0 })).toThrow(/positive/)
    expect(() => validateFiscalReceipt({ ...valid, total: 281_474_976_710_656 })).toThrow(/must not exceed/)
  })

  test('preserves imported line totals instead of recalculating discounts and rejects their aggregate overflow', () => {
    expect(validateBudget(data()).transactions[2].items[0]).toMatchObject({ quantity: '1.25', unitPrice: 10_000, total: 12_000 })
    const overflow = data()
    overflow.transactions[2].items = [
      { id: 'one', name: 'One', quantity: '1', unitPrice: 1, total: Number.MAX_SAFE_INTEGER },
      { id: 'two', name: 'Two', quantity: '1', unitPrice: 1, total: 1 },
    ]
    expect(() => validateBudget(overflow)).toThrow(/item total.*safe integer range/)
  })
})

describe('budget totals', () => {
  test('keeps currencies separate and excludes opening balances from monthly income', () => {
    expect(monthlyTotals(data(), '2026-09')).toEqual([
      { currency: 'RUB', income: 100_000, expense: 12_345, balance: 87_655 },
      { currency: 'USD', income: 0, expense: 250, balance: -250 },
    ])
    expect(categoryTotals(data(), '2026-09')).toEqual([
      { categoryId: 'food', currency: 'RUB', amount: 12_345 },
      { categoryId: 'food', currency: 'USD', amount: 250 },
      { categoryId: 'salary', currency: 'RUB', amount: 100_000 },
    ])
    expect(accountBalance(data(), 'rub')).toBe(136_405)
    expect(accountBalance(data(), 'usd')).toBe(-750)
  })

  test('validates the requested month and unknown account', () => {
    expect(() => monthlyTotals(emptyBudget(), '2026-13')).toThrow(/calendar month/)
    expect(() => categoryTotals(emptyBudget(), '2026-9')).toThrow(/calendar month/)
    expect(() => accountBalance(emptyBudget(), 'missing')).toThrow(/Unknown budget account/)
  })

  test('rejects aggregate overflow while parsing, before computed totals can fail', () => {
    const text = [
      '{"type":"budget","version":1}',
      `{"type":"account","id":"a","name":"A","currency":"USD","openingBalance":${Number.MAX_SAFE_INTEGER}}`,
      '{"type":"category","id":"c","name":"C","kind":"income"}',
      '{"type":"transaction","id":"t","accountId":"a","categoryId":"c","kind":"income","amount":1,"date":"2026-09-01","note":""}',
      '',
    ].join('\n')
    expect(() => parseBudget(text)).toThrow(/safe integer range/)
  })

  test('computes account balances exactly before checking the final safe-integer range', () => {
    const budget = data()
    budget.accounts = [{ id: 'rub', name: 'Cash', currency: 'RUB', openingBalance: Number.MAX_SAFE_INTEGER }]
    budget.categories = [
      { id: 'income', name: 'Income', kind: 'income' },
      { id: 'expense', name: 'Expense', kind: 'expense' },
    ]
    budget.places = []
    budget.transactions = [
      transaction({
        id: 'income-first',
        accountId: 'rub',
        categoryId: 'income',
        kind: 'income',
        amount: Number.MAX_SAFE_INTEGER,
        date: '2026-09-01',
      }),
      transaction({
        id: 'expense-second',
        accountId: 'rub',
        categoryId: 'expense',
        kind: 'expense',
        amount: Number.MAX_SAFE_INTEGER,
        date: '2026-09-01',
      }),
    ]
    expect(accountBalance(budget, 'rub')).toBe(Number.MAX_SAFE_INTEGER)
    const encoded = serializeBudget(budget)
    expect(accountBalance(parseBudget(encoded), 'rub')).toBe(Number.MAX_SAFE_INTEGER)
    expect(serializeBudget(parseBudget(encoded))).toBe(encoded)
  })
})
