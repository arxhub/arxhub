<script setup lang="ts">
import { Button, IconButton, Input } from '@arxhub/uikit/core'
import { ref } from 'vue'
import { revealDocumentMatch } from '../document-search'
import { type DocumentFindProps, useDocumentFind } from './use-document-find'

const props = defineProps<DocumentFindProps>()
const emit = defineEmits<{ close: [] }>()
const { root, query, matchCase, replacement, search, replace } = useDocumentFind(props)
const replacing = ref(false)
</script>

<template>
  <section ref="root" class="document-find" role="search" aria-label="Find in document" @keydown.esc.stop.prevent="emit('close')">
    <div class="query-row">
      <Input v-model="query" class="find-input" aria-label="Find text" placeholder="Find in document" @keydown.enter.prevent="revealDocumentMatch(view, $event.shiftKey ? -1 : 1)" />
      <IconButton size="xl" icon="lu:x" tooltip="Close find" @click="emit('close')" />
    </div>
    <div class="options-row">
      <span class="find-count" role="status">{{ search?.matches.length ? `${search.index + 1} of ${search.matches.length}` : 'No matches' }}</span>
      <IconButton size="xl" icon="lu:case-sensitive" tooltip="Match case" :active="matchCase" :aria-pressed="matchCase" @click="matchCase = !matchCase" />
      <IconButton size="xl" icon="lu:chevron-up" tooltip="Previous match" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, -1)" />
      <IconButton size="xl" icon="lu:chevron-down" tooltip="Next match" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, 1)" />
      <IconButton v-if="mode === 'editable'" size="xl" icon="lu:replace" tooltip="Replace text" :active="replacing" :aria-expanded="replacing" @click="replacing = !replacing" />
    </div>
    <template v-if="mode === 'editable' && replacing">
      <Input v-model="replacement" aria-label="Replace with" placeholder="Replace with" @keydown.enter.prevent="replace()" />
      <div class="replace-actions">
        <Button variant="secondary" size="lg" :disabled="!search?.matches.length" @click="replace()">Replace</Button>
        <Button variant="secondary" size="lg" :disabled="!search?.matches.length" @click="replace(true)">Replace all</Button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.document-find {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px var(--size-xs-half);
  border-bottom: 1px solid var(--gray-6);
  background: var(--gray-2);
}
.query-row, .options-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.find-input, .find-count { flex: 1; min-width: 0; }
.find-count { font-size: var(--font-size-sm); color: var(--gray-11); }
.replace-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
</style>
