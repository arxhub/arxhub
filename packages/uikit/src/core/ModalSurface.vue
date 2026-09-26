<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import BottomSheet from './BottomSheet.vue'
import Dialog from './Dialog.vue'

// A task raised over the page that is the same task in both frames — a code asked for again, a
// confirmation before erasing: a centred dialog on the desktop, a sheet with an inset body on the phone.
// The one dispatcher, so a plugin never writes the pair of wrappers (and the sheet's body padding) itself.
withDefaults(
  defineProps<{
    open: boolean
    title: string
    size?: 'sm' | 'md' | 'lg'
    // On the phone the task takes the whole screen — a keypad or a phrase wants all of it.
    full?: boolean
    testId?: string
  }>(),
  { size: 'md', full: false },
)
const emit = defineEmits<{ close: [] }>()

const touch = useShellFrame() === 'mobile'
</script>

<template>
  <BottomSheet
    v-if="touch"
    :open="open"
    :title="title"
    :variant="full ? 'full' : 'auto'"
    inset
    :footer-inset="!!$slots.footer"
    @close="emit('close')"
  >
    <div class="modal-body" :data-testid="testId"><slot /></div>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </BottomSheet>
  <Dialog v-else :open="open" :title="title" :size="size" centered @update:open="$event || emit('close')">
    <div class="modal-body" :data-testid="testId"><slot /></div>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </Dialog>
</template>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
