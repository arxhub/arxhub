<script setup lang="ts">
import { type Component, computed } from 'vue'
import { useBackStack } from '../../hooks/useBackStack'
import Dialog from '../Dialog.vue'
import ConfirmModalBody from './ConfirmModalBody.vue'
import { type ConfirmLabels, type ModalState, modals, openModals } from './modals'

const props = withDefaults(
  defineProps<{
    // Registry of named context-modal body components, opened via modals.openContextModal({ modal }).
    modals?: Record<string, Component>
    labels?: ConfirmLabels
  }>(),
  { labels: () => ({ confirm: 'Confirm', cancel: 'Cancel' }) },
)

// Every surface stays mounted: a confirm raised from inside a multi-step sheet sits over it, and
// unmounting the sheet under it would throw away the steps already taken. Of the dialogs only the top
// one renders (mirrors @mantine/modals' single rendered Modal).
type DialogState = Exclude<ModalState, { type: 'surface' }>
const surfaces = computed(() => openModals.value.flatMap((m) => (m.type === 'surface' ? [m] : [])))
const dialog = computed(() => openModals.value.findLast((m): m is DialogState => m.type !== 'surface') ?? null)

const confirmModal = computed(() => (dialog.value?.type === 'confirm' ? dialog.value : null))
const contextModal = computed(() => (dialog.value?.type === 'context' ? dialog.value : null))
const contentModal = computed(() => (dialog.value?.type === 'content' ? dialog.value : null))

const contextComponent = computed(() => (contextModal.value ? props.modals?.[contextModal.value.ctx] : undefined))

function onOpenChange(open: boolean) {
  if (!open && dialog.value) modals.close(dialog.value.id)
}

// A dialog is a layer like any other, so back dismisses it. Dismissal is a cancel, never a confirm:
// closing without choosing must not perform an irreversible action. A surface answers back itself (a
// BottomSheet does), so claiming it here too would close two layers for one press.
useBackStack(
  () => dialog.value != null,
  () => {
    if (dialog.value) modals.close(dialog.value.id)
  },
)
</script>

<template>
  <component :is="surface.props.component" v-for="surface in surfaces" :key="surface.id" v-bind="surface.props.props" :modal-id="surface.id" />
  <Dialog
    v-if="dialog"
    :open="true"
    :title="dialog.props.title"
    :centered="dialog.props.centered"
    :size="dialog.props.size"
    :close-on-interact-outside="dialog.props.closeOnClickOutside"
    :close-on-escape="dialog.props.closeOnEscape"
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
