<script setup lang="ts">
import { Button, Checkbox, IconButton, Input } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { computed, onMounted, ref, watch } from 'vue'
import { documentSearchKey, replaceDocumentMatch, revealDocumentMatch } from '../document-search'
import type { EditorMode } from '../editor-mode'

const props = defineProps<{ view: EditorView; revision: number; mode: EditorMode }>()
const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement>()
const query = ref(documentSearchKey.getState(props.view.state)?.query ?? '')
const matchCase = ref(documentSearchKey.getState(props.view.state)?.matchCase ?? false)
const replacement = ref('')
const search = computed(() => {
  void props.revision
  return documentSearchKey.getState(props.view.state)
})
watch(
  [query, matchCase],
  () => {
    props.view.dispatch(props.view.state.tr.setMeta(documentSearchKey, { query: query.value, matchCase: matchCase.value, index: 0 }))
    revealDocumentMatch(props.view)
  },
  { immediate: true },
)
onMounted(() => root.value?.querySelector('input')?.focus())

function replace(all = false) {
  replaceDocumentMatch(replacement.value, all)(props.view.state, props.view.dispatch)
  revealDocumentMatch(props.view)
}
</script>

<template>
  <section ref="root" class="document-find" role="search" aria-label="Find in document" @keydown.esc.stop.prevent="emit('close')">
    <div class="find-row">
      <Input v-model="query" class="find-input" aria-label="Find text" placeholder="Find in document" @keydown.enter.prevent="revealDocumentMatch(view, $event.shiftKey ? -1 : 1)" />
      <span class="find-count" role="status">{{ search?.matches.length ? `${search.index + 1} of ${search.matches.length}` : 'No matches' }}</span>
      <IconButton icon="lu:chevron-up" tooltip="Previous match" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, -1)" />
      <IconButton icon="lu:chevron-down" tooltip="Next match" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, 1)" />
      <IconButton icon="lu:x" tooltip="Close find" @click="emit('close')" />
    </div>
    <div class="find-row"><Checkbox v-model:checked="matchCase" label="Match case" /></div>
    <div v-if="mode === 'editable'" class="find-row">
      <Input v-model="replacement" class="find-input" aria-label="Replace with" placeholder="Replace with" @keydown.enter.prevent="replace()" />
      <Button variant="secondary" :disabled="!search?.matches.length" @click="replace()">Replace</Button>
      <Button variant="secondary" :disabled="!search?.matches.length" @click="replace(true)">Replace all</Button>
    </div>
  </section>
</template>

<style scoped>
.document-find { padding: 8px 12px; border-bottom: 1px solid var(--gray-6); background: var(--gray-2); }
.find-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 4px; }
.find-input { flex: 1; min-width: 140px; }
.find-count { font-size: var(--font-size-xs); color: var(--gray-11); }
</style>
