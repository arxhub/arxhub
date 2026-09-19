<script setup lang="ts">
import { DEFAULT_SEARCH_LIMIT, SEARCH_QUALIFIERS, type SearchSnippet, type SearchSort, snippetSegments } from '@arxhub/sql'
import { IconButton, Input, Row, SectionLabel, Segmented, type SelectOption, StatusDot, Strip, Switch } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
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
const touch = useShellFrame() === 'mobile'

const query = ref('')
const controller = createSearchController({
  search: (input, options) => search.search(input, options),
  query,
  preferences,
  indexRevision: search.revision,
  // Refreshing the results would move the keyboard selection under the owner.
  canRefresh: () => selected.value < 0,
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

// What each qualifier narrows by. Driven off the parser's own list, so the hint cannot promise a filter
// the parser does not understand — and a qualifier added there without a line here shows up unexplained
// rather than silently missing.
const QUALIFIER_DOES: Record<(typeof SEARCH_QUALIFIERS)[number], string> = {
  title: 'match the heading only',
  path: 'match the file path',
  tag: 'a #tag in the note',
  ext: 'a file extension',
  in: 'a folder to look inside',
  is: 'favorite — is:favorite',
  prop: 'a properties field — prop:key=value',
}

const QUALIFIER_HINTS = SEARCH_QUALIFIERS.map((name) => ({ name, does: QUALIFIER_DOES[name] }))

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
  const text = entry.snippet == null ? undefined : snippetSegments(entry.snippet.text).find((part) => part.match)?.text
  // The block the snippet came from, when the index has one to give: the `.arx` block's own id ahead of
  // everything else, the occurrence of a repeated markdown line as the fallback.
  workspace.open(entry.path, {
    text,
    blockId: entry.snippet?.arxId ?? undefined,
    occurrence: entry.snippet?.occurrence,
  })
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
  <div class="search-rail" :class="{ touch }">
    <div ref="headEl" class="search-head">
      <Input
        v-model="query"
        placeholder="Search notes…"
        aria-label="Search"
        :disabled="index.unavailable.value"
        @keydown.down.prevent="enterList"
        @keydown.esc.prevent="reset"
      />

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
        <Row
          v-if="entry.kind === 'document'"
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
            ><span v-for="(segment, position) in snippetSegments(entry.snippet?.text ?? '')" :key="position" :class="{ match: segment.match }">{{
              segment.text
            }}</span></span
          >
        </Row>
      </template>
    </div>

    <!-- Outside the list rather than a row inside it: a listbox holds options, and "nothing matches" is not
         something to select. It says what was searched, not what is currently in the field. -->
    <p v-else-if="controller.answered.value !== '' && !controller.resultsError.value" class="empty">
      Nothing matches <span class="term">{{ controller.answered.value }}</span>
    </p>
    <!-- Nothing has been asked yet. This space held an empty filler, with the qualifier list dumped
         under the field as a bare "title: path: tag: ext: in:" — which names the filters without saying
         what any of them does. Same facts, in the space that was already going spare. -->
    <div v-else class="results-filler">
      <SectionLabel>Narrow a search</SectionLabel>
      <dl class="qualifiers">
        <div v-for="qualifier in QUALIFIER_HINTS" :key="qualifier.name" class="qualifier">
          <dt>{{ qualifier.name }}:</dt>
          <dd>{{ qualifier.does }}</dd>
        </div>
      </dl>
    </div>

    <!-- Same Strip role as the Explorer header: an identifying label on the left, action icons on the
         right — content here rather than the title slot because the label is a live dot+text pair, not
         a static name. Unbordered: this divides a hairline inside the rail, not a boundary between two
         regions (--gray-4, not Strip's own --gray-6), and it needs the rule above it, not below. -->
    <Strip class="index-strip" :bordered="false" flush-actions>
      <span class="index-state">
        <StatusDot :tone="index.tone.value" :pulse="index.scanning.value" />
        <span class="index-state-text" :class="{ danger: index.unavailable.value }">{{ index.text.value }}</span>
      </span>
      <template #actions>
        <IconButton
          size="lg"
          icon="lu:refresh-cw"
          tooltip="Reindex"
          :disabled="index.unavailable.value || index.busy.value"
          @click="index.reindex()"
        />
        <IconButton size="lg" icon="lu:database" tooltip="SQL console" @click="sqlConsole.open()" />
      </template>
    </Strip>
  </div>
</template>

<style scoped>
.search-rail {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
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

.search-rail.touch .search-head {
  gap: 12px;
  padding: 12px;
}

.message {
  margin: 0;
  font-size: var(--font-size-xs);
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

.search-rail.touch .toggles {
  gap: 4px;
}

.search-rail.touch .toggles :deep(.root) {
  width: 100%;
  padding: 0 4px;
  border-radius: var(--radius-xs);
}

.search-rail.touch .toggles :deep(.root:hover) {
  background: var(--gray-4);
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
  height: var(--size-2xs);
  padding: 0 8px;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
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

/* The space before anything has been asked. It still takes the slack — the index status stays pinned to
   the bottom of the rail — but it now spends it on the syntax rather than on nothing. */
.results-filler {
  flex: 1;
  min-height: 0;
  padding: 12px 8px;
  overflow-y: auto;
}

.qualifiers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 0;
}

.qualifier {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--font-size-xs);
}

/* Fixed width so the descriptions line up as a column; mono because it is text you type verbatim. */
.qualifier dt {
  flex-shrink: 0;
  width: 44px;
  color: var(--gray-11);
  font-family: var(--font-mono);
}

.qualifier dd {
  margin: 0;
  color: var(--gray-10);
  line-height: var(--line-height-snug);
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

.search-rail.touch .doc-path {
  font-size: var(--font-size-sm);
}

/* Quoted note content, not a label: a step down the ramp and a step down the greys, so the titles stay
   the structure of the list. Only while the row is not the selected one — selection owns its colour. */
.snippet-text {
  min-width: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
}

.search-rail.touch .snippet-text {
  font-size: var(--font-size-sm);
}

.snippet:not(.selected) .snippet-text {
  color: var(--gray-11);
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
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}

.empty .term {
  font-family: var(--font-mono);
  color: var(--gray-12);
}

.index-strip {
  flex-shrink: 0;
  border-top: 1px solid var(--gray-4);
}

.index-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.index-state-text {
  /* text-overflow only acts on text that does not wrap: without this the line broke to two rather than
     being clipped, and the ellipsis never appeared. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}
</style>
