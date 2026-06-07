<script setup lang="ts">
import { type Component, computed } from 'vue'
import Dialog from '../Dialog.vue'
import ConfirmModalBody from './ConfirmModalBody.vue'
import { type ConfirmLabels, modals, openModals } from './modals'

const props = withDefaults(
  defineProps<{
    // Registry of named context-modal body components, opened via modals.openContextModal({ modal }).
    modals?: Record<string, Component>
    labels?: ConfirmLabels
  }>(),
  { labels: () => ({ confirm: 'Confirm', cancel: 'Cancel' }) },
)

// Render the top of the stack (mirrors @mantine/modals' single rendered Modal).
const current = computed(() => openModals.value[openModals.value.length - 1] ?? null)

const confirmModal = computed(() => (current.value?.type === 'confirm' ? current.value : null))
const contextModal = computed(() => (current.value?.type === 'context' ? current.value : null))
const contentModal = computed(() => (current.value?.type === 'content' ? current.value : null))

const contextComponent = computed(() => (contextModal.value ? props.modals?.[contextModal.value.ctx] : undefined))

function onOpenChange(open: boolean) {
  if (!open && current.value) modals.close(current.value.id)
}
</script>

<template>
  <Dialog
    v-if="current"
    :open="true"
    :title="current.props.title"
    :centered="current.props.centered"
    :size="current.props.size"
    :close-on-interact-outside="current.props.closeOnClickOutside"
    :close-on-escape="current.props.closeOnEscape"
    @update:open="onOpenChange"
  >
    <ConfirmModalBody
      v-if="confirmModal"
      :id="confirmModal.id"
      :body="confirmModal.props.children ?? confirmModal.props.content"
      :body-props="confirmModal.props.contentProps"
      :labels="confirmModal.props.labels ?? labels"
      :confirm-props="confirmModal.props.confirmProps"
      :cancel-props="confirmModal.props.cancelProps"
      :close-on-confirm="confirmModal.props.closeOnConfirm"
      :close-on-cancel="confirmModal.props.closeOnCancel"
      :on-confirm="confirmModal.props.onConfirm"
      :on-cancel="confirmModal.props.onCancel"
    />

    <component
      :is="contextComponent"
      v-else-if="contextModal && contextComponent"
      :modal-id="contextModal.id"
      :inner-props="contextModal.props.innerProps"
    />

    <template v-else-if="contentModal && typeof contentModal.props.content === 'string'">
      {{ contentModal.props.content }}
    </template>
    <component
      :is="contentModal.props.content"
      v-else-if="contentModal && contentModal.props.content"
      v-bind="contentModal.props.contentProps"
    />
  </Dialog>
</template>
