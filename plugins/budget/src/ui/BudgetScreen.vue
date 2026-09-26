<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: ScrollArea is used in template
import { Button, PageLayout, ScrollArea, Segmented } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, useSlots } from 'vue'
import { BudgetExtension } from '../budget-extension'
import AccountsView from './AccountsView.vue'
import BudgetSummary from './BudgetSummary.vue'
import { type BudgetSection, isValidMonth } from './budget-ui'
import { budgetView, refreshBudget } from './budget-view'
import CategoriesView from './CategoriesView.vue'
import MonthPicker from './MonthPicker.vue'
import PlacesView from './PlacesView.vue'
import TransactionDialog from './TransactionDialog.vue'
import TransactionsView from './TransactionsView.vue'

// The budget itself, in both frames. What differs is where its commands live: a footer on the desktop
// (the slot), the band above the type row on the phone (`budgetBar`) — so the phone passes no footer.
// The month picker is the desktop's: on the phone the month is chosen from the type's second-tap Months
// sheet and named in the band, and a second control for it at the top of the screen is out of reach.
const props = defineProps<{ periodPicker?: boolean }>()
const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const view = budgetView(budget)
const slots = useSlots()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'md'
const section = view.section
const month = view.month
const data = computed(() => budget.data.value)
const monthValid = computed(() => isValidMonth(month.value))
const sections = [
  { value: 'overview', label: 'Overview' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'categories', label: 'Categories' },
  { value: 'places', label: 'Places' },
]

function retry(): Promise<void> {
  return refreshBudget(budget, arxhub.logger, false)
}
</script>

<template>
  <div class="budget-page" data-testid="budget-page">
    <PageLayout title="Budget" description="Track accounts, income, and expenses month by month.">
      <div v-if="budget.status.value === 'opening'" class="state" role="status">
        <span class="state-title">Opening your budget…</span>
        <span>Accounts and transactions will appear here in a moment.</span>
      </div>

      <div v-else-if="budget.status.value === 'failed'" class="state danger" role="alert">
        <span class="state-title">Budget could not be opened</span>
        <span>{{ budget.error.value || 'Try loading it again.' }}</span>
        <Button :size="buttonSize" variant="secondary" :disabled="budget.busy.value" @click="retry">Retry</Button>
      </div>

      <div v-else-if="budget.status.value === 'stopped'" class="state" role="status">
        <span class="state-title">Budget is unavailable</span>
      </div>

      <template v-else>
        <ScrollArea axis="x" class="section-nav" content-class="section-nav-content">
          <nav aria-label="Budget sections">
            <Segmented
              :model-value="section"
              :options="sections"
              aria-label="Budget sections"
              @update:model-value="view.section.value = $event as BudgetSection"
            />
          </nav>
        </ScrollArea>

        <div v-if="props.periodPicker && (section === 'overview' || section === 'transactions')" class="period">
          <MonthPicker v-model="view.month.value" />
          <p v-if="!monthValid" class="month-error" role="alert">Choose a month between 0001 and 9999.</p>
        </div>

        <BudgetSummary v-if="section === 'overview' && monthValid" :data="data" :month="month" />
        <TransactionsView
          v-else-if="section === 'transactions' && monthValid"
          :month="month"
          @add="view.addTransaction()"
          @edit="view.editTransaction($event)"
        />
        <AccountsView v-else-if="section === 'accounts'" />
        <CategoriesView v-else-if="section === 'categories'" />
        <PlacesView v-else-if="section === 'places'" />
      </template>

      <template v-if="budget.status.value === 'ready' && slots.footer" #footer>
        <slot name="footer" />
      </template>
    </PageLayout>

    <TransactionDialog v-model:open="view.transactionOpen.value" :previous="view.editing.value" />
  </div>
</template>

<style scoped>
.budget-page {
  height: 100%;
  min-height: 0;
}

.section-nav {
  width: 100%;
}

.section-nav :deep(.section-nav-content) {
  padding-bottom: 4px;
}

.period {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 24px;
}

.month-error {
  margin: 0;
  color: var(--danger-11);
  font-size: var(--font-size-sm);
}

.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.state.danger {
  border-color: var(--danger-6);
  background: var(--danger-2);
  color: var(--danger-11);
}

.state-title {
  color: var(--gray-12);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}
</style>
