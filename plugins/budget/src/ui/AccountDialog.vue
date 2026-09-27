<script setup lang="ts">
import { Button, Dialog, Field, Input } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import { BudgetExtension } from '../budget-extension'
import { t } from '../i18n/messages'
import type { BudgetAccount } from '../model'
import { parseAmount } from '../money'
import { amountInput, errorMessage } from './budget-ui'

const props = defineProps<{
  open: boolean
  previous?: BudgetAccount
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  saved: []
}>()

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'md'
const name = ref('')
const currency = ref('RUB')
const openingBalance = ref('0.00')
const error = ref<string | null>(null)
const saving = ref(false)
const currencyLocked = computed(
  () => !!props.previous && budget.data.value.transactions.some((entry) => entry.accountId === props.previous?.id),
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.previous?.name ?? ''
    currency.value = props.previous?.currency ?? 'RUB'
    openingBalance.value = props.previous ? amountInput(props.previous.openingBalance, props.previous.currency) : '0.00'
    error.value = null
  },
)

async function save(): Promise<void> {
  error.value = null
  const normalizedName = name.value.trim()
  const normalizedCurrency = currency.value.trim().toUpperCase()
  if (!normalizedName) {
    error.value = t('accounts.nameRequired')
    return
  }

  try {
    const balance = parseAmount(openingBalance.value, normalizedCurrency)
    saving.value = true
    await budget.saveAccount({ name: normalizedName, currency: normalizedCurrency, openingBalance: balance }, props.previous)
    emit('update:open', false)
    emit('saved')
  } catch (cause) {
    arxhub.logger.error('[budget] could not save account', cause)
    error.value = errorMessage(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :open="open"
    :title="previous ? t('accounts.dialogEdit') : t('accounts.dialogNew')"
    size="sm"
    :close-on-escape="!saving"
    :close-on-interact-outside="!saving"
    @update:open="emit('update:open', $event)"
  >
    <form id="budget-account-form" class="form" @submit.prevent="save">
      <Field :label="t('common.name')" for="budget-account-name">
        <Input id="budget-account-name" v-model="name" autocomplete="off" :placeholder="t('accounts.namePlaceholder')" :disabled="saving" />
      </Field>
      <Field
        :label="t('accounts.currency')"
        for="budget-account-currency"
        :hint="currencyLocked ? t('accounts.currencyLocked') : t('accounts.currencyHint')"
      >
        <!-- design-ignore: the placeholder is an ISO 4217 code, the same in every language -->
        <Input
          id="budget-account-currency"
          v-model="currency"
          autocomplete="off"
          maxlength="3"
          placeholder="RUB"
          :disabled="saving || currencyLocked"
          @update:model-value="currency = ($event ?? '').toUpperCase()"
        />
      </Field>
      <Field :label="t('accounts.openingBalance')" for="budget-account-opening" :hint="t('accounts.openingBalanceHint')">
        <Input
          id="budget-account-opening"
          v-model="openingBalance"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0.00"
          :disabled="saving"
        />
      </Field>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <Button :size="buttonSize" variant="secondary" :disabled="saving" @click="emit('update:open', false)">{{ t('common.cancel') }}</Button>
      <Button :size="buttonSize" type="submit" form="budget-account-form" :disabled="saving">
        {{ saving ? t('common.saving') : t('accounts.save') }}
      </Button>
    </template>
  </Dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-error {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--danger-6);
  border-radius: var(--radius-sm);
  background: var(--danger-2);
  color: var(--danger-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}
</style>
