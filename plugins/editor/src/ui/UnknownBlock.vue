<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { ScrollArea } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { isRecord } from '../document-migrations'
import { t } from '../i18n/messages'

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
    <strong>{{ t('unknown.title', { type: String(raw.type) }) }}</strong>
    <p>{{ t('unknown.body') }}</p>
    <p v-if="textOf(raw)" class="preserved-text">{{ textOf(raw) }}</p>
    <details><summary>{{ t('unknown.preserved') }}</summary><ScrollArea axis="both" class="preserved-data"><pre>{{ JSON.stringify(raw, null, 2) }}</pre></ScrollArea></details>
  </div>
</template>

<style scoped>
.unknown-block { padding: 12px; border: 1px solid var(--warning-7); border-radius: var(--radius-sm); background: var(--warning-2); font-size: var(--font-size-sm); }
p { margin-block: 8px; }
.preserved-text { white-space: pre-wrap; }
.preserved-data { max-height: 240px; }
pre { font-family: var(--font-mono); }
summary { cursor: pointer; }
summary:focus-visible { outline: 2px solid var(--accent-8); outline-offset: 1px; }
</style>
