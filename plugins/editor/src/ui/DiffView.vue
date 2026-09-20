<script setup lang="ts">
import type { DiffResult } from '../diff-module'

defineProps<{
  result: DiffResult
}>()
</script>

<template>
  <div data-testid="diff-view" class="diff-view" role="region" :aria-label="`${result.leftLabel} vs ${result.rightLabel}`">
    <div class="labels">
      <span class="label left">{{ result.leftLabel }}</span>
      <span class="sep" aria-hidden="true">→</span>
      <span class="label right">{{ result.rightLabel }}</span>
    </div>

    <template v-if="result.kind === 'lines' && result.lines">
      <pre class="hunks" aria-label="Line differences"><code
        v-for="(line, index) in result.lines"
        :key="index"
        class="line"
        :class="line.type"
      >{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}{{ line.text }}
</code></pre>
    </template>

    <template v-else-if="result.kind === 'blocks' && result.blocks">
      <ul class="blocks" aria-label="Block differences">
        <li v-if="!result.blocks.length" class="empty">No block changes.</li>
        <li v-for="block in result.blocks" :key="block.key" class="block" :data-kind="block.kind">
          {{ block.summary }}
        </li>
      </ul>
      <div v-if="result.blocks.some((b) => b.beforeText != null || b.afterText != null)" class="previews">
        <template v-for="block in result.blocks" :key="`${block.key}-preview`">
          <div v-if="block.beforeText != null || block.afterText != null" class="pair">
            <p class="side-label">{{ result.leftLabel }}</p>
            <pre class="preview">{{ block.beforeText ?? '—' }}</pre>
            <p class="side-label">{{ result.rightLabel }}</p>
            <pre class="preview">{{ block.afterText ?? '—' }}</pre>
          </div>
        </template>
      </div>
    </template>

    <template v-else>
      <p class="replaced">Content replaced as a whole{{ result.leftBytes != null ? ` (${result.leftBytes} → ${result.rightBytes} bytes)` : '' }}.</p>
      <p class="side-label">{{ result.leftLabel }}</p>
      <pre class="preview">{{ result.leftPreview ?? '' }}</pre>
      <p class="side-label">{{ result.rightLabel }}</p>
      <pre class="preview">{{ result.rightPreview ?? '' }}</pre>
    </template>
  </div>
</template>

<style scoped>
.diff-view { min-width: 0; }
.labels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}
.label { font-weight: var(--font-weight-medium); color: var(--gray-12); }
.sep { color: var(--gray-9); }
.hunks {
  max-height: 320px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  background: var(--gray-1);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.line { display: block; }
.line.added { background: var(--success-3); color: var(--success-11); }
.line.removed { background: var(--danger-3); color: var(--danger-11); }
.blocks { margin: 0; padding-inline-start: 20px; font-size: var(--font-size-sm); }
.block { margin-block: 4px; color: var(--gray-12); }
.empty { color: var(--gray-11); list-style: none; margin-inline-start: -20px; }
.side-label { margin: 8px 0 4px; font-size: var(--font-size-xs); color: var(--gray-11); }
.preview {
  max-height: 160px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  background: var(--gray-1);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.replaced { font-size: var(--font-size-sm); color: var(--gray-11); }
.pair { margin-top: 8px; }
</style>
