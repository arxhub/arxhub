<script setup lang="ts">
import { BottomSheet, EmptyState, IconButton, Row, SearchField, SectionLabel, Separator } from '@arxhub/uikit/core'
import { computed, ref, watch } from 'vue'
import { secondTapOf } from '../second-tap'
import type { TabType } from '../tab-type'
import type { Workspace } from '../workspace'

// What a second tap on the active type opens: the second level, the way a tab counter opens the tabs in a
// phone's browser. The type decides what is in it (`TabType.sheet`); the shell supplies the two defaults —
// the tabs of an object type, and the navigation of a type without objects.
const props = defineProps<{ open: boolean; type: TabType | null; workspace: Workspace }>()
const emit = defineEmits<{ close: []; browse: [] }>()

const mode = computed(() => (props.type == null ? null : secondTapOf(props.type)))
const title = computed(() => props.type?.sheet?.title ?? props.type?.title ?? '')
const anchor = computed(() => props.type?.sheet?.anchor ?? (mode.value === 'tabs' ? 'end' : 'start'))

// Oldest at the top, the freshest at the bottom under the thumb — and the sheet opens scrolled there.
const tabs = computed(() => (props.type == null || mode.value !== 'tabs' ? [] : props.workspace.tabsByRecency(props.type.id)))
const activeKey = computed(() => (props.type == null ? null : (props.workspace.activeTab(props.type.id)?.key ?? null)))

// The type's finder sits at the foot, under the thumb; while something is typed its results are the body.
const find = computed(() => (props.type == null ? null : (props.type.find?.() ?? null)))
const query = ref('')
const finding = computed(() => find.value != null && query.value.trim() !== '')
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)

function pick(key: string): void {
  if (props.type == null) return
  props.workspace.activateObject(props.type.id, key)
  emit('close')
}

function drop(key: string): void {
  if (props.type == null) return
  void props.workspace.closeObject(props.type.id, key)
}
</script>

<template>
  <BottomSheet :open="props.open && mode != null" :title="title" :anchor="anchor" @close="emit('close')">
    <template v-if="props.type != null">
      <component :is="find?.results" v-if="finding" :query="query" @opened="emit('close')" />
      <component :is="props.type.sheet?.content" v-else-if="mode === 'content'" :type-id="props.type.id" />

      <template v-else-if="mode === 'tabs'">
        <SectionLabel v-if="tabs.length" inset>Tabs · {{ tabs.length }}</SectionLabel>
        <!-- With a navigation below, no tabs is just a shorter sheet: the browse row is the whole answer. -->
        <EmptyState v-else-if="props.type.nav == null" compact icon="lu:layers" text="Nothing is open in this type yet." />
        <Row
          v-for="tab in tabs"
          :key="tab.key"
          as="button"
          type="button"
          :icon="props.type.icon"
          :label="tab.title"
          :detail="tab.subtitle || undefined"
          :selected="tab.key === activeKey"
          :aria-current="tab.key === activeKey ? 'true' : undefined"
          :data-testid="`open:${tab.typeId}:${tab.key}`"
          @click="pick(tab.key)"
        >
          <span v-if="tab.gone" class="note">Gone</span>
          <template #trailing>
            <IconButton size="row" icon="lu:x" :aria-label="`Close ${tab.title}`" @click="drop(tab.key)" />
          </template>
        </Row>
        <!-- The road from what is open to everything that could be: the type's own navigation, whole
             screen, since a tree of the vault needs the room a list of tabs does not. -->
        <template v-if="props.type.nav != null">
          <Separator v-if="tabs.length" orientation="horizontal" />
          <Row
            as="button"
            type="button"
            :icon="props.type.nav.icon ?? 'lu:folder'"
            :label="props.type.nav.title ?? props.type.title"
            next
            data-testid="type-sheet-browse"
            @click="emit('browse')"
          />
        </template>
      </template>

      <component :is="props.type.nav?.component" v-else-if="mode === 'nav'" />
    </template>

    <template v-if="find != null || props.type?.sheet?.footer != null" #footer>
      <SearchField v-if="find != null" v-model="query" flush :placeholder="find.placeholder" :aria-label="find.placeholder" data-testid="type-sheet-find" />
      <component :is="props.type?.sheet?.footer" v-else :type-id="props.type?.id" />
    </template>
  </BottomSheet>
</template>

<style scoped>
.note {
  flex-shrink: 0;
  color: var(--gray-10);
  font-size: var(--font-size-xs);
}
</style>
