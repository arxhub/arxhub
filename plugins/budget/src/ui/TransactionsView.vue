<script setup lang="ts">
import { Badge, Button, EmptyState, IconButton, modals, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { BudgetExtension } from '../budget-extension'
import { t } from '../i18n/messages'
import type { BudgetTransaction } from '../model'
import { accountCurrency, displayDay, errorMessage, money } from './budget-ui'

const props = defineProps<{ month: string }>()
const emit = defineEmits<{
  add: []
  edit: [transaction: BudgetTransaction]
}>()

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const iconSize = touch ? 'xl' : 'md'
const transactions = computed(() =>
  budget.data.value.transactions
    .filter((entry) => entry.date.startsWith(`${props.month}-`))
    .toSorted((left, right) => right.date.localeCompare(left.date)),
)
const canAdd = computed(() => budget.data.value.accounts.length > 0 && budget.data.value.categories.length > 0)

function accountName(id: string): string {
  return budget.data.value.accounts.find((entry) => entry.id === id)?.name ?? t('common.unknownAccount')
}

function categoryName(id: string): string {
  return budget.data.value.categories.find((entry) => entry.id === id)?.name ?? t('common.unknownCategory')
}

function placeName(id: string | null): string | null {
  if (!id) return null
  return budget.data.value.places.find((entry) => entry.id === id)?.name ?? t('common.unknownPlace')
}

function details(transaction: BudgetTransaction): string[] {
  const result: string[] = []
  const place = placeName(transaction.placeId)
  if (place) result.push(place)
  if (transaction.items.length) result.push(t('transactions.items', { count: transaction.items.length }))
  if (transaction.attachments.length) result.push(t('transactions.photos', { count: transaction.attachments.length }))
  if (transaction.fiscalReceipt) result.push(t('transactions.fiscalReceipt'))
  return result
}

function displayAmount(transaction: BudgetTransaction): string {
  const currency = accountCurrency(budget.data.value, transaction.accountId)
  return money(transaction.kind === 'expense' ? -transaction.amount : transaction.amount, currency)
}

function confirmRemove(transaction: BudgetTransaction): void {
  modals.openConfirmModal({
    title: t('transactions.removeQuestion'),
    children: t('transactions.removeBody', { amount: displayAmount(transaction), date: displayDay(transaction.date, { dateStyle: 'long' }) }),
    labels: { confirm: t('transactions.remove'), cancel: t('common.cancel') },
    confirmProps: { danger: true },
    onConfirm: () => void remove(transaction),
  })
}

async function remove(transaction: BudgetTransaction): Promise<void> {
  try {
    await budget.removeTransaction(transaction)
    toaster.create({ title: t('transactions.removed'), type: 'success' })
  } catch (cause) {
    arxhub.logger.error('[budget] could not remove transaction', cause)
    toaster.create({ title: t('transactions.removeFailed'), description: errorMessage(cause), type: 'error' })
  }
}
</script>

<template>
  <section class="section" :class="{ touch }" data-testid="budget-transactions" aria-labelledby="budget-transactions-heading">
    <div class="section-head">
      <div>
        <h2 id="budget-transactions-heading">{{ t('transactions.title') }}</h2>
        <p>{{ t('transactions.inMonth', { count: transactions.length }) }}</p>
      </div>
    </div>

    <EmptyState v-if="!canAdd" icon="lu:receipt" :text="t('transactions.needSetup')" />
    <EmptyState v-else-if="transactions.length === 0" icon="lu:receipt" :text="t('transactions.empty')">
      <template #actions><Button :size="buttonSize" @click="emit('add')">{{ t('transactions.addFirst') }}</Button></template>
    </EmptyState>
    <ul v-else class="list">
      <Row
        v-for="transaction in transactions"
        :key="transaction.id"
        class="transaction-row"
        as="li"
        plain
        wrap
        :data-transaction-id="transaction.id"
      >
        <div class="row-main">
          <div class="row-title-line">
            <span class="row-title">{{ transaction.note || categoryName(transaction.categoryId) }}</span>
            <span class="amount" :class="transaction.kind">{{ displayAmount(transaction) }}</span>
          </div>
          <span class="row-meta">
            {{ displayDay(transaction.date) }} · {{ categoryName(transaction.categoryId) }} · {{ accountName(transaction.accountId) }}
          </span>
          <span v-if="details(transaction).length" class="row-meta">{{ details(transaction).join(' · ') }}</span>
        </div>
        <Badge v-if="!touch" :variant="transaction.kind === 'income' ? 'success' : 'neutral'">
          {{ transaction.kind === 'income' ? t('common.income') : t('common.expense') }}
        </Badge>
        <div class="row-actions">
          <IconButton
            icon="lu:pencil"
            :size="iconSize"
            :tooltip="t('transactions.edit')"
            :aria-label="t('transactions.editNamed', { name: transaction.note || categoryName(transaction.categoryId) })"
            :disabled="budget.busy.value"
            @click="emit('edit', transaction)"
          />
          <IconButton
            icon="lu:trash-2"
            :size="iconSize"
            :tooltip="t('transactions.remove')"
            :aria-label="t('transactions.removeNamed', { name: transaction.note || categoryName(transaction.categoryId) })"
            :disabled="budget.busy.value"
            @click="confirmRemove(transaction)"
          />
        </div>
      </Row>
    </ul>
  </section>
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
.section-head p {
  margin: 0;
}

h2 {
  color: var(--gray-12);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.section-head p {
  margin-top: 4px;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.row-title {
  flex-grow: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.amount {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
}

.section.touch .row-title {
  min-width: min(100%, 160px);
}

.section.touch .transaction-row {
  flex-wrap: wrap;
}

.section.touch .row-main {
  flex-basis: 100%;
}

.section.touch .row-actions {
  margin-left: auto;
}

.amount.income {
  color: var(--success-11);
}

.amount.expense {
  color: var(--gray-12);
}

.row-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}
</style>
