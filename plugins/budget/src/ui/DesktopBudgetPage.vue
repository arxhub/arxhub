<script setup lang="ts">
import { Button } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { BudgetExtension } from '../budget-extension'
import BudgetScreen from './BudgetScreen.vue'
import { budgetView, refreshBudget } from './budget-view'

// The desktop has no band above a type row, so the budget's two commands sit in the page's own footer.
const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const view = budgetView(budget)
const canAddTransaction = computed(() => budget.data.value.accounts.length > 0 && budget.data.value.categories.length > 0)
</script>

<template>
  <BudgetScreen period-picker>
    <template #footer>
      <Button variant="secondary" :disabled="budget.busy.value" @click="refreshBudget(budget, arxhub.logger, true)">Refresh</Button>
      <Button class="add-transaction" :disabled="budget.busy.value || !canAddTransaction" @click="view.addTransaction()">New purchase</Button>
    </template>
  </BudgetScreen>
</template>

<style scoped>
.add-transaction {
  flex: none;
}
</style>
