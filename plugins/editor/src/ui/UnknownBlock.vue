<script setup lang="ts">
import { computed } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { isRecord } from '../document-migrations'

const props = defineProps<ArxEditorControlProps>()
const raw = computed(() => props.node.attrs.raw)
function textOf(value: unknown): string {
  if (!isRecord(value)) return ''
  if (typeof value.text === 'string') return value.text
  return Array.isArray(value.content) ? value.content.map(textOf).filter(Boolean).join(' ') : ''
}
</script>

<template>
  <div class="unknown-block">
    <strong>Unavailable block: {{ raw.type }}</strong>
    <p>This block needs a compatible editor plugin. Its original data is preserved when you save.</p>
    <p v-if="textOf(raw)" class="preserved-text">{{ textOf(raw) }}</p>
    <details><summary>Preserved data</summary><pre>{{ JSON.stringify(raw, null, 2) }}</pre></details>
  </div>
</template>

<style scoped>
.unknown-block { padding: 12px; border: 1px solid var(--warning-7); border-radius: var(--radius-sm); background: var(--warning-2); font-size: var(--font-size-sm); }
p { margin-block: 8px; }
.preserved-text { white-space: pre-wrap; }
pre { max-height: 240px; overflow: auto; font-family: var(--font-mono); }
summary { cursor: pointer; }
summary:focus-visible { outline: 2px solid var(--accent-8); outline-offset: 1px; }
</style>
