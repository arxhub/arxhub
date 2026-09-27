import { validation } from '@arxhub/errors'
import { formatDate } from '@arxhub/i18n'
import type { BudgetData } from './model'

export interface MonthExpense {
  currency: string
  amount: number
}

export interface BudgetMonth {
  // YYYY-MM
  month: string
  // Spending only: the sum a month is remembered by is what went out, and income beside it in one line
  // would read as a balance. One entry per currency, sorted by code — amounts in two currencies never add.
  expenses: MonthExpense[]
}

export interface BudgetYear {
  year: string
  months: BudgetMonth[]
}

const MONTH = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/

// Every month the budget has a transaction in, plus the current one even while it is still empty — it is
// the month a purchase lands in, so it has to be reachable before the first one. Newest first, grouped by
// year, the way a list of periods is read.
export function budgetMonths(data: BudgetData, current: string): BudgetYear[] {
  if (!MONTH.test(current)) throw validation(`Invalid budget month "${current}": expected YYYY-MM`)
  const currencies = new Map(data.accounts.map((account) => [account.id, account.currency]))
  const months = new Map<string, Map<string, number>>([[current, new Map()]])
  for (const transaction of data.transactions) {
    const month = transaction.date.slice(0, 7)
    if (!MONTH.test(month)) continue
    const totals = months.get(month) ?? new Map<string, number>()
    months.set(month, totals)
    const currency = currencies.get(transaction.accountId)
    if (currency == null || transaction.kind !== 'expense') continue
    const sum = (totals.get(currency) ?? 0) + transaction.amount
    if (!Number.isSafeInteger(sum)) throw validation(`${currency} spending in ${month} exceeds the safe integer range`, 'Money overflow')
    totals.set(currency, sum)
  }
  const years: BudgetYear[] = []
  for (const month of [...months.keys()].sort().reverse()) {
    const year = month.slice(0, 4)
    const expenses = [...(months.get(month) ?? new Map<string, number>()).entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([currency, amount]) => ({ currency, amount }))
    const last = years.at(-1)
    if (last?.year === year) last.months.push({ month, expenses })
    else years.push({ year, months: [{ month, expenses }] })
  }
  return years
}

// "September 2026". Read in UTC so the name never slips to the neighbouring month at a timezone edge.
export function monthName(month: string, withYear = true): string {
  if (!MONTH.test(month)) return month
  const [year, index] = month.split('-').map(Number)
  return formatDate(Date.UTC(year, index - 1, 1), { month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}
