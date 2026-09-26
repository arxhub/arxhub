<script setup lang="ts">
import { BottomSheet, EmptyState, Icon, IconButton, Row, SectionLabel, Separator } from '@arxhub/uikit/core'
import { computed } from 'vue'
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
      <component :is="props.type.sheet?.content" v-if="mode === 'content'" :type-id="props.type.id" />

      <template v-else-if="mode === 'tabs'">
        <SectionLabel v-if="tabs.length" class="heading">Tabs · {{ tabs.length }}</SectionLabel>
        <!-- With a navigation below, no tabs is just a shorter sheet: the browse row is the whole answer. -->
        <EmptyState v-else-if="props.type.nav == null" compact icon="lu:layers" text="Nothing is open in this type yet." />
        <Row
          v-for="tab in tabs"
          :key="tab.key"
          as="button"
          type="button"
          wrap
          :selected="tab.key === activeKey"
          :aria-current="tab.key === activeKey ? 'true' : undefined"
          :data-testid="`open:${tab.typeId}:${tab.key}`"
          @click="pick(tab.key)"
        >
          <Icon :name="props.type.icon" :size="16" />
          <span class="body">
            <span class="title">{{ tab.title }}</span>
            <span v-if="tab.subtitle" class="subtitle">{{ tab.subtitle }}</span>
          </span>
          <span v-if="tab.gone" class="note">Gone</span>
          <template #trailing>
            <IconButton size="row" icon="lu:x" :aria-label="`Close ${tab.title}`" @click="drop(tab.key)" />
          </template>
        </Row>
        <!-- The road from what is open to everything that could be: the type's own navigation, whole
             screen, since a tree of the vault needs the room a list of tabs does not. -->
        <template v-if="props.type.nav != null">
          <Separator v-if="tabs.length" orientation="horizontal" />
          <Row as="button" type="button" data-testid="type-sheet-browse" @click="emit('browse')">
            <Icon :name="props.type.nav.icon ?? 'lu:folder'" :size="16" />
            <span class="title">{{ props.type.nav.title ?? props.type.title }}</span>
            <Icon class="trail" name="lu:chevron-right" :size="16" />
          </Row>
        </template>
      </template>

      <component :is="props.type.nav?.component" v-else-if="mode === 'nav'" />
    </template>

    <template v-if="props.type?.sheet?.footer != null" #footer>
      <component :is="props.type.sheet.footer" :type-id="props.type.id" />
    </template>
  </BottomSheet>
</template>

<style scoped>
.heading {
  padding: 8px 16px;
}

.body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle {
  overflow: hidden;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--gray-10);
  font-size: var(--font-size-xs);
}

.trail {
  flex-shrink: 0;
  margin-left: auto;
}
</style>
