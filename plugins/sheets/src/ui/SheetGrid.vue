<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { address, columnName, type Point, pointOf } from '../model'
import { formulaReferences } from '../references'
import { useSheet } from './use-sheet'

const props = defineProps<{ rowHeight: number; columnWidth: number }>()
const session = useSheet()
const { grid, sheet, active, end, select, move, edit, clear, setVisible, cellText, onCopy, onPaste, editable } = session
const { referenceMode, canPointReference, pointReference, extendReference, hiddenRows, fillTo } = session
const id = useId()
const x = ref(0),
  y = ref(0),
  width = ref(0),
  height = ref(0)
let observer: ResizeObserver | null = null,
  frame = 0
const fillTarget = ref<Point | null>(null)
let pointer: { id: number; x: number; y: number; mode: 'reference' | 'fill' } | null = null
let pointFrame = 0,
  suppressClick = false
const indexes = (start: number, count: number, max: number) =>
  Array.from({ length: Math.max(0, Math.min(count, max - start)) }, (_, i) => start + i)
const cellHeight = computed(() => props.rowHeight * (sheet.value?.wrap ? 2 : 1))
const rowOrder = computed(() => Array.from({ length: sheet.value?.rows ?? 0 }, (_, i) => i).filter((row) => !hiddenRows.value.has(row)))
const rowPositions = computed(() => new Map(rowOrder.value.map((row, i) => [row, i])))
const columnSize = (column: number) => sheet.value?.widths?.[column] ?? props.columnWidth
const columnOffsets = computed(() => {
  const offsets = [48]
  for (let c = 0; c < (sheet.value?.columns ?? 0); c++) offsets.push(offsets[c] + columnSize(c))
  return offsets
})
const frozenRowCount = computed(() => Math.min(sheet.value?.freeze?.rows ?? 0, Math.max(0, Math.floor(height.value / cellHeight.value / 2))))
const frozenColumnCount = computed(() => {
  let count = Math.min(sheet.value?.freeze?.columns ?? 0, sheet.value?.columns ?? 0)
  while (count && columnOffsets.value[count] > Math.max(48, width.value - 64)) count--
  return count
})
const rows = computed(() => [
  ...new Set([
    ...rowOrder.value.slice(0, frozenRowCount.value),
    ...indexes(
      Math.max(0, Math.floor(y.value / cellHeight.value) - 2),
      Math.ceil(height.value / cellHeight.value) + 4,
      rowOrder.value.length,
    ).map((i) => rowOrder.value[i]),
  ]),
])
const columns = computed(() =>
  Array.from({ length: sheet.value?.columns ?? 0 }, (_, i) => i).filter(
    (c) =>
      c < frozenColumnCount.value ||
      (columnOffsets.value[c + 1] >= x.value - props.columnWidth && columnOffsets.value[c] <= x.value + width.value + props.columnWidth),
  ),
)
const canvasWidth = computed(() => columnOffsets.value.at(-1) ?? 48)
const canvasHeight = computed(() => (rowOrder.value.length + 1) * cellHeight.value)
const rowTop = (row: number) =>
  ((rowPositions.value.get(row) ?? 0) + 1) * cellHeight.value + ((rowPositions.value.get(row) ?? 0) < frozenRowCount.value ? y.value : 0)
const columnLeft = (column: number) => columnOffsets.value[column] + (column < frozenColumnCount.value ? x.value : 0)
const handle = computed(() => {
  const row = Math.max(active.value.row, end.value.row),
    column = Math.max(active.value.column, end.value.column)
  return rows.value.includes(row) && columns.value.includes(column) && editable.value && !session.formulaFocused.value && !hiddenRows.value.size
    ? { left: `${columnLeft(column) + columnSize(column) - 16}px`, top: `${rowTop(row) + cellHeight.value - 16}px` }
    : undefined
})
const keys = computed(() =>
  width.value > 0 && height.value > 0 ? rows.value.flatMap((row) => columns.value.map((column) => address({ row, column }))) : [],
)
const activeId = computed(() => (keys.value.includes(address(active.value)) ? `${id}-${address(active.value)}` : undefined))
watch(keys, setVisible, { immediate: true })
function measure(): void {
  frame = 0
  if (!grid.value) return
  x.value = grid.value.scrollLeft
  y.value = grid.value.scrollTop
  width.value = grid.value.clientWidth
  height.value = grid.value.clientHeight
}
function schedule(): void {
  if (!frame) frame = requestAnimationFrame(measure)
}
onMounted(() => {
  observer = new ResizeObserver(schedule)
  if (grid.value) observer.observe(grid.value)
  measure()
})
onUnmounted(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
  stopPointing()
})

const referenceColors = ['var(--accent-11)', 'var(--success-11)', 'var(--warning-11)', 'var(--danger-11)']
const paintedReferences = computed(() =>
  session.formulaFocused.value
    ? formulaReferences(session.draft.value)
        .slice(0, 32)
        .flatMap((ref, index) => {
          if (ref.sheet && ref.sheet.toLowerCase() !== session.sheetName.value.toLowerCase()) return []
          const from = pointOf(ref.from),
            to = pointOf(ref.to ?? ref.from)
          return from && to ? [{ from, to, color: referenceColors[index % referenceColors.length] }] : []
        })
    : [],
)
function referenceColor(row: number, column: number): string | undefined {
  return paintedReferences.value.find(
    (range) =>
      row >= Math.min(range.from.row, range.to.row) &&
      row <= Math.max(range.from.row, range.to.row) &&
      column >= Math.min(range.from.column, range.to.column) &&
      column <= Math.max(range.from.column, range.to.column),
  )?.color
}
function referenced(row: number, column: number): boolean {
  return referenceColor(row, column) !== undefined
}

function pointerCell(clientX: number, clientY: number): Point | null {
  const element = grid.value,
    value = sheet.value
  if (!element || !value) return null
  const rect = element.getBoundingClientRect()
  const localY = clientY - rect.top
  const localX = clientX - rect.left
  const sheetY = localY + (localY < (frozenRowCount.value + 1) * cellHeight.value ? 0 : element.scrollTop)
  const sheetX = localX + (localX < columnOffsets.value[frozenColumnCount.value] ? 0 : element.scrollLeft)
  const position = Math.max(0, Math.min(rowOrder.value.length - 1, Math.floor(sheetY / cellHeight.value) - 1))
  const column = columnOffsets.value.findIndex((offset, i) => i > 0 && offset > sheetX) - 1
  return { row: rowOrder.value[position] ?? 0, column: column < 0 ? value.columns - 1 : column }
}

function pointTick(): void {
  if (!pointer || !grid.value) return
  const element = grid.value,
    rect = element.getBoundingClientRect()
  const speed = (position: number, low: number, high: number) =>
    position < low ? -Math.min(24, low - position) : position > high ? Math.min(24, position - high) : 0
  const dx = speed(pointer.x, rect.left + 64, rect.right - 16)
  const dy = speed(pointer.y, rect.top + (frozenRowCount.value + 1) * cellHeight.value + 16, rect.bottom - 16)
  if (dx || dy) {
    element.scrollLeft += dx
    element.scrollTop += dy
    schedule()
  }
  const point = pointerCell(pointer.x, pointer.y)
  if (point) {
    if (pointer.mode === 'fill') {
      if (fillTarget.value?.row !== point.row || fillTarget.value?.column !== point.column) fillTarget.value = point
    } else extendReference(point)
  }
  pointFrame = requestAnimationFrame(pointTick)
}

function startPointing(event: PointerEvent): void {
  suppressClick = false
  if (event.button !== 0 || !event.isPrimary) return
  if (event.target instanceof Element && event.target.closest('.fill-handle')) {
    event.preventDefault()
    suppressClick = true
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: 'fill' }
    grid.value?.setPointerCapture(event.pointerId)
    pointFrame = requestAnimationFrame(pointTick)
    return
  }
  if (!canPointReference()) return
  const cell = event.target instanceof Element ? event.target.closest('[role="gridcell"]') : null
  const point = pointOf(cell?.getAttribute('aria-label') ?? '')
  if (!point || !pointReference(point, event.shiftKey)) return
  event.preventDefault()
  suppressClick = true
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: 'reference' }
  grid.value?.setPointerCapture(event.pointerId)
  pointFrame = requestAnimationFrame(pointTick)
}

function movePointer(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.id) return
  pointer.x = event.clientX
  pointer.y = event.clientY
}

function stopPointing(): void {
  cancelAnimationFrame(pointFrame)
  const id = pointer?.id
  pointer = null
  fillTarget.value = null
  if (id !== undefined && grid.value?.hasPointerCapture(id)) grid.value.releasePointerCapture(id)
}

function finishPointing(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.id) return
  if (event.type === 'pointerup') {
    const point = pointerCell(event.clientX, event.clientY)
    if (point) {
      if (pointer.mode === 'fill') fillTo(point)
      else extendReference(point)
    }
  }
  stopPointing()
}

function consumeReferenceClick(event: MouseEvent): void {
  if (!suppressClick) return
  suppressClick = false
  event.preventDefault()
  event.stopPropagation()
}

watch(referenceMode, (mode) => {
  if (!mode && pointer?.mode === 'reference') stopPointing()
})

function fillPreview(row: number, column: number): boolean {
  const target = fillTarget.value
  if (!target) return false
  const top = Math.min(active.value.row, end.value.row),
    bottom = Math.max(active.value.row, end.value.row)
  const left = Math.min(active.value.column, end.value.column),
    right = Math.max(active.value.column, end.value.column)
  const vertical = target.row < top || target.row > bottom
  return vertical
    ? column >= left && column <= right && row >= Math.min(top, target.row) && row <= Math.max(bottom, target.row)
    : row >= top && row <= bottom && column >= Math.min(left, target.column) && column <= Math.max(right, target.column)
}
function isSelected(row: number, column: number): boolean {
  return (
    row >= Math.min(active.value.row, end.value.row) &&
    row <= Math.max(active.value.row, end.value.row) &&
    column >= Math.min(active.value.column, end.value.column) &&
    column <= Math.max(active.value.column, end.value.column)
  )
}
function choose(point: Point, event: MouseEvent): void {
  select(point, event.shiftKey)
  grid.value?.focus({ preventScroll: true })
}
watch([end, height, width], async ([point]) => {
  await nextTick()
  const element = grid.value
  if (!element) return
  const left = columnOffsets.value[point.column],
    top = ((rowPositions.value.get(point.row) ?? 0) + 1) * cellHeight.value
  if (point.column >= frozenColumnCount.value && left < element.scrollLeft + columnOffsets.value[frozenColumnCount.value])
    element.scrollLeft = left - columnOffsets.value[frozenColumnCount.value]
  else if (left + columnSize(point.column) > element.scrollLeft + element.clientWidth)
    element.scrollLeft = left + columnSize(point.column) - element.clientWidth
  if (
    (rowPositions.value.get(point.row) ?? 0) >= frozenRowCount.value &&
    top < element.scrollTop + (frozenRowCount.value + 1) * cellHeight.value
  )
    element.scrollTop = top - (frozenRowCount.value + 1) * cellHeight.value
  else if (top + cellHeight.value > element.scrollTop + element.clientHeight) element.scrollTop = top + cellHeight.value - element.clientHeight
  schedule()
})
function keydown(event: KeyboardEvent): void {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
  const directions: Record<string, [number, number]> = {
    ArrowDown: [1, 0],
    ArrowUp: [-1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    Tab: [0, event.shiftKey ? -1 : 1],
  }
  if (directions[event.key]) {
    event.preventDefault()
    move(...directions[event.key], event.key !== 'Tab' && event.shiftKey)
  } else if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault()
    void edit()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    clear()
  } else if (event.key === 'Home') {
    event.preventDefault()
    select({ row: active.value.row, column: 0 }, event.shiftKey)
  } else if (event.key === 'End') {
    event.preventDefault()
    select({ row: active.value.row, column: (sheet.value?.columns ?? 1) - 1 }, event.shiftKey)
  } else if (event.key === 'PageDown' || event.key === 'PageUp') {
    event.preventDefault()
    move(Math.max(1, Math.floor(height.value / cellHeight.value) - 1) * (event.key === 'PageDown' ? 1 : -1), 0, event.shiftKey)
  } else if (event.key.length === 1 && editable.value) {
    event.preventDefault()
    void edit(event.key)
  }
}
</script>

<template>
  <div ref="grid" class="sheet-grid" :class="{ 'reference-mode': referenceMode }" role="grid" aria-label="Spreadsheet" :aria-rowcount="(sheet?.rows ?? 0) + 1"
    :aria-colcount="(sheet?.columns ?? 0) + 1" :aria-activedescendant="activeId" aria-multiselectable="true" tabindex="0"
    @scroll.passive="schedule" @keydown="keydown" @copy="onCopy" @paste="onPaste"
    @pointerdown="startPointing" @pointermove="movePointer" @pointerup="finishPointing" @pointercancel="finishPointing"
    @lostpointercapture="stopPointing" @click.capture="consumeReferenceClick">
    <div class="sheet-canvas" :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }">
      <div v-for="row in rows" :key="row" role="row" :aria-rowindex="row + 2" class="sheet-grid-row"
        :class="{ 'frozen-row': (rowPositions.get(row) ?? 0) < frozenRowCount }" :style="{ top: `${rowTop(row)}px`, height: `${cellHeight}px`, width: `${canvasWidth}px` }">
        <div role="rowheader" :aria-colindex="1" class="sheet-cell sheet-heading sheet-row-heading" :style="{ left: `${x}px`, width: '48px' }">{{ row + 1 }}</div>
        <div v-for="column in columns" :id="`${id}-${address({row, column})}`" :key="column" role="gridcell" :aria-colindex="column + 2"
          :aria-label="address({row, column})" :aria-selected="isSelected(row, column)" class="sheet-cell"
          :class="{ selected: isSelected(row, column), 'fill-preview': fillPreview(row, column), referenced: referenced(row, column), active: row === active.row && column === active.column, 'cell-error': cellText(address({row, column})).startsWith('#'), 'frozen-column': column < frozenColumnCount, wrapped: sheet?.wrap }"
          :style="{ left: `${columnLeft(column)}px`, width: `${columnSize(column)}px`, '--reference-color': referenceColor(row, column) }"
          :title="cellText(address({row, column}))" @click="choose({row, column}, $event)" @dblclick="!referenceMode && edit()">
          {{ cellText(address({row, column})) }}
        </div>
      </div>
      <div role="row" :aria-rowindex="1" class="sheet-grid-row sheet-column-headings"
        :style="{ top: `${y}px`, height: `${cellHeight}px`, width: `${canvasWidth}px` }">
        <div v-for="column in columns" :key="column" role="columnheader" :aria-colindex="column + 2" class="sheet-cell sheet-heading" :class="{ 'frozen-column': column < frozenColumnCount }"
          :style="{ left: `${columnLeft(column)}px`, width: `${columnSize(column)}px` }">{{ columnName(column) }}</div>
        <div role="columnheader" :aria-colindex="1" aria-label="Row" class="sheet-cell sheet-heading sheet-corner" :style="{ left: `${x}px`, width: '48px' }" />
      </div>
      <div v-if="handle" class="fill-handle" :style="handle"><IconButton icon="lu:grip" tooltip="Drag to autofill" @keydown.enter.prevent="session.tool.value = 'help'" /></div>
    </div>
  </div>
</template>

<style scoped>
.sheet-grid { flex: 1; min-height: 0; min-width: 0; overflow: auto; overscroll-behavior: contain; position: relative; touch-action: pan-x pan-y; }
.sheet-grid:focus-visible { outline: 2px solid var(--accent-8); outline-offset: -1px; }
.sheet-grid.reference-mode { touch-action: none; }
.sheet-canvas { position: relative; contain: layout style; }
.sheet-grid-row { position: absolute; left: 0; }
.sheet-cell { position: absolute; top: 0; height: 100%; display: flex; align-items: center; padding: 0 8px; border-right: 1px solid var(--gray-4); border-bottom: 1px solid var(--gray-4); color: var(--gray-12); background: var(--gray-1); white-space: nowrap; overflow: hidden; user-select: none; font-variant-numeric: tabular-nums; cursor: cell; }
.sheet-heading { justify-content: center; background: var(--gray-2); color: var(--gray-11); font-family: var(--font-mono); font-size: var(--font-size-xs); cursor: default; }
.sheet-row-heading { z-index: 4; }
.sheet-cell.frozen-column { z-index: 3; }
.sheet-grid-row.frozen-row { z-index: 5; }
.sheet-cell.wrapped { white-space: pre-wrap; overflow-wrap: anywhere; align-items: flex-start; padding-top: 4px; }
.fill-handle { position: absolute; z-index: 7; touch-action: none; }
.sheet-column-headings { z-index: 8; }
.sheet-corner { z-index: 9; }
.sheet-cell.selected { background: var(--accent-3); color: var(--accent-11); }
.sheet-cell.active { outline: 2px solid var(--accent-8); outline-offset: -2px; }
.sheet-cell.fill-preview { outline: 1px dashed var(--accent-8); outline-offset: -1px; }
.sheet-cell.referenced { background: var(--accent-3); color: var(--accent-11); outline: 1px dashed var(--reference-color, var(--accent-8)); outline-offset: -1px; }
.sheet-cell.cell-error { color: var(--danger-11); }
</style>
