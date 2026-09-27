<script setup lang="ts">
import { ScrollArea } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'
import type { DiffReplacedModel } from '../model'
import { bytesLabel } from './labels'
import { useDiffViewContext } from './use-diff-view'

defineProps<{ model: DiffReplacedModel; leftLabel: string; rightLabel: string }>()
const { touch } = useDiffViewContext()
</script>

<template>
  <div class="replaced" :class="{ touch }" data-diff-stop="replaced" tabindex="-1">
    <p class="summary">{{ t('binary') }}</p>
    <div class="sides">
      <section v-for="(side, index) in [model.left, model.right]" :key="index" class="side" :data-change="index === 0 ? 'removed' : 'added'">
        <div class="side-head">
          <span>{{ index === 0 ? leftLabel : rightLabel }}</span>
          <span class="size">{{ bytesLabel(side.bytes) }}</span>
        </div>
        <ScrollArea class="preview-area">
          <pre class="preview">{{ side.preview }}</pre>
        </ScrollArea>
      </section>
    </div>
  </div>
</template>

<style scoped>
.replaced {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.replaced:focus {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.summary {
  margin: 0;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.sides {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.touch .sides {
  grid-template-columns: minmax(0, 1fr);
}

.side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.side-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gray-4);
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.side[data-change='removed'] .side-head {
  background: var(--danger-3);
  color: var(--danger-11);
}

.side[data-change='added'] .side-head {
  background: var(--success-3);
  color: var(--success-12);
}

.size {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.preview-area {
  max-height: 320px;
}

.preview {
  margin: 0;
  padding: 8px 12px;
  color: var(--gray-12);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
