<script setup lang="ts">
import { Badge, Button, IconButton, modals, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { BudgetExtension } from '../budget-extension'
import type { BudgetCategory } from '../model'
import { errorMessage } from './budget-ui'
import CategoryDialog from './CategoryDialog.vue'

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const iconSize = touch ? 'xl' : 'md'
const dialogOpen = ref(false)
const editing = ref<BudgetCategory | undefined>()
const categories = computed(() => budget.data.value.categories)

function create(): void {
  editing.value = undefined
  dialogOpen.value = true
}

function edit(category: BudgetCategory): void {
  editing.value = category
  dialogOpen.value = true
}

function used(category: BudgetCategory): boolean {
  return budget.data.value.transactions.some((entry) => entry.categoryId === category.id)
}

function confirmRemove(category: BudgetCategory): void {
  modals.openConfirmModal({
    title: 'Remove category?',
    children: `Remove “${category.name}”? This cannot be undone.`,
    labels: { confirm: 'Remove category', cancel: 'Cancel' },
    confirmProps: { danger: true },
    onConfirm: () => void remove(category),
  })
}

async function remove(category: BudgetCategory): Promise<void> {
  try {
    await budget.removeCategory(category)
    toaster.create({ title: 'Category removed', description: category.name, type: 'success' })
  } catch (cause) {
    arxhub.logger.error('[budget] could not remove category', cause)
    toaster.create({ title: 'Could not remove category', description: errorMessage(cause), type: 'error' })
  }
}
</script>

<template>
  <section class="section" :class="{ touch }" aria-labelledby="budget-categories-heading">
    <div class="section-head">
      <div>
        <h2 id="budget-categories-heading">Categories</h2>
        <p>Keep income and spending separate so monthly totals stay clear.</p>
      </div>
      <Button :size="buttonSize" variant="secondary" :disabled="budget.busy.value" @click="create">New category</Button>
    </div>

    <div v-if="categories.length === 0" class="empty">
      <span>No categories yet.</span>
      <Button :size="buttonSize" @click="create">Create your first category</Button>
    </div>
    <ul v-else class="list">
      <Row v-for="category in categories" :key="category.id" as="li" plain :data-category-id="category.id">
        <span class="row-title">{{ category.name }}</span>
        <Badge :variant="category.kind === 'income' ? 'success' : 'neutral'">{{ category.kind === 'income' ? 'Income' : 'Expense' }}</Badge>
        <div class="row-actions">
          <IconButton
            icon="lu:pencil"
            :size="iconSize"
            tooltip="Edit category"
            :aria-label="`Edit ${category.name}`"
            :disabled="budget.busy.value"
            @click="edit(category)"
          />
          <IconButton
            icon="lu:trash-2"
            :size="iconSize"
            tooltip="Remove category"
            :aria-label="`Remove ${category.name}`"
            :disabled="budget.busy.value || used(category)"
            @click="confirmRemove(category)"
          />
        </div>
      </Row>
    </ul>
    <p v-if="categories.some(used)" class="footnote">Categories with transactions cannot be removed or change type.</p>
  </section>

  <CategoryDialog v-model:open="dialogOpen" :previous="editing" />
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section.touch .section-head {
  flex-direction: column;
}

h2,
.section-head p,
.footnote {
  margin: 0;
}

h2 {
  color: var(--gray-12);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.section-head p,
.footnote {
  margin-top: 4px;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
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
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.empty {
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
</style>
