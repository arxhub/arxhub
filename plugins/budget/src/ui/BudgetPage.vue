<script setup lang="ts">
import { Button, PageLayout, Segmented } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { BudgetExtension } from '../budget-extension'
import type { BudgetTransaction } from '../model'
import AccountsView from './AccountsView.vue'
import BudgetSummary from './BudgetSummary.vue'
import { type BudgetSection, errorMessage, isValidMonth, localMonth } from './budget-ui'
import CategoriesView from './CategoriesView.vue'
import MonthPicker from './MonthPicker.vue'
import PlacesView from './PlacesView.vue'
import TransactionDialog from './TransactionDialog.vue'
import TransactionsView from './TransactionsView.vue'

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const section = ref<BudgetSection>('overview')
const month = ref(localMonth())
const transactionOpen = ref(false)
const editingTransaction = ref<BudgetTransaction | undefined>()
const data = computed(() => budget.data.value)
const canAddTransaction = computed(() => data.value.accounts.length > 0 && data.value.categories.length > 0)
const monthValid = computed(() => isValidMonth(month.value))
const sections = [
  { value: 'overview', label: 'Overview' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'categories', label: 'Categories' },
  { value: 'places', label: 'Places' },
]

function addTransaction(): void {
  editingTransaction.value = undefined
  transactionOpen.value = true
}

function editTransaction(transaction: BudgetTransaction): void {
  editingTransaction.value = transaction
  transactionOpen.value = true
}

async function retry(): Promise<void> {
  try {
    await budget.refresh()
  } catch (cause) {
    arxhub.logger.error('[budget] could not refresh budget data', cause)
    toaster.create({ title: 'Could not load budget', description: errorMessage(cause), type: 'error' })
  }
}

async function refresh(): Promise<void> {
  try {
    await budget.refresh()
    toaster.create({ title: 'Budget refreshed', type: 'success' })
  } catch (cause) {
    arxhub.logger.error('[budget] could not refresh budget data', cause)
    toaster.create({ title: 'Could not refresh budget', description: errorMessage(cause), type: 'error' })
  }
}
</script>

<template>
  <div class="budget-page" :class="{ touch }" data-testid="budget-page">
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
        <nav class="section-nav" aria-label="Budget sections">
          <Segmented
            :model-value="section"
            :options="sections"
            aria-label="Budget sections"
            @update:model-value="section = $event as BudgetSection"
          />
        </nav>

        <div v-if="section === 'overview' || section === 'transactions'" class="period">
          <MonthPicker v-model="month" />
          <p v-if="!monthValid" class="month-error" role="alert">Choose a month between 0001 and 9999.</p>
        </div>

        <BudgetSummary v-if="section === 'overview' && monthValid" :data="data" :month="month" />
        <TransactionsView
          v-else-if="section === 'transactions' && monthValid"
          :month="month"
          @add="addTransaction"
          @edit="editTransaction"
        />
        <AccountsView v-else-if="section === 'accounts'" />
        <CategoriesView v-else-if="section === 'categories'" />
        <PlacesView v-else-if="section === 'places'" />
      </template>

      <template v-if="budget.status.value === 'ready'" #footer>
        <Button :size="buttonSize" variant="secondary" :disabled="budget.busy.value" @click="refresh">Refresh</Button>
        <Button class="add-transaction" :size="buttonSize" :disabled="budget.busy.value || !canAddTransaction" @click="addTransaction">
          New purchase
        </Button>
      </template>
    </PageLayout>

    <TransactionDialog v-model:open="transactionOpen" :previous="editingTransaction" />
  </div>
</template>

<style scoped>
.budget-page {
  height: 100%;
  min-height: 0;
}

.section-nav {
  width: 100%;
  overflow-x: auto;
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

.add-transaction {
  flex: none;
}

.budget-page.touch .add-transaction {
  flex: 1;
}
</style>
