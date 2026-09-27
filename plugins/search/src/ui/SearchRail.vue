<script setup lang="ts">
import { DEFAULT_SEARCH_LIMIT, SEARCH_QUALIFIERS } from '@arxhub/sql'
// biome-ignore lint/style/useImportType: SearchField is used in the template and as InstanceType<typeof SearchField>
import { IconButton, ScrollArea, SearchField, SectionLabel, StatusDot, Strip } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, onUnmounted, ref } from 'vue'
import { t } from '../i18n/messages'
import { SearchExtension } from '../search-extension'
import SearchFilters from './SearchFilters.vue'
// biome-ignore lint/style/useImportType: used in the template and as InstanceType<typeof SearchResultList>
import SearchResultList from './SearchResultList.vue'
import { createSearchController } from './search-controller'
import { useSearchPreferences } from './search-preferences'
import { useIndexStatus } from './use-index-status'
import { useOpenConsole } from './use-open-console'

const arxhub = useArxHub()
const search = arxhub.extensions.get(SearchExtension)
const preferences = useSearchPreferences()
const sqlConsole = useOpenConsole()
// The same status line and the same rebuild control the settings section shows — one wording for both.
const index = useIndexStatus()
const touch = useShellFrame() === 'mobile'

const query = ref('')
const selected = ref(-1)
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

// What each qualifier narrows by. Driven off the parser's own list, so the hint cannot promise a filter
// the parser does not understand — and a qualifier added there without a line here shows up unexplained
// rather than silently missing.
const QUALIFIER_DOES: Record<(typeof SEARCH_QUALIFIERS)[number], () => string> = {
  title: () => t('qualifiers.title'),
  path: () => t('qualifiers.path'),
  tag: () => t('qualifiers.tag'),
  ext: () => t('qualifiers.ext'),
  in: () => t('qualifiers.in'),
  is: () => t('qualifiers.is'),
  prop: () => t('qualifiers.prop'),
}

const qualifierHints = computed(() => SEARCH_QUALIFIERS.map((name) => ({ name, does: QUALIFIER_DOES[name]() })))

const field = ref<InstanceType<typeof SearchField> | null>(null)
const list = ref<InstanceType<typeof SearchResultList> | null>(null)

// A list stays on screen while the query is wrong (FR-232), and "nothing matches" only answers a search
// that ran.
const showResults = computed(
  () => controller.documents.value.length > 0 || (controller.answered.value !== '' && !controller.resultsError.value),
)

function focusInput(): void {
  field.value?.focus()
}

function enterList(): void {
  list.value?.enter()
}

// Escape means "never mind": the field goes back to empty and the cursor back into it, from wherever the
// owner had got to in the list. Up from the first row only goes back to the field.
function leaveList(reason: 'up' | 'escape'): void {
  if (reason === 'escape') reset()
  else focusInput()
}

function reset(): void {
  query.value = ''
  selected.value = -1
  focusInput()
}

const countLabel = computed(() => t('rail.documents', { count: controller.totalCount.value }))

onUnmounted(controller.dispose)
</script>

<template>
  <div class="search-rail" :class="{ touch }">
    <div class="search-head">
      <SearchField
        ref="field"
        v-model="query"
        :placeholder="t('rail.placeholder')"
        :aria-label="t('rail.label')"
        autofocus
        :disabled="index.unavailable.value"
        @keydown.down.prevent="enterList"
        @keydown.esc.prevent="reset"
      />

      <!-- What the parser could not make sense of, and what the expression is wrong about: both belong at
           the input, because both are about the string that is being typed. -->
      <p v-if="controller.queryError.value" class="message danger" role="alert">{{ controller.queryError.value }}</p>
      <p v-for="warning in controller.warnings.value" :key="warning" class="message warning">{{ warning }}</p>

      <SearchFilters v-model="preferences" />
    </div>

    <div class="summary">
      <template v-if="controller.resultsError.value">
        <span class="danger">{{ controller.resultsError.value }}</span>
      </template>
      <template v-else-if="controller.answered.value !== ''">
        <span>{{ countLabel }}</span>
        <!-- The list is cut, and a total that is bigger than what is on screen has to say so — otherwise
             the missing rows read as "not found". -->
        <span v-if="controller.hasMore.value" class="muted">{{ t('rail.truncated') }}</span>
      </template>
    </div>

    <SearchResultList
      v-if="showResults"
      ref="list"
      v-model:selected="selected"
      :documents="controller.documents.value"
      :answered="controller.answered.value"
      @leave="leaveList"
    />
    <!-- Nothing has been asked yet. This space held an empty filler, with the qualifier list dumped
         under the field as a bare "title: path: tag: ext: in:" — which names the filters without saying
         what any of them does. Same facts, in the space that was already going spare. -->
    <ScrollArea v-else class="results-filler" content-class="results-filler-content">
      <SectionLabel>{{ t('rail.narrow') }}</SectionLabel>
      <dl class="qualifiers">
        <div v-for="qualifier in qualifierHints" :key="qualifier.name" class="qualifier">
          <dt>{{ qualifier.name }}:</dt>
          <dd>{{ qualifier.does }}</dd>
        </div>
      </dl>
    </ScrollArea>

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
          :tooltip="t('index.reindex')"
          :disabled="index.unavailable.value || index.busy.value"
          @click="index.reindex()"
        />
        <IconButton size="lg" icon="lu:database" :tooltip="t('rail.sqlConsole')" @click="sqlConsole.open()" />
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

/* The space before anything has been asked. It still takes the slack — the index status stays pinned to
   the bottom of the rail — but it now spends it on the syntax rather than on nothing. */
.results-filler {
  flex: 1;
}

.results-filler :deep(.results-filler-content) {
  padding: 12px 8px;
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
