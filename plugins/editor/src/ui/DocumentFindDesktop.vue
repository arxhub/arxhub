<script setup lang="ts">
import { Button, Checkbox, IconButton, Input } from '@arxhub/uikit/core'
import { revealDocumentMatch } from '../document-search'
import { type DocumentFindProps, useDocumentFind } from './use-document-find'

const props = defineProps<DocumentFindProps>()
const emit = defineEmits<{ close: [] }>()
const { root, query, matchCase, replacement, search, replace } = useDocumentFind(props)
</script>

<template>
  <section ref="root" class="document-find" role="search" aria-label="Find in document" @keydown.esc.stop.prevent="emit('close')">
    <div class="find-row">
      <Input v-model="query" class="find-input" aria-label="Find text" placeholder="Find in document" @keydown.enter.prevent="revealDocumentMatch(view, $event.shiftKey ? -1 : 1)" />
      <span class="find-count" role="status">{{ search?.matches.length ? `${search.index + 1} of ${search.matches.length}` : 'No matches' }}</span>
      <IconButton size="lg" icon="lu:chevron-up" tooltip="Previous match" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, -1)" />
      <IconButton size="lg" icon="lu:chevron-down" tooltip="Next match" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, 1)" />
      <IconButton size="lg" icon="lu:x" tooltip="Close find" @click="emit('close')" />
    </div>
    <div class="find-row"><Checkbox v-model="matchCase" label="Match case" /></div>
    <div v-if="mode === 'editable'" class="find-row">
      <Input v-model="replacement" class="find-input" aria-label="Replace with" placeholder="Replace with" @keydown.enter.prevent="replace()" />
      <Button variant="secondary" size="sm" :disabled="!search?.matches.length" @click="replace()">Replace</Button>
      <Button variant="secondary" size="sm" :disabled="!search?.matches.length" @click="replace(true)">Replace all</Button>
    </div>
  </section>
</template>

<style scoped>
.document-find { padding: 8px 12px; border-bottom: 1px solid var(--gray-6); background: var(--gray-2); }
.find-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 4px; }
.find-input { flex: 1; min-width: 140px; }
.find-count { font-size: var(--font-size-xs); color: var(--gray-11); }
</style>
