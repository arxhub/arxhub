<script setup lang="ts">
import { ref } from 'vue'
import { useDiffController } from './controller'
import DiffBody from './DiffBody.vue'
import type { DiffViewProps } from './types'
import { useDiffView, useStopFocusSync } from './use-diff-view'

// The phone's content only: nothing interactive at the top, no side-by-side and no sheet tabs — its controls
// live in the band above the type row, which the host docks with the same controller.
const props = defineProps<DiffViewProps>()

const controller = props.controller ?? useDiffController(() => props.result)
const root = ref<HTMLElement | null>(null)
useDiffView(controller, root)
const onFocusIn = useStopFocusSync(controller)
</script>

<template>
  <div
    ref="root"
    class="diff-view"
    data-testid="diff-view"
    role="region"
    :aria-label="`${result.leftLabel} → ${result.rightLabel}`"
    tabindex="-1"
    @focusin="onFocusIn"
  >
    <DiffBody :left-label="result.leftLabel" :right-label="result.rightLabel" :side-by-side="false" />
  </div>
</template>

<style scoped>
.diff-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--gray-1);
}

.diff-view:focus {
  outline: none;
}
</style>
