<script setup lang="ts">
import { ScrollArea, SectionLabel } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'
import type { DiffSheetTab } from '../model'
import { rowGroupLabel } from './labels'
import { useDiffViewContext } from './use-diff-view'

const props = defineProps<{ tab: DiffSheetTab }>()
const { touch } = useDiffViewContext()

function targetOf(stop: number): string | undefined {
  return props.tab.stops[stop]?.target
}
</script>

<template>
  <ScrollArea class="sheet-list" :class="{ touch }">
    <div class="groups">
      <template v-for="group in tab.groups" :key="group.row">
        <SectionLabel class="group-label">{{ rowGroupLabel(group.row, group.context) }}</SectionLabel>
        <div
          v-for="cell in group.cells"
          :key="cell.address"
          class="cell"
          :data-change="cell.change"
          :data-diff-stop="targetOf(cell.stop)"
          tabindex="-1"
        >
          <span class="address">{{ cell.address }}</span>
          <span class="value">
            <span class="caption">{{ cell.caption ?? t('noCaption') }}</span>
            <template v-if="cell.change === 'changed'">
              <span class="before">{{ cell.before }}</span><span class="arrow" aria-hidden="true">→</span><span class="after">{{ cell.after }}</span>
            </template>
            <span v-else-if="cell.change === 'added'" class="after">{{ cell.after }}</span>
            <span v-else class="before">{{ cell.before }}</span>
          </span>
        </div>
      </template>
    </div>
  </ScrollArea>
</template>

<style scoped>
.sheet-list {
  flex: 1 1 auto;
}

.groups {
  display: flex;
  flex-direction: column;
  padding-bottom: 8px;
}

.group-label {
  padding: 12px 12px 4px;
}

.touch .group-label {
  padding: 16px 16px 4px;
}

.cell {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: var(--size-2xs);
  margin: 0 8px 4px;
  padding: 4px 12px 4px 8px;
  border-radius: var(--radius-xs);
  box-sizing: border-box;
}

.touch .cell {
  min-height: var(--size-xl);
}

.cell[data-change='changed'] {
  background: var(--gray-3);
}

.cell[data-change='added'] {
  background: var(--success-3);
}

.cell[data-change='removed'] {
  background: var(--danger-3);
}

.cell:focus {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.address {
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.value {
  color: var(--gray-12);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}

.touch .value {
  font-size: var(--font-size-md);
}

.caption {
  display: block;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.before {
  color: var(--danger-11);
  text-decoration: line-through;
}

.after {
  color: var(--success-12);
}

/* An arrow between two values is punctuation of the content, not an icon of the chrome (DS-6). */
.arrow {
  padding: 0 4px;
  color: var(--gray-10);
}
</style>
