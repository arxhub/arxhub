<script setup lang="ts">
import { IconButton, Input } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { canMoveMonth, moveMonth } from './budget-ui'

const month = defineModel<string>({ required: true })
const buttonSize = useShellFrame() === 'mobile' ? 'xl' : 'md'
</script>

<template>
  <div class="month-picker" aria-label="Month">
    <IconButton
      icon="lu:chevron-left"
      :size="buttonSize"
      aria-label="Previous month"
      tooltip="Previous month"
      :disabled="!canMoveMonth(month, -1)"
      @click="month = moveMonth(month, -1)"
    />
    <Input v-model="month" class="month-input" type="month" aria-label="Month" />
    <IconButton
      icon="lu:chevron-right"
      :size="buttonSize"
      aria-label="Next month"
      tooltip="Next month"
      :disabled="!canMoveMonth(month, 1)"
      @click="month = moveMonth(month, 1)"
    />
  </div>
</template>

<style scoped>
.month-picker {
  display: flex;
  align-items: center;
  gap: 4px;
  width: min(100%, 280px);
}

.month-input {
  flex: 1;
  width: auto;
  min-width: 0;
}
</style>
