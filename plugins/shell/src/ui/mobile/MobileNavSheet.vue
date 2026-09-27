<script setup lang="ts">
import { readText } from '@arxhub/i18n'
import { BottomSheet, SearchField } from '@arxhub/uikit/core'
import { computed, ref, watch } from 'vue'
import type { TabType } from '../tab-type'

// A type's navigation over the whole screen — the vault behind Documents. Reached from the type's second-tap
// sheet rather than from a key of its own: the phone has one road into a type's second level, and the
// tree is a step further down it, not a third control in the row.
//
// A type that can be searched puts its field on top, focused: someone who came this far for one document
// usually knows its name sooner than its folder.
const props = defineProps<{ open: boolean; type: TabType | null }>()
const emit = defineEmits<{ close: [] }>()

const find = computed(() => (props.type == null ? null : (props.type.find?.() ?? null)))
const query = ref('')
const finding = computed(() => find.value != null && query.value.trim() !== '')
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)

// The keyboard covers half the tree, so moving through the tree is taken as done with typing. A tap on a
// row already takes the focus; a scroll does not, so it is let go here.
function browsing(): void {
  const active = document.activeElement
  if (active instanceof HTMLInputElement && active.dataset.testid === 'nav-sheet-find') active.blur()
}
</script>

<template>
  <BottomSheet
    :open="props.open && props.type?.nav != null"
    variant="full"
    :title="readText(props.type?.nav?.title ?? props.type?.title) ?? ''"
    @close="emit('close')"
    @scroll="browsing"
  >
    <template v-if="find != null" #top>
      <SearchField v-model="query" flush :placeholder="find.placeholder" :aria-label="find.placeholder" data-testid="nav-sheet-find" />
    </template>
    <component :is="find?.results" v-if="finding" :query="query" @opened="emit('close')" />
    <component :is="props.type.nav.component" v-else-if="props.type?.nav != null" />
  </BottomSheet>
</template>
