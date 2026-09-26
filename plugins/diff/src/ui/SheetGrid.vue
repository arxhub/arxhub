<script setup lang="ts">
import { ScrollArea } from '@arxhub/uikit/core'
import { computed, ref } from 'vue'
import type { DiffSheetTab } from '../model'
import DiffFold from './DiffFold.vue'
import { rowGapLabel } from './labels'
import { cellsByPosition, columnName, gridRows, positionKey } from './sheet-view'
import { DIFF_ZOOM_STEPS } from './types'
import { useDiffViewContext } from './use-diff-view'
import { usePinchZoom } from './use-pinch-zoom'

const props = defineProps<{ tab: DiffSheetTab }>()
const { controller, touch } = useDiffViewContext()

const columns = computed(() => Array.from({ length: props.tab.grid.columns }, (_, column) => ({ column, name: columnName(column) })))
const placed = computed(() => cellsByPosition(props.tab.grid.cells))
const rows = computed(() => gridRows(props.tab.grid, controller.onlyChangedRows.value, controller.expanded.value, `${props.tab.id}:rows`))

function cellAt(row: number, column: number) {
  return placed.value.get(positionKey(row, column))?.cell
}

function targetOf(stop: number | undefined): string | undefined {
  return stop == null ? undefined : props.tab.stops[stop]?.target
}

const area = ref<{ viewport: HTMLElement | null } | null>(null)
const viewport = computed(() => (touch ? (area.value?.viewport ?? null) : null))
const { live } = usePinchZoom(viewport, controller.zoom, DIFF_ZOOM_STEPS)
const zoom = computed(() => live.value ?? controller.zoom.value)
</script>

<template>
  <ScrollArea ref="area" axis="both" class="sheet-grid">
    <table class="grid" :style="{ '--diff-zoom': zoom }">
      <thead>
        <tr>
          <th class="corner" />
          <th v-for="column in columns" :key="column.column" scope="col">{{ column.name }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="entry in rows" :key="entry.kind === 'gap' ? entry.id : entry.row">
          <tr v-if="entry.kind === 'gap'" class="gap">
            <td :colspan="columns.length + 1">
              <div class="gap-label">
                <DiffFold :label="rowGapLabel(entry.first, entry.last)" @expand="controller.expand(entry.id)" />
              </div>
            </td>
          </tr>
          <tr v-else>
            <th class="row-head" scope="row">{{ entry.row + 1 }}</th>
            <template v-for="column in columns" :key="column.column">
              <td
                v-if="cellAt(entry.row, column.column)?.change === 'changed'"
                class="changed"
                :data-diff-stop="targetOf(cellAt(entry.row, column.column)?.stop)"
                tabindex="-1"
              >
                <span class="old">{{ cellAt(entry.row, column.column)?.before }}</span>
                <span class="new">{{ cellAt(entry.row, column.column)?.value }}</span>
              </td>
              <td
                v-else-if="cellAt(entry.row, column.column)?.change"
                :class="cellAt(entry.row, column.column)?.change"
                :data-diff-stop="targetOf(cellAt(entry.row, column.column)?.stop)"
                tabindex="-1"
              >
                {{ cellAt(entry.row, column.column)?.value }}
              </td>
              <td v-else>{{ cellAt(entry.row, column.column)?.value }}</td>
            </template>
          </tr>
        </template>
      </tbody>
    </table>
  </ScrollArea>
</template>

<style scoped>
.sheet-grid {
  flex: 1 1 auto;
}

.grid {
  border-collapse: separate;
  border-spacing: 0;
  font-family: var(--font-mono);
}

th,
td {
  box-sizing: border-box;
  padding: 0 8px;
  border-right: 1px solid var(--gray-6);
  border-bottom: 1px solid var(--gray-6);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}

/* design-ignore: zoom scales the sheet's own content, not the chrome — like note body text, the chrome ramp does
   not apply inside it, and `--diff-zoom` is set on this table only.
   The row header keeps its chrome size so the numbers stay readable at 75%. */
td,
thead th:not(.corner) {
  height: calc(var(--size-2xs) * var(--diff-zoom));
  min-width: calc(88px * var(--diff-zoom));
  font-size: calc(var(--font-size-xs) * var(--diff-zoom));
}

th {
  position: sticky;
  z-index: 1;
  background: var(--gray-2);
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-align: center;
}

thead th {
  top: 0;
}

.row-head,
.corner {
  left: 0;
  min-width: var(--size-md);
  height: var(--size-2xs);
}

.corner {
  z-index: 2;
}

td {
  color: var(--gray-11);
}

td.added {
  background: var(--success-3);
  color: var(--success-12);
  box-shadow: inset 2px 0 0 var(--success-9);
}

td.removed {
  background: var(--danger-3);
  color: var(--danger-11);
  text-decoration: line-through;
  box-shadow: inset 2px 0 0 var(--danger-9);
}

td.changed {
  padding: 4px 8px;
  background: var(--gray-3);
  color: var(--gray-12);
  box-shadow: inset 2px 0 0 var(--gray-8);
}

/* A corner mark besides the tint, so an added or changed cell reads without its colour. */
td.added::before,
td.changed::before {
  content: '';
  float: right;
  width: 0;
  height: 0;
  margin: -4px -8px 0 4px;
  border-style: solid;
  border-width: 0 8px 8px 0;
}

td.changed::before {
  margin-top: -8px;
}

td.added::before {
  border-color: transparent var(--success-9) transparent transparent;
}

td.changed::before {
  border-color: transparent var(--gray-9) transparent transparent;
}

.old {
  display: block;
  color: var(--danger-11);
  text-decoration: line-through;
}

.new {
  display: block;
  color: var(--success-12);
}

td[data-diff-stop]:focus {
  outline: 2px solid var(--accent-8);
  outline-offset: -2px;
}

tr.gap td {
  padding: 0;
  border-right: none;
  background: transparent;
}

/* Sticky, so the label stays in view however far the grid is scrolled sideways. */
.gap-label {
  position: sticky;
  left: 0;
  display: inline-block;
  min-width: 320px;
}

.gap-label > .diff-fold {
  margin: 0;
  border-top: none;
  border-bottom: none;
}
</style>
