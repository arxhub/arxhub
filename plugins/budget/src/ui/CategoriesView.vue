<script setup lang="ts">
import { Badge, Button, EmptyState, IconButton, modals, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { BudgetExtension } from '../budget-extension'
import { t } from '../i18n/messages'
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
    title: t('categories.removeQuestion'),
    children: t('common.removeTitle', { name: category.name }),
    labels: { confirm: t('categories.remove'), cancel: t('common.cancel') },
    confirmProps: { danger: true },
    onConfirm: () => void remove(category),
  })
}

async function remove(category: BudgetCategory): Promise<void> {
  try {
    await budget.removeCategory(category)
    toaster.create({ title: t('categories.removed'), description: category.name, type: 'success' })
  } catch (cause) {
    arxhub.logger.error('[budget] could not remove category', cause)
    toaster.create({ title: t('categories.removeFailed'), description: errorMessage(cause), type: 'error' })
  }
}
</script>

<template>
  <section class="section" :class="{ touch }" aria-labelledby="budget-categories-heading">
    <div class="section-head">
      <div>
        <h2 id="budget-categories-heading">{{ t('categories.title') }}</h2>
        <p>{{ t('categories.description') }}</p>
      </div>
      <Button :size="buttonSize" variant="secondary" :disabled="budget.busy.value" @click="create">{{ t('categories.new') }}</Button>
    </div>

    <EmptyState v-if="categories.length === 0" icon="lu:tags" :text="t('categories.empty')">
      <template #actions><Button :size="buttonSize" @click="create">{{ t('categories.createFirst') }}</Button></template>
    </EmptyState>
    <ul v-else class="list">
      <Row v-for="category in categories" :key="category.id" as="li" plain :data-category-id="category.id">
        <span class="row-title">{{ category.name }}</span>
        <Badge :variant="category.kind === 'income' ? 'success' : 'neutral'">{{ category.kind === 'income' ? t('common.income') : t('common.expense') }}</Badge>
        <div class="row-actions">
          <IconButton
            icon="lu:pencil"
            :size="iconSize"
            :tooltip="t('categories.edit')"
            :aria-label="t('categories.editNamed', { name: category.name })"
            :disabled="budget.busy.value"
            @click="edit(category)"
          />
          <IconButton
            icon="lu:trash-2"
            :size="iconSize"
            :tooltip="t('categories.remove')"
            :aria-label="t('categories.removeNamed', { name: category.name })"
            :disabled="budget.busy.value || used(category)"
            @click="confirmRemove(category)"
          />
        </div>
      </Row>
    </ul>
    <p v-if="categories.some(used)" class="footnote">{{ t('categories.inUse') }}</p>
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
</style>
