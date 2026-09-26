<script setup lang="ts">
import type { FormattingAction } from './formatting-action'
import IconButton from './IconButton.vue'
import ScrollArea from './ScrollArea.vue'

withDefaults(
  defineProps<{
    actions: FormattingAction[]
    variant?: 'strip' | 'bubble'
  }>(),
  { variant: 'strip' },
)
</script>

<template>
  <ScrollArea axis="x" class="formatting-area" @mousedown.prevent>
    <div class="formatting" role="toolbar" aria-label="Formatting">
      <IconButton
        v-for="action in actions"
        :key="action.id"
        :size="variant === 'strip' ? 'lg' : 'sm'"
        :icon="action.icon"
        :tooltip="action.label"
        :active="action.active"
        :disabled="action.disabled"
        @click="action.run()"
      />
    </div>
  </ScrollArea>
</template>

<style scoped>
.formatting {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
