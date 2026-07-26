<script setup lang="ts">
import { DEFAULT_SEARCH_LIMIT, SEARCH_QUALIFIERS, type SearchSnippet, type SearchSort, snippetSegments } from '@arxhub/sql'
import { Button, Input, SectionLabel, Segmented, type SelectOption, StatusDot, Switch } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { SearchExtension } from '../search-extension'
import { createSearchController } from './search-controller'
import { useSearchPreferences } from './search-preferences'
import { useIndexStatus } from './use-index-status'
import { useOpenConsole } from './use-open-console'
import { useOpenDocument } from './use-open-document'

const arxhub = useArxHub()
const search = arxhub.extensions.get(SearchExtension)
const preferences = useSearchPreferences()
const workspace = useOpenDocument()
const sqlConsole = useOpenConsole()
// The same status line and the same rebuild control the settings section shows — one wording for both.
const index = useIndexStatus()

const query = ref('')
const controller = createSearchController({
  search: (input, options) => search.search(input, options),
  query,
  preferences,
  // Named rather than left to the engine's own default, so the page size is visible at the call site —
  // APP-01-06 routes it (and the debounce) through the plugin's config schema.
  limit: DEFAULT_SEARCH_LIMIT,
  onError: (error) => arxhub.logger.error('[search] the search failed', error),
})
onUnmounted(controller.dispose)

const SORT_OPTIONS: SelectOption[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'title', label: 'Title' },
  { value: 'modified', label: 'Modified' },
]

// The qualifiers come from the parser's own list, so the hint cannot promise a filter the parser does not
// understand.
const QUALIFIER_HINT = SEARCH_QUALIFIERS.map((name) => `${name}:`).join(' ')

// One flat list of what the arrow keys move over: a row per document, then a row per snippet under it.
// Flat because that is what a listbox is — the grouping is what the rows look like, not how they nest.
interface ResultEntry {
  key: string
  kind: 'document' | 'snippet'
  path: string
  title: string
  // Where in the document to open. A document row carries its first snippet's block, so pressing Enter on
  // the heading still lands where the match is.
  blockId: string | null
  snippet: SearchSnippet | null
}

const entries = computed((): ResultEntry[] => {
  const list: ResultEntry[] = []
  for (const found of controller.documents.value) {
    list.push({
      key: found.path,
      kind: 'document',
      path: found.path,
      title: found.title,
      blockId: found.snippets[0]?.blockId ?? null,
      snippet: null,
    })
    for (const snippet of found.snippets) {
      list.push({
        key: `${found.path}#${snippet.blockId}`,
        kind: 'snippet',
        path: found.path,
        title: found.title,
        blockId: snippet.blockId,
        snippet,
      })
    }
  }
  return list
})

const selected = ref(-1)
const listEl = ref<HTMLElement | null>(null)
const headEl = ref<HTMLElement | null>(null)

function optionId(index: number): string {
  return `arxhub-search-result-${index}`
}

const activeDescendant = computed(() => (selected.value >= 0 ? optionId(selected.value) : undefined))

// querySelector rather than a template ref on <Input>: the ref would be the component, and reaching
// through it for the element it renders needs a cast that strict mode has no honest form for.
function focusInput(): void {
  headEl.value?.querySelector('input')?.focus()
}

// A refreshed list is a different list — keeping row four selected would move the selection to whatever
// happens to be there now.
watch(entries, () => {
  selected.value = -1
})

watch(selected, async (index) => {
  if (index < 0) return
  await nextTick()
  listEl.value?.querySelector(`#${optionId(index)}`)?.scrollIntoView({ block: 'nearest' })
})

// How long after the index last moved the question is asked again. The first walk after a cold start fills
// the index a batch at a time, so this is trailing and coalesced: one re-ask once the batches stop landing,
// not one per batch.
const REVALIDATE_MS = 500
let revalidateTimer: ReturnType<typeof setTimeout> | null = null

function cancelRevalidate(): void {
  if (revalidateTimer == null) return
  clearTimeout(revalidateTimer)
  revalidateTimer = null
}

// A list on screen goes stale the moment the index moves under it — the first walk is still filling it, or a
// note was saved in the panel next door. Re-asking the same question is the only way the list catches up,
// which is what makes a note findable *as soon as* it is saved rather than at the next keystroke (FR-225).
watch(
  () => search.revision.value,
  () => {
    // Nothing on screen to go stale.
    if (controller.answered.value === '') return
    // The owner is walking the list with the arrow keys, and a refresh drops the selection (see the `entries`
    // watcher). Their place in the list is worth more than a second of freshness; the next keystroke, or the
    // next revision after they leave the list, catches it up.
    if (selected.value >= 0) return
    cancelRevalidate()
    revalidateTimer = setTimeout(() => {
      revalidateTimer = null
      void controller.flush()
    }, REVALIDATE_MS)
  },
)
onUnmounted(cancelRevalidate)

function move(delta: number): void {
  const total = entries.value.length
  if (total === 0) return
  const next = selected.value + delta
  // Up from the first row goes back to where the query is typed, which is the only place above the list.
  if (next < 0) {
    focusInput()
    return
  }
  selected.value = Math.min(next, total - 1)
}

function enterList(): void {
  if (entries.value.length === 0) return
  selected.value = 0
  listEl.value?.focus()
}

function openEntry(entry: ResultEntry): void {
  workspace.open(entry.path, entry.blockId)
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

// Escape means "never mind": the field goes back to empty and the cursor back into it, from wherever the
// owner had got to in the list.
function reset(): void {
  query.value = ''
  selected.value = -1
  focusInput()
}

const countLabel = computed(() => {
  const total = controller.totalCount.value
  return total === 1 ? '1 document' : `${total} documents`
})

const sort = computed({
  get: (): string => preferences.value.sort,
  set: (value: string) => {
    preferences.value = { ...preferences.value, sort: value as SearchSort }
  },
})

function toggle(key: 'titlesOnly' | 'caseSensitive' | 'regex', value: boolean): void {
  preferences.value = { ...preferences.value, [key]: value }
}

onMounted(focusInput)
</script>

<template>
  <div class="search-rail">
    <!-- The mobile frame dismisses its rail panel when something in it is activated, because everything in
         a rail is normally a navigation target. A search field is not: typing and flipping a toggle happen
         where the results are, so those clicks stop here and only a result closes the panel. -->
    <div ref="headEl" class="search-head" @click.stop>
      <Input
        v-model="query"
        placeholder="Search notes…"
        aria-label="Search"
        :disabled="index.unavailable.value"
        @keydown.down.prevent="enterList"
        @keydown.esc.prevent="reset"
      />
      <p class="qualifier-hint">{{ QUALIFIER_HINT }}</p>

      <!-- What the parser could not make sense of, and what the expression is wrong about: both belong at
           the input, because both are about the string that is being typed. -->
      <p v-if="controller.queryError.value" class="message danger" role="alert">{{ controller.queryError.value }}</p>
      <p v-for="warning in controller.warnings.value" :key="warning" class="message warning">{{ warning }}</p>

      <!-- Each switch carries a test id for the same reason the plugin switches do: the input a test would
           click is visually hidden, and the control the owner presses is the label around it. -->
      <div class="toggles">
        <Switch
          :model-value="preferences.titlesOnly"
          label="Titles only"
          data-testid="search-toggle-titles-only"
          @update:model-value="toggle('titlesOnly', $event)"
        />
        <Switch
          :model-value="preferences.caseSensitive"
          label="Case sensitive"
          data-testid="search-toggle-case-sensitive"
          @update:model-value="toggle('caseSensitive', $event)"
        />
        <Switch
          :model-value="preferences.regex"
          label="Regular expression"
          data-testid="search-toggle-regex"
          @update:model-value="toggle('regex', $event)"
        />
      </div>

      <div class="sort">
        <SectionLabel>Order</SectionLabel>
        <Segmented v-model="sort" :options="SORT_OPTIONS" aria-label="Order" stretch />
      </div>
    </div>

    <div class="summary">
      <template v-if="controller.resultsError.value">
        <span class="danger">{{ controller.resultsError.value }}</span>
      </template>
      <template v-else-if="controller.answered.value !== ''">
        <span>{{ countLabel }}</span>
        <!-- The list is cut, and a total that is bigger than what is on screen has to say so — otherwise
             the missing rows read as "not found". -->
        <span v-if="controller.hasMore.value" class="muted">list truncated</span>
      </template>
    </div>

    <div
      v-if="entries.length > 0"
      ref="listEl"
      class="results"
      role="listbox"
      aria-label="Search results"
      tabindex="0"
      :aria-activedescendant="activeDescendant"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="openSelected"
      @keydown.esc.prevent="reset"
    >
      <template v-for="(entry, index) in entries" :key="entry.key">
        <!-- A real button, so the mobile frame's rail panel recognises the one click that IS navigation and
             gets out of the way. The keyboard model stays on the list, hence tabindex -1. -->
        <button
          v-if="entry.kind === 'document'"
          :id="optionId(index)"
          type="button"
          tabindex="-1"
          class="row document"
          :class="{ selected: index === selected }"
          role="option"
          :aria-selected="index === selected"
          @click="selectAndOpen(index)"
        >
          <span class="doc-title">{{ entry.title }}</span>
          <span class="doc-path">{{ entry.path }}</span>
        </button>
        <button
          v-else
          :id="optionId(index)"
          type="button"
          tabindex="-1"
          class="row snippet"
          :class="{ selected: index === selected }"
          role="option"
          :aria-selected="index === selected"
          @click="selectAndOpen(index)"
        >
          <!-- Interpolated, segment by segment: the snippet arrives with control characters around each
               match, so anything in the note that looks like markup stays text on the way to the page. -->
          <span v-for="(segment, position) in snippetSegments(entry.snippet?.text ?? '')" :key="position" :class="{ match: segment.match }">{{
            segment.text
          }}</span>
        </button>
      </template>
    </div>

    <!-- Outside the list rather than a row inside it: a listbox holds options, and "nothing matches" is not
         something to select. It says what was searched, not what is currently in the field. -->
    <p v-else-if="controller.answered.value !== '' && !controller.resultsError.value" class="empty">
      Nothing matches <span class="term">{{ controller.answered.value }}</span>
    </p>
    <div v-else class="results-filler" />

    <div class="index-status">
      <!-- Stops here, because a rebuild is not navigation: the mobile frame dismisses its rail panel when
           something in it is activated, and the owner asking for a reindex has not gone anywhere. -->
      <div class="state" @click.stop>
        <StatusDot :tone="index.tone.value" :pulse="index.scanning.value" />
        <span :class="{ danger: index.unavailable.value }">{{ index.text.value }}</span>
      </div>
      <div class="index-actions">
        <Button variant="secondary" size="sm" :disabled="index.unavailable.value || index.busy.value" @click.stop="index.reindex()">
          Reindex
        </Button>
        <!-- Deliberately NOT stopped: opening the console IS navigation — it puts a panel in the content
             area, which on a phone sits behind the rail panel, so that panel has to get out of the way. -->
        <Button variant="secondary" size="sm" @click="sqlConsole.open()">SQL console</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-rail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.search-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px;
  border-bottom: 1px solid var(--gray-4);
}

/* The qualifiers, spelled the way they are typed — mono, because they are syntax rather than prose. */
.qualifier-hint {
  margin: 0;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: var(--line-height-tight);
}

.message {
  margin: 0;
  font-size: 11px;
  line-height: var(--line-height-tight);
}

.message.danger {
  color: var(--danger-11);
}

.message.warning {
  color: var(--warning-11);
}

.toggles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sort {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 8px;
  color: var(--gray-11);
  font-size: 11px;
}

.summary .muted {
  color: var(--gray-10);
}

.danger {
  color: var(--danger-11);
}

.results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.results:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.results-filler {
  flex: 1;
  min-height: 0;
}

.row {
  display: block;
  width: 100%;
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
}

.row:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.row.selected {
  background: var(--accent-3);
  color: var(--accent-11);
}

.row:hover:not(.selected) {
  background: var(--gray-3);
}

.document {
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
  min-height: 28px;
  padding-top: 4px;
  padding-bottom: 4px;
}

.doc-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
  font-size: 13px;
  font-weight: var(--font-weight-medium);
}

.document:not(.selected) .doc-title {
  color: var(--gray-12);
}

.doc-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: 11px;
}

/* Indented under the document it belongs to: the grouping is visual, so a row still reads as one of the
   flat list the arrow keys walk. */
.snippet {
  margin-left: 12px;
  padding-top: 4px;
  padding-bottom: 4px;
  color: var(--gray-11);
  font-size: 11px;
  line-height: var(--line-height-relaxed);
}

/* The accent is spent on selection, so a match inside a snippet is weight and a wash, not another colour
   competing with the selected row. */
.snippet .match {
  background: var(--accent-4);
  color: var(--accent-11);
  font-weight: var(--font-weight-medium);
}

.empty {
  flex: 1;
  min-height: 0;
  margin: 8px;
  color: var(--gray-11);
  font-size: 13px;
  line-height: var(--line-height-relaxed);
}

.empty .term {
  font-family: var(--font-mono);
  color: var(--gray-12);
}

/* A column, not a row: the rail is 240px wide and the state line plus two controls do not share one. */
.index-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--gray-4);
  color: var(--gray-11);
  font-size: 11px;
}

.index-actions {
  display: flex;
  gap: 8px;
}

.index-actions > * {
  flex: 1;
}

.state {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.state span {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
