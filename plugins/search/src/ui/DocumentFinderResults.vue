<script setup lang="ts">
import { DEFAULT_SEARCH_LIMIT } from '@arxhub/sql'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { SearchExtension } from '../search-extension'
// biome-ignore lint/style/useImportType: used in the template and as InstanceType<typeof SearchResultList>
import SearchResultList from './SearchResultList.vue'
import { createSearchController } from './search-controller'
import { DEFAULT_SEARCH_PREFERENCES } from './search-preferences'

// The results under the Documents type's find field (DocumentsExtension.finder). The field belongs to
// Documents; what it finds belongs here, so the question is asked exactly the way the Search rail asks it.
const props = defineProps<{
  query: string
}>()

const emit = defineEmits<{
  opened: []
}>()

const arxhub = useArxHub()
const search = arxhub.extensions.get(SearchExtension)

// A copy rather than the prop itself: the controller watches a writable ref, and the prop is the field's.
const asked = ref(props.query)
watch(
  () => props.query,
  (value) => {
    asked.value = value
  },
)

const selected = ref(-1)
// The Search rail's toggles are that page's own; a finder of documents answers the plain question.
const preferences = ref({ ...DEFAULT_SEARCH_PREFERENCES })
const controller = createSearchController({
  search: (input, options) => search.search(input, options),
  query: asked,
  preferences,
  indexRevision: search.revision,
  canRefresh: () => selected.value < 0,
  limit: DEFAULT_SEARCH_LIMIT,
  onError: (error) => arxhub.logger.error('[search] the document finder failed', error),
})

const list = ref<InstanceType<typeof SearchResultList> | null>(null)

// The field puts the caret back into itself; this only lets go of the selection.
function leave(): void {
  selected.value = -1
}

// Arrow down from the field that owns this list.
function enter(): void {
  list.value?.enter()
}

// The field only mounts this once there is something typed, so that first query is asked at once rather
// than after the next keystroke.
onMounted(() => {
  if (asked.value.trim() !== '') void controller.flush()
})
onUnmounted(controller.dispose)

defineExpose({ enter })
</script>

<template>
  <div class="finder-results">
    <p v-if="controller.resultsError.value" class="error" role="alert">{{ controller.resultsError.value }}</p>
    <SearchResultList
      v-else
      ref="list"
      v-model:selected="selected"
      :documents="controller.documents.value"
      :answered="controller.answered.value"
      :snippets="false"
      @leave="leave"
      @opened="emit('opened')"
    />
  </div>
</template>

<style scoped>
.finder-results {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.error {
  margin: 8px;
  color: var(--danger-11);
  font-size: var(--font-size-sm);
}
</style>
