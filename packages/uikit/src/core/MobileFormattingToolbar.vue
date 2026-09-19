<script setup lang="ts">
import { actionMenu } from './action-menu/action-menu'
import type { FormattingAction } from './formatting-action'
import IconButton from './IconButton.vue'

const props = withDefaults(
  defineProps<{
    actions: FormattingAction[]
    variant?: 'strip' | 'bubble'
  }>(),
  { variant: 'strip' },
)
function more(): void {
  actionMenu.open(
    props.actions
      .filter((action) => !action.primary)
      .map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        onSelect: action.run,
      })),
    { title: 'Formatting' },
  )
}
</script>

<template>
  <div class="formatting" role="toolbar" aria-label="Formatting" @mousedown.prevent>
    <IconButton v-for="action in actions.filter((item) => item.primary)" :key="action.id" size="xl" :icon="action.icon" :tooltip="action.label" :active="action.active" @click="action.run()" />
    <IconButton size="xl" icon="lu:ellipsis" tooltip="More formatting" @click="more" />
  </div>
</template>

<style scoped>
.formatting {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
