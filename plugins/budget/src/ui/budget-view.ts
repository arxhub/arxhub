import type { Logger } from '@arxhub/logger'
import type { ObjectBar } from '@arxhub/plugin-shell'
import type { ActionItem } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { ref, shallowRef } from 'vue'
import type { BudgetExtension } from '../budget-extension'
import type { BudgetTransaction } from '../model'
import { formatAmount } from '../money'
import { budgetMonths, monthName } from '../months'
import { type BudgetSection, errorMessage, isValidMonth, localMonth } from './budget-ui'

// What the budget screen is looking at. It outlives the page because two things outside the page read and
// move it: the phone's band names the month and offers a new purchase, and the second-tap sheet picks the
// month. State held in the page component would be three copies that disagree after the first tap.
export class BudgetView {
  readonly month = ref(localMonth())
  readonly section = ref<BudgetSection>('overview')
  readonly transactionOpen = ref(false)
  readonly editing = shallowRef<BudgetTransaction | undefined>()

  addTransaction(): void {
    this.editing.value = undefined
    this.transactionOpen.value = true
  }

  editTransaction(transaction: BudgetTransaction): void {
    this.editing.value = transaction
    this.transactionOpen.value = true
  }

  // A month is shown by the two sections that have one; picking it from anywhere else would change what
  // is not on screen.
  showMonth(month: string): void {
    this.month.value = month
    if (this.section.value !== 'overview' && this.section.value !== 'transactions') this.section.value = 'overview'
  }
}

const views = new WeakMap<BudgetExtension, BudgetView>()

export function budgetView(budget: BudgetExtension): BudgetView {
  let view = views.get(budget)
  if (view == null) {
    view = new BudgetView()
    views.set(budget, view)
  }
  return view
}

export function spentLabel(expenses: { currency: string; amount: number }[]): string {
  return expenses.length === 0 ? 'Nothing spent' : expenses.map((entry) => formatAmount(entry.amount, entry.currency)).join(' · ')
}

export async function refreshBudget(budget: BudgetExtension, logger: Logger, announce: boolean): Promise<void> {
  try {
    await budget.refresh()
    if (announce) toaster.create({ title: 'Budget refreshed', type: 'success' })
  } catch (cause) {
    logger.error('[budget] could not refresh budget data', cause)
    toaster.create({ title: announce ? 'Could not refresh budget' : 'Could not load budget', description: errorMessage(cause), type: 'error' })
  }
}

// The phone's band: the month on screen and what it cost, and the two things done to a budget most often.
// No band until the budget is open — a New purchase key over "Budget could not be opened" would be a
// control for data that is not there.
export function budgetBar(budget: BudgetExtension, logger: Logger): ObjectBar | null {
  if (budget.status.value !== 'ready') return null
  const view = budgetView(budget)
  const data = budget.data.value
  const month = view.month.value
  const spent = isValidMonth(month)
    ? budgetMonths(data, month)
        .flatMap((year) => year.months)
        .find((entry) => entry.month === month)
    : undefined
  const actions: ActionItem[] = [
    {
      id: 'budget.new',
      label: 'New purchase',
      icon: 'lu:plus',
      disabled: budget.busy.value || data.accounts.length === 0 || data.categories.length === 0,
      onSelect: () => view.addTransaction(),
    },
    {
      id: 'budget.refresh',
      label: 'Refresh',
      icon: 'lu:refresh-cw',
      disabled: budget.busy.value,
      onSelect: () => void refreshBudget(budget, logger, true),
    },
  ]
  return { icon: 'lu:calendar', name: monthName(month), sub: spent == null ? undefined : spentLabel(spent.expenses), actions }
}
