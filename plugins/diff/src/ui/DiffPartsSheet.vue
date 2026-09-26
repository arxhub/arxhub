<script setup lang="ts">
import { BottomSheet, Icon, Row } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { DiffSheetTab } from '../model'
import { sheetPartMeta } from './labels'
import type { DiffPart } from './types'

// What the band's name opens on the phone: the pieces of what is compared — a proposal's files, a workbook's
// sheets — and, under the part that is open, its sheets one level down. Picking either is navigation, so the
// sheet closes behind it.
const props = defineProps<{
  open: boolean
  title: string
  parts: readonly DiffPart[]
  activePart?: string
  tabs: readonly DiffSheetTab[]
  activeTab: string | null
}>()

const emit = defineEmits<{ close: []; pickPart: [id: string]; pickTab: [id: string] }>()

const PART_ICONS: Record<NonNullable<DiffPart['change']>, string> = {
  added: 'lu:square-plus',
  removed: 'lu:square-minus',
  changed: 'lu:square-pen',
  moved: 'lu:move',
  renamed: 'lu:square-pen',
}

function partIcon(part: DiffPart): string {
  return part.icon ?? (part.change != null ? PART_ICONS[part.change] : 'lu:file-text')
}

function tabIcon(tab: DiffSheetTab): string {
  if (tab.status === 'added') return 'lu:square-plus'
  if (tab.status === 'removed') return 'lu:square-minus'
  return 'lu:table-2'
}

type Entry = { kind: 'part'; part: DiffPart } | { kind: 'tab'; tab: DiffSheetTab; depth: number }

// Without host parts the sheets are the list itself; with them they hang under the part that is open.
const entries = computed<Entry[]>(() => {
  const tabs = (depth: number): Entry[] => props.tabs.map((tab) => ({ kind: 'tab', tab, depth }))
  if (props.parts.length === 0) return tabs(0)
  return props.parts.flatMap((part): Entry[] => [{ kind: 'part', part }, ...(part.id === props.activePart ? tabs(1) : [])])
})

function pickPart(id: string): void {
  emit('pickPart', id)
  emit('close')
}

function pickTab(id: string): void {
  emit('pickTab', id)
  emit('close')
}
</script>

<template>
  <BottomSheet :open="open" :title="title" @close="emit('close')">
    <div class="parts" data-testid="diff-parts">
      <template v-for="entry in entries" :key="entry.kind === 'part' ? `part:${entry.part.id}` : `tab:${entry.tab.id}`">
        <Row v-if="entry.kind === 'part'" as="button" :selected="entry.part.id === activePart" @click="pickPart(entry.part.id)">
          <Icon :name="partIcon(entry.part)" :size="16" />
          <span class="text">
            <span class="label">{{ entry.part.label }}</span>
            <span v-if="entry.part.meta" class="meta">{{ entry.part.meta }}</span>
          </span>
        </Row>
        <Row
          v-else
          as="button"
          :depth="entry.depth"
          :selected="entry.tab.id === activeTab"
          :tone="entry.tab.status === 'removed' ? 'danger' : 'neutral'"
          @click="pickTab(entry.tab.id)"
        >
          <Icon :name="tabIcon(entry.tab)" :size="16" />
          <span class="text">
            <span class="label">{{ entry.tab.name }}</span>
            <span class="meta">{{ sheetPartMeta(entry.tab.status, entry.tab.stops.length) }}</span>
          </span>
        </Row>
      </template>
    </div>
  </BottomSheet>
</template>

<style scoped>
.parts {
  display: flex;
  flex-direction: column;
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.label,
.meta {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.meta {
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

/* A selected row's text is the accent; its second line follows rather than staying grey under it. */
.selected .meta {
  color: var(--accent-11);
}
</style>
