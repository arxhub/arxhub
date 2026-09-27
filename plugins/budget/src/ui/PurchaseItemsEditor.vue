<script setup lang="ts">
import { Field, IconButton, Input } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { t } from '../i18n/messages'
import { money } from './budget-ui'
import { itemsSubtotal, itemTotal, type PurchaseItemDraft } from './purchase-draft'

const props = defineProps<{
  modelValue: PurchaseItemDraft[]
  currency: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [items: PurchaseItemDraft[]] }>()
const touch = useShellFrame() === 'mobile'
const iconSize = touch ? 'xl' : 'md'
const subtotal = computed(() => itemsSubtotal(props.modelValue, props.currency))

function add(): void {
  emit('update:modelValue', [...props.modelValue, { id: crypto.randomUUID(), name: '', quantity: '1', unitPrice: '' }])
}

function update(index: number, patch: Partial<PurchaseItemDraft>): void {
  emit(
    'update:modelValue',
    props.modelValue.map((item, itemIndex) => (index === itemIndex ? { ...item, ...patch } : item)),
  )
}

function remove(index: number): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, itemIndex) => itemIndex !== index),
  )
}
</script>

<template>
  <section class="items" aria-labelledby="purchase-items-heading">
    <div class="section-head">
      <div>
        <h3 id="purchase-items-heading">{{ t('items.title') }}</h3>
        <p>{{ t('items.description') }}</p>
      </div>
      <IconButton icon="lu:plus" :size="iconSize" :tooltip="t('items.add')" :disabled="disabled" @click="add" />
    </div>

    <div v-for="(item, index) in modelValue" :key="item.id" class="item" :aria-label="t('items.item', { index: index + 1 })">
      <div class="item-head">
        <strong>{{ t('items.item', { index: index + 1 }) }}</strong>
        <IconButton
          icon="lu:trash-2"
          :size="iconSize"
          :tooltip="t('items.remove')"
          :aria-label="t('items.removeNamed', { index: index + 1 })"
          :disabled="disabled"
          @click="remove(index)"
        />
      </div>
      <Field :label="t('common.name')" :for="`budget-item-${index}-name`">
        <Input
          :id="`budget-item-${index}-name`"
          :model-value="item.name"
          autocomplete="off"
          :placeholder="t('items.namePlaceholder')"
          :disabled="disabled"
          @update:model-value="update(index, { name: $event ?? '' })"
        />
      </Field>
      <div class="item-numbers">
        <Field :label="t('items.quantity')" :for="`budget-item-${index}-quantity`">
          <Input
            :id="`budget-item-${index}-quantity`"
            :model-value="item.quantity"
            inputmode="decimal"
            autocomplete="off"
            placeholder="1"
            :disabled="disabled"
            @update:model-value="update(index, { quantity: $event ?? '' })"
          />
        </Field>
        <Field :label="t('items.unitPrice')" :for="`budget-item-${index}-price`">
          <Input
            :id="`budget-item-${index}-price`"
            :model-value="item.unitPrice"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            :disabled="disabled"
            @update:model-value="update(index, { unitPrice: $event ?? '' })"
          />
        </Field>
      </div>
      <p class="line-total">
        {{ t('items.lineTotal') }}
        <strong>{{ itemTotal(item, currency) === null ? t('items.checkLine') : money(itemTotal(item, currency) ?? 0, currency) }}</strong>
      </p>
    </div>

    <p v-if="modelValue.length" class="subtotal">
      {{ t('items.subtotal') }}
      <strong>{{ subtotal === null ? t('items.checkItems') : money(subtotal, currency) }}</strong>
    </p>
  </section>
</template>

<style scoped>
.items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-head,
.item-head,
.line-total,
.subtotal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h3,
.section-head p,
.line-total,
.subtotal {
  margin: 0;
}

h3 {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.section-head p,
.line-total,
.subtotal {
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
}

.item-head strong,
.line-total strong,
.subtotal strong {
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
}

.item-numbers {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
</style>
