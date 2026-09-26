<script setup lang="ts">
import { Icon, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'

defineProps<{ label: string }>()
defineEmits<(e: 'expand') => void>()

const touch = useShellFrame() === 'mobile'
</script>

<template>
  <!-- The hairlines sit on a wrapper so the row keeps its own geometry (DS-1). Dashed, not solid: a fold is
       content not drawn, not a boundary between regions. -->
  <div class="diff-fold" :class="{ touch }">
    <Row as="button" type="button" data-diff-fold @click="$emit('expand')">
      <span class="label"><Icon name="lu:chevrons-up-down" :size="touch ? 16 : 14" />{{ label }}</span>
    </Row>
  </div>
</template>

<style scoped>
.diff-fold {
  margin: 0 8px 4px;
  border-top: 1px dashed var(--gray-6);
  border-bottom: 1px dashed var(--gray-6);
  color: var(--gray-11);
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
}

.diff-fold:hover .label {
  color: var(--gray-12);
}

.touch .label {
  font-size: var(--font-size-sm);
}
</style>
