<script setup lang="ts">
import { Card, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { accountBalance, type BudgetData, categoryTotals, monthlyTotals } from '../model'
import { formatAmount } from '../money'

const props = defineProps<{
  data: BudgetData
  month: string
}>()
const touch = useShellFrame() === 'mobile'

const totals = computed(() => monthlyTotals(props.data, props.month))
const spending = computed(() =>
  categoryTotals(props.data, props.month)
    .filter((total) => props.data.categories.find((category) => category.id === total.categoryId)?.kind === 'expense')
    .toSorted((left, right) => right.amount - left.amount),
)

function categoryName(id: string): string {
  return props.data.categories.find((entry) => entry.id === id)?.name ?? 'Unknown category'
}
</script>

<template>
  <div class="summary" :class="{ touch }" data-testid="budget-summary">
    <section class="section" aria-labelledby="budget-monthly-heading">
      <h2 id="budget-monthly-heading">This month</h2>
      <div v-if="totals.length" class="summary-grid">
        <Card v-for="total in totals" :key="total.currency" :title="total.currency" icon="lu:chart-no-axes-column-increasing">
          <dl class="facts">
            <div>
              <dt>Income</dt>
              <dd class="income">{{ formatAmount(total.income, total.currency) }}</dd>
            </div>
            <div>
              <dt>Expenses</dt>
              <dd>{{ formatAmount(total.expense, total.currency) }}</dd>
            </div>
            <div>
              <dt>Net</dt>
              <dd :class="{ income: total.balance > 0, expense: total.balance < 0 }">{{ formatAmount(total.balance, total.currency) }}</dd>
            </div>
          </dl>
        </Card>
      </div>
      <p v-else class="empty-copy">No activity in this month.</p>
    </section>

    <section class="section" aria-labelledby="budget-balances-heading">
      <h2 id="budget-balances-heading">Account balances</h2>
      <p v-if="data.accounts.length === 0" class="empty-copy">Create an account to start tracking money.</p>
      <ul v-else class="list">
        <Row v-for="account in data.accounts" :key="account.id" as="li" plain>
          <span class="row-title">{{ account.name }}</span>
          <span class="money">{{ formatAmount(accountBalance(data, account.id), account.currency) }}</span>
        </Row>
      </ul>
    </section>

    <section class="section" aria-labelledby="budget-spending-heading">
      <h2 id="budget-spending-heading">Spending by category</h2>
      <p v-if="spending.length === 0" class="empty-copy">No expenses in this month.</p>
      <ul v-else class="list">
        <Row v-for="entry in spending" :key="`${entry.categoryId}:${entry.currency}`" as="li" plain>
          <span class="row-title">{{ categoryName(entry.categoryId) }}</span>
          <span class="money">{{ formatAmount(entry.amount, entry.currency) }}</span>
        </Row>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  align-items: start;
  gap: 24px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.section:first-child {
  grid-column: 1 / -1;
}

h2,
.empty-copy,
dl,
dd {
  margin: 0;
}

h2 {
  color: var(--gray-12);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.facts div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.summary.touch .facts {
  grid-template-columns: 1fr;
}

.summary.touch .facts div {
  flex-direction: row;
  justify-content: space-between;
}

dt,
.empty-copy {
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

dd,
.money {
  color: var(--gray-12);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
}

.income {
  color: var(--success-11);
}

.expense {
  color: var(--danger-11);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
