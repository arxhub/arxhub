<script setup lang="ts">
import Button from '../Button.vue'
import { type ConfirmButtonProps, type ConfirmLabels, type ModalContent, modals } from './modals'

const props = defineProps<{
  id: string
  body?: ModalContent
  bodyProps?: Record<string, unknown>
  labels: ConfirmLabels
  confirmProps?: ConfirmButtonProps
  cancelProps?: ConfirmButtonProps
  closeOnConfirm?: boolean
  closeOnCancel?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}>()

function handleCancel() {
  props.onCancel?.()
  if (props.closeOnCancel !== false) modals.close(props.id)
}

function handleConfirm() {
  props.onConfirm?.()
  if (props.closeOnConfirm !== false) modals.close(props.id)
}
</script>

<template>
  <div class="confirm-modal">
    <div v-if="body" class="confirm-body">
      <template v-if="typeof body === 'string'">{{ body }}</template>
      <component :is="body" v-else v-bind="bodyProps" />
    </div>

    <div class="confirm-actions">
      <Button
        :variant="cancelProps?.variant ?? 'secondary'"
        size="sm"
        :disabled="cancelProps?.disabled"
        @click="handleCancel"
      >
        {{ cancelProps?.label ?? labels.cancel }}
      </Button>
      <Button
        :variant="confirmProps?.danger ? 'danger' : (confirmProps?.variant ?? 'primary')"
        size="sm"
        :disabled="confirmProps?.disabled"
        @click="handleConfirm"
      >
        {{ confirmProps?.label ?? labels.confirm }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.confirm-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.confirm-body {
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
