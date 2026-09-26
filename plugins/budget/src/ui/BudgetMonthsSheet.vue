<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { Row, SectionLabel } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { BudgetExtension } from '../budget-extension'
import { budgetMonths, monthName } from '../months'
import { localMonth } from './budget-ui'
import { budgetView, spentLabel } from './budget-view'

// The second tap on Budget: the periods, newest first under their year, each with what it cost. Choosing
// one is the whole job, so the sheet goes away with it.
const budget = useArxHub().extensions.get(BudgetExtension)
const view = budgetView(budget)
const navHost = useNavHost()
const current = localMonth()
const years = computed(() => budgetMonths(budget.data.value, current))

function detail(month: string, expenses: { currency: string; amount: number }[]): string {
  const spent = spentLabel(expenses)
  return month === current ? `${spent} · this month` : spent
}

function pick(month: string): void {
  view.showMonth(month)
  navHost?.navigated?.()
}
</script>

<template>
  <nav aria-label="Budget months" data-testid="budget-months">
    <template v-for="year in years" :key="year.year">
      <SectionLabel inset>{{ year.year }}</SectionLabel>
      <Row
        v-for="entry in year.months"
        :key="entry.month"
        as="button"
        type="button"
        icon="lu:calendar"
        :label="monthName(entry.month, false)"
        :detail="detail(entry.month, entry.expenses)"
        :selected="entry.month === view.month.value"
        :checked="entry.month === view.month.value"
        :aria-current="entry.month === view.month.value ? 'true' : undefined"
        :data-testid="`budget-month:${entry.month}`"
        @click="pick(entry.month)"
      />
    </template>
  </nav>
</template>

