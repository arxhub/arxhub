<script setup lang="ts">
import type { FormattingAction } from './formatting-action'
import IconButton from './IconButton.vue'

withDefaults(
  defineProps<{
    actions: FormattingAction[]
    variant?: 'strip' | 'bubble'
  }>(),
  { variant: 'strip' },
)
</script>

<template>
  <div class="formatting" role="toolbar" aria-label="Formatting" @mousedown.prevent>
    <IconButton
      v-for="action in actions"
      :key="action.id"
      :size="variant === 'strip' ? 'lg' : 'sm'"
      :icon="action.icon"
      :tooltip="action.label"
      :active="action.active"
      @click="action.run()"
    />
  </div>
</template>

<style scoped>
.formatting {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}
</style>
