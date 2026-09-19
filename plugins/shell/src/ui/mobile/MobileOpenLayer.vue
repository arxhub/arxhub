<script setup lang="ts">
import { BottomSheet, Icon, Row } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { TabType } from '../tab-type'
import type { Workspace } from '../workspace'

const props = defineProps<{ open: boolean; type: TabType | null; workspace: Workspace }>()
const emit = defineEmits<{ close: [] }>()

// The second level: what is open inside the type. It is the answer to the question a browser solves
// with tabs on top of tabs — the row holds types, and the objects live behind the counter, because
// there are thousands of objects and a closed handful of types.
const tabs = computed(() => (props.type == null ? [] : props.workspace.tabsOf(props.type.id)))

function pick(key: string): void {
  if (props.type == null) return
  props.workspace.activateObject(props.type.id, key)
  emit('close')
}

function drop(key: string): void {
  if (props.type == null) return
  props.workspace.closeObject(props.type.id, key)
}
</script>

<template>
  <BottomSheet :open="props.open" :label="props.type?.open?.title ?? 'Open'" @close="emit('close')">
    <div class="open-list" role="menu" aria-label="Open documents">
      <p v-if="tabs.length === 0" class="empty">Nothing is open in this type yet.</p>
      <div v-for="tab in tabs" :key="tab.key" class="entry" :data-testid="`open:${tab.typeId}:${tab.key}`">
        <Row as="button" type="button" role="menuitem" wrap class="entry-main" @click="pick(tab.key)">
          <span class="entry-body">
            <span class="entry-title">{{ tab.title }}</span>
            <span v-if="tab.subtitle" class="entry-subtitle">{{ tab.subtitle }}</span>
          </span>
          <span v-if="tab.gone" class="entry-note">Gone</span>
        </Row>
        <button type="button" class="entry-close" :aria-label="`Close ${tab.title}`" @click="drop(tab.key)">
          <Icon name="lu:x" :size="16" />
        </button>
      </div>
    </div>
  </BottomSheet>
</template>

<style scoped>
.open-list {
  display: flex;
  flex-direction: column;
  padding: 0 8px;
}

.empty {
  margin: 0;
  padding: 16px;
  color: var(--gray-10);
  font-size: var(--font-size-sm);
}

.entry {
  display: flex;
  align-items: stretch;
}

.entry-main {
  flex: 1;
  min-width: 0;
}

.entry-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.entry-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-subtitle {
  overflow: hidden;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-note {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--gray-10);
  font-size: var(--font-size-xs);
}

.entry-close {
  display: flex;
  width: var(--size-xl);
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  cursor: pointer;
}

.entry-close:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}
</style>
