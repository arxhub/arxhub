import { describe, expect, test } from 'vitest'
import type { BudgetData, BudgetTransaction } from '../model'
import { budgetMonths } from '../months'

const transaction = (value: Pick<BudgetTransaction, 'id' | 'accountId' | 'kind' | 'amount' | 'date'>): BudgetTransaction => ({
  categoryId: 'food',
  note: '',
  placeId: null,
  items: [],
  attachments: [],
  fiscalReceipt: null,
  ...value,
})

const data = (transactions: BudgetTransaction[]): BudgetData => ({
  version: 2,
  accounts: [
    { id: 'rub', name: 'Cash', currency: 'RUB', openingBalance: 0 },
    { id: 'usd', name: 'Card', currency: 'USD', openingBalance: 0 },
  ],
  categories: [{ id: 'food', name: 'Food', kind: 'expense' }],
  places: [],
  transactions,
})

describe('budgetMonths', () => {
  test('lists months newest first, grouped by year, with spending per currency', () => {
    const years = budgetMonths(
      data([
        transaction({ id: 'a', accountId: 'rub', kind: 'expense', amount: 1_000, date: '2025-11-03' }),
        transaction({ id: 'b', accountId: 'rub', kind: 'expense', amount: 250, date: '2026-08-02' }),
        transaction({ id: 'c', accountId: 'usd', kind: 'expense', amount: 700, date: '2026-08-10' }),
        transaction({ id: 'd', accountId: 'rub', kind: 'expense', amount: 50, date: '2026-08-30' }),
      ]),
      '2026-09',
    )
    expect(years).toEqual([
      {
        year: '2026',
        months: [
          { month: '2026-09', expenses: [] },
          {
            month: '2026-08',
            expenses: [
              { currency: 'RUB', amount: 300 },
              { currency: 'USD', amount: 700 },
            ],
          },
        ],
      },
      { year: '2025', months: [{ month: '2025-11', expenses: [{ currency: 'RUB', amount: 1_000 }] }] },
    ])
  })

  test('a month with only income is listed, with nothing spent', () => {
    const years = budgetMonths(data([transaction({ id: 'a', accountId: 'rub', kind: 'income', amount: 9_000, date: '2026-07-01' })]), '2026-07')
    expect(years).toEqual([{ year: '2026', months: [{ month: '2026-07', expenses: [] }] }])
  })

  test('refuses a current month that is not a month', () => {
    expect(() => budgetMonths(data([]), '2026-13')).toThrow()
  })
})
