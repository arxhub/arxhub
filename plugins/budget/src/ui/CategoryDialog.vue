<script setup lang="ts">
import { Button, Dialog, Input, Segmented } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import { BudgetExtension } from '../budget-extension'
import type { BudgetCategory, TransactionKind } from '../model'
import BudgetFormField from './BudgetFormField.vue'
import { errorMessage } from './budget-ui'

const props = defineProps<{
  open: boolean
  previous?: BudgetCategory
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  saved: []
}>()

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'md'
const name = ref('')
const kind = ref<TransactionKind>('expense')
const error = ref<string | null>(null)
const saving = ref(false)
const kindLocked = computed(() => !!props.previous && budget.data.value.transactions.some((entry) => entry.categoryId === props.previous?.id))
const kindOptions = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
]

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.previous?.name ?? ''
    kind.value = props.previous?.kind ?? 'expense'
    error.value = null
  },
)

async function save(): Promise<void> {
  error.value = null
  const normalizedName = name.value.trim()
  if (!normalizedName) {
    error.value = 'Enter a category name.'
    return
  }

  try {
    saving.value = true
    await budget.saveCategory({ name: normalizedName, kind: kind.value }, props.previous)
    emit('update:open', false)
    emit('saved')
  } catch (cause) {
    arxhub.logger.error('[budget] could not save category', cause)
    error.value = errorMessage(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :open="open"
    :title="previous ? 'Edit category' : 'New category'"
    size="sm"
    :close-on-escape="!saving"
    :close-on-interact-outside="!saving"
    @update:open="emit('update:open', $event)"
  >
    <form id="budget-category-form" class="form" @submit.prevent="save">
      <BudgetFormField label="Name" for-id="budget-category-name">
        <Input id="budget-category-name" v-model="name" autocomplete="off" placeholder="Groceries" :disabled="saving" />
      </BudgetFormField>
      <BudgetFormField label="Type" :hint="kindLocked ? 'Type cannot change after the category has transactions.' : undefined">
        <Segmented
          :model-value="kind"
          :options="kindOptions"
          aria-label="Category type"
          stretch
          :disabled="saving || kindLocked"
          @update:model-value="kind = $event as TransactionKind"
        />
      </BudgetFormField>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <Button :size="buttonSize" variant="secondary" :disabled="saving" @click="emit('update:open', false)">Cancel</Button>
      <Button :size="buttonSize" type="submit" form="budget-category-form" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save category' }}
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
