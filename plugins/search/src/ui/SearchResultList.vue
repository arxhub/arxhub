<script setup lang="ts">
import { DocumentsExtension, folderOf } from '@arxhub/plugin-documents'
import { type SearchDocument, type SearchSnippet, snippetSegments } from '@arxhub/sql'
// biome-ignore lint/correctness/noUnusedImports: Row, ScrollArea and SectionLabel are used in the template
import { EmptyState, Row, ScrollArea, SectionLabel } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useOpenDocument } from './use-open-document'

const props = withDefaults(
  defineProps<{
    documents: readonly SearchDocument[]
    // The query the list answers — what "Nothing matches" names. Empty while nothing has been answered.
    answered: string
    // Off where the list is a finder of documents rather than of places inside them.
    snippets?: boolean
    // Put before a finder row's folder ("Documents · Work"), where the list has to say which type a hit
    // belongs to.
    context?: string
  }>(),
  { snippets: true },
)

// The keyboard selection, readable by the owner: a refresh of the list under a selected row would move
// the selection, so the owner holds refreshes back while one is set.
const selected = defineModel<number>('selected', { default: -1 })

const emit = defineEmits<{
  opened: []
  // Up from the first row, or Escape: the owner puts the caret back where the query is typed.
  leave: [reason: 'up' | 'escape']
}>()

const workspace = useOpenDocument()
const viewers = useArxHub().extensions.get(DocumentsExtension)
const touch = useShellFrame() === 'mobile'

const idPrefix = useId()

function placeOf(path: string): string {
  const folder = folderOf(path) ?? 'Vault'
  return props.context == null ? folder : `${props.context} · ${folder}`
}

// One flat list of what the arrow keys move over: a row per document, then a row per snippet under it.
// Flat because that is what a listbox is — the grouping is what the rows look like, not how they nest.
interface ResultEntry {
  key: string
  kind: 'document' | 'snippet'
  path: string
  title: string
  // Where in the document to open. A document row carries its first snippet, so pressing Enter on the
  // heading still lands where the match is.
  at: SearchSnippet | null
}

const entries = computed((): ResultEntry[] => {
  const list: ResultEntry[] = []
  for (const found of props.documents) {
    list.push({ key: found.path, kind: 'document', path: found.path, title: found.title, at: found.snippets[0] ?? null })
    if (!props.snippets) continue
    for (const snippet of found.snippets) {
      list.push({ key: `${found.path}#${snippet.blockId}`, kind: 'snippet', path: found.path, title: found.title, at: snippet })
    }
  }
  return list
})

const listEl = ref<HTMLElement | null>(null)

function optionId(index: number): string {
  return `arxhub-search-result-${idPrefix}-${index}`
}

const activeDescendant = computed(() => (selected.value >= 0 ? optionId(selected.value) : undefined))

// A refreshed list is a different list — keeping row four selected would move the selection to whatever
// happens to be there now.
watch(entries, () => {
  selected.value = -1
})

watch(selected, async (index) => {
  if (index < 0) return
  await nextTick()
  // An attribute selector: the generated prefix is not guaranteed to be a valid CSS identifier.
  listEl.value?.querySelector(`[id="${optionId(index)}"]`)?.scrollIntoView({ block: 'nearest' })
})

function move(delta: number): void {
  const total = entries.value.length
  if (total === 0) return
  const next = selected.value + delta
  if (next < 0) {
    selected.value = -1
    emit('leave', 'up')
    return
  }
  selected.value = Math.min(next, total - 1)
}

// From the query field, arrow down: into the list at its first row.
function enter(): void {
  if (entries.value.length === 0) return
  selected.value = 0
  listEl.value?.focus()
}

function openEntry(entry: ResultEntry): void {
  const snippet = entry.at
  const text = snippet == null ? undefined : snippetSegments(snippet.text).find((part) => part.match)?.text
  // The place the snippet came from, when the index has one to give: the format's own anchor ahead of
  // everything else, the occurrence of a repeated markdown line as the fallback.
  workspace.open(entry.path, {
    text,
    blockId: snippet?.anchorId ?? undefined,
    part: snippet?.part ?? undefined,
    occurrence: snippet?.occurrence,
  })
  emit('opened')
}

function openSelected(): void {
  const entry = entries.value[selected.value]
  if (entry != null) openEntry(entry)
}

function selectAndOpen(index: number): void {
  selected.value = index
  const entry = entries.value[index]
  if (entry != null) openEntry(entry)
}

function escapeList(): void {
  selected.value = -1
  emit('leave', 'escape')
}

defineExpose({ enter })
</script>

<template>
  <!-- The listbox is the element inside the scroller, not the scroller: the viewport's own role belongs
       to the scroll area, and aria-activedescendant has to sit on the element that holds focus. -->
  <ScrollArea v-if="entries.length > 0" class="results" :class="{ touch }" viewport-class="results-viewport" content-class="results-content">
    <div
      ref="listEl"
      class="results-list"
      role="listbox"
      aria-label="Search results"
      tabindex="0"
      :aria-activedescendant="activeDescendant"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="openSelected"
      @keydown.esc.prevent="escapeList"
    >
      <!-- A finder lists documents the way the vault does — kind, name, folder — rather than as a path to
           read: the folder is what tells two "Budget 2026" apart. -->
      <SectionLabel v-if="!snippets" inset>Results · {{ documents.length }}</SectionLabel>
      <template v-for="(entry, index) in entries" :key="entry.key">
        <Row
          v-if="entry.kind === 'document' && !snippets"
          :id="optionId(index)"
          as="button"
          type="button"
          tabindex="-1"
          :icon="viewers.iconFor(entry.path) ?? 'lu:file-text'"
          :label="entry.title"
          :detail="placeOf(entry.path)"
          :match="answered"
          :selected="index === selected"
          role="option"
          :aria-selected="index === selected"
          @click="selectAndOpen(index)"
        />
        <Row
          v-else-if="entry.kind === 'document'"
          :id="optionId(index)"
          as="button"
          type="button"
          wrap
          tabindex="-1"
          class="document"
          :selected="index === selected"
          role="option"
          :aria-selected="index === selected"
          @click="selectAndOpen(index)"
        >
          <span class="doc-text">
            <span class="doc-title">{{ entry.title }}</span>
            <span class="doc-path">{{ entry.path }}</span>
          </span>
        </Row>
        <!-- A snippet sits one level in under the document it belongs to: the grouping is what the rows
             look like, not how they nest, so it is the row role's own indent rather than a margin. -->
        <Row
          v-else
          :id="optionId(index)"
          as="button"
          type="button"
          wrap
          :depth="1"
          tabindex="-1"
          class="snippet"
          :selected="index === selected"
          role="option"
          :aria-selected="index === selected"
          @click="selectAndOpen(index)"
        >
          <!-- Interpolated, segment by segment: the snippet arrives with control characters around each
               match, so anything in the note that looks like markup stays text on the way to the page.
               One wrapper around the lot, because the row role puts a gap between its children and a
               snippet is one run of text. -->
          <span class="snippet-text"
            ><span v-for="(segment, position) in snippetSegments(entry.at?.text ?? '')" :key="position" :class="{ match: segment.match }">{{
              segment.text
            }}</span></span
          >
        </Row>
      </template>
    </div>
  </ScrollArea>

  <!-- Outside the list rather than a row inside it: a listbox holds options, and "nothing matches" is not
       something to select. It says what was searched, not what is currently in the field. -->
  <EmptyState v-else-if="answered !== ''" fill icon="lu:search-x" data-testid="search-empty">
    Nothing matches <span class="term">{{ answered }}</span>
  </EmptyState>
</template>

<style scoped>
.results {
  flex: 1;
}

.results :deep(.results-content) {
  display: flex;
  flex-direction: column;
}

.results-list {
  flex: 1 0 auto;
  padding: 4px 0;
}

/* The ring is drawn on the viewport, where it sat before: on the list itself it would run the list's full
   length and be cut off by the viewport wherever the list is taller than it. */
.results:has(.results-list:focus-visible) :deep(.results-viewport) {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.results-list:focus-visible {
  outline: none;
}

/* The two lines of a result, stacked inside the row's box: the row owns its height and inset, this owns
   how a title and a path sit in it. */
.doc-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.doc-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.doc-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.results.touch .doc-path {
  font-size: var(--font-size-sm);
}

/* Quoted note content, not a label: a step down the ramp and a step down the greys, so the titles stay
   the structure of the list. Only while the row is not the selected one — selection owns its colour. */
.snippet-text {
  min-width: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
}

.results.touch .snippet-text {
  font-size: var(--font-size-sm);
}

.snippet:not(.selected) .snippet-text {
  color: var(--gray-11);
}

/* The accent is spent on selection (design.md <Colour>), so a match takes the warning wash — the same
   one Row draws for a matched label. */
.snippet .match {
  border-radius: var(--radius-xs);
  background: var(--warning-4);
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
}

.term {
  font-family: var(--font-mono);
  color: var(--gray-12);
}
</style>
