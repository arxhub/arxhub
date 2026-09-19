<script setup lang="ts">
import { Button, IconButton, modals, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { BudgetExtension } from '../budget-extension'
import { accountBalance, type BudgetAccount } from '../model'
import { formatAmount } from '../money'
import AccountDialog from './AccountDialog.vue'
import { errorMessage } from './budget-ui'

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const iconSize = touch ? 'xl' : 'md'
const dialogOpen = ref(false)
const editing = ref<BudgetAccount | undefined>()
const accounts = computed(() => budget.data.value.accounts)

function create(): void {
  editing.value = undefined
  dialogOpen.value = true
}

function edit(account: BudgetAccount): void {
  editing.value = account
  dialogOpen.value = true
}

function used(account: BudgetAccount): boolean {
  return budget.data.value.transactions.some((entry) => entry.accountId === account.id)
}

function confirmRemove(account: BudgetAccount): void {
  modals.openConfirmModal({
    title: 'Remove account?',
    children: `Remove “${account.name}”? This cannot be undone.`,
    labels: { confirm: 'Remove account', cancel: 'Cancel' },
    confirmProps: { danger: true },
    onConfirm: () => void remove(account),
  })
}

async function remove(account: BudgetAccount): Promise<void> {
  try {
    await budget.removeAccount(account)
    toaster.create({ title: 'Account removed', description: account.name, type: 'success' })
  } catch (cause) {
    arxhub.logger.error('[budget] could not remove account', cause)
    toaster.create({ title: 'Could not remove account', description: errorMessage(cause), type: 'error' })
  }
}
</script>

<template>
  <section class="section" :class="{ touch }" aria-labelledby="budget-accounts-heading">
    <div class="section-head">
      <div>
        <h2 id="budget-accounts-heading">Accounts</h2>
        <p>Track each place where you keep money. Balances include every recorded transaction.</p>
      </div>
      <Button :size="buttonSize" variant="secondary" :disabled="budget.busy.value" @click="create">New account</Button>
    </div>

    <div v-if="accounts.length === 0" class="empty">
      <span>No accounts yet.</span>
      <Button :size="buttonSize" @click="create">Create your first account</Button>
    </div>
    <ul v-else class="list">
      <Row v-for="account in accounts" :key="account.id" as="li" plain wrap :data-account-id="account.id">
        <div class="row-main">
          <span class="row-title">{{ account.name }}</span>
          <span class="row-meta">{{ account.currency }} · Balance {{ formatAmount(accountBalance(budget.data.value, account.id), account.currency) }}</span>
        </div>
        <div class="row-actions">
          <IconButton
            icon="lu:pencil"
            :size="iconSize"
            tooltip="Edit account"
            :aria-label="`Edit ${account.name}`"
            :disabled="budget.busy.value"
            @click="edit(account)"
          />
          <IconButton
            icon="lu:trash-2"
            :size="iconSize"
            tooltip="Remove account"
            :aria-label="`Remove ${account.name}`"
            :disabled="budget.busy.value || used(account)"
            @click="confirmRemove(account)"
          />
        </div>
      </Row>
    </ul>
    <p v-if="accounts.some(used)" class="footnote">Accounts with transactions cannot be removed.</p>
  </section>

  <AccountDialog v-model:open="dialogOpen" :previous="editing" />
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

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-title {
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
}

.row-meta {
  color: var(--gray-11);
  font-size: var(--font-size-xs);
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
