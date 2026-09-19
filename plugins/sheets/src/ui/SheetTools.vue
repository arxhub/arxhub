<script setup lang="ts">
import { Button, Checkbox, Dialog, Input, NumberInput, RadioGroup } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref, useId, watch } from 'vue'
import { defaultFormat, type NumberKind } from '../format'
import { columnName, pointOf } from '../model'
import { validSheetName } from '../workbook'
import { useSheet } from './use-sheet'

const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'
const session = useSheet()
const {
  xlsxInput,
  importedBook,
  importExcel,
  fileInput,
  tool,
  importCsv,
  sheet,
  select,
  activeAddress,
  grid,
  selectingRange,
  sheetName,
  book,
  active,
  operationBusy,
} = session
const formatKind = ref('general'),
  decimals = ref(2),
  currency = ref('USD'),
  width = ref(120),
  wrap = ref(false),
  frozenRows = ref(0),
  frozenColumns = ref(0)
const column = ref('A'),
  descending = ref(false),
  header = ref(true),
  filter = ref(''),
  name = ref('')
const kinds = ['general', 'number', 'percent', 'currency', 'date'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))
const target = ref(''),
  formId = useId()
watch(tool, () => {
  target.value = activeAddress.value
  const format = sheet.value?.formats?.[activeAddress.value] ?? defaultFormat
  formatKind.value = format.kind
  decimals.value = format.decimals
  currency.value = format.currency
  width.value = sheet.value?.widths?.[active.value.column] ?? 120
  wrap.value = sheet.value?.wrap ?? false
  frozenRows.value = sheet.value?.freeze?.rows ?? 0
  frozenColumns.value = sheet.value?.freeze?.columns ?? 0
  column.value = columnName(active.value.column)
  name.value = sheetName.value
})
const point = computed(() => pointOf(target.value.trim()))
const valid = computed(() => point.value && sheet.value && point.value.row < sheet.value.rows && point.value.column < sheet.value.columns)
function go() {
  if (!point.value || !valid.value) return
  selectingRange.value = false
  select(point.value)
  tool.value = null
  grid.value?.focus()
}
const nameValid = computed(
  () =>
    validSheetName(name.value) &&
    !book.value?.sheets.some((entry) => entry.name.toLowerCase() === name.value.toLowerCase() && entry.name !== sheetName.value),
)
async function applyTool() {
  let done = false
  if (tool.value === 'xlsx') done = session.applyImport()
  if (tool.value === 'format')
    done = session.setFormat({ kind: formatKind.value as NumberKind, decimals: decimals.value, currency: currency.value.toUpperCase() })
  if (tool.value === 'layout') done = session.setLayout(Math.round(width.value / 4) * 4, wrap.value, frozenRows.value, frozenColumns.value)
  if (tool.value === 'rename' && nameValid.value) done = session.renameSheet(name.value)
  if (tool.value === 'delete') done = session.deleteSheet()
  const point = pointOf(`${column.value.trim()}1`)
  if (tool.value === 'sort' && point) done = await session.sortSelection(point.column, descending.value, header.value)
  if (tool.value === 'filter' && point) done = await session.filterSelection(point.column, filter.value, header.value)
  if (done) tool.value = null
}
const titles = {
  xlsx: 'Import XLSX workbook',
  format: 'Format cells',
  layout: 'Sheet layout',
  rename: 'Rename sheet',
  delete: 'Delete sheet',
  sort: 'Sort selected range',
  filter: 'Filter selected range',
}
const advanced = computed(() => (tool.value && tool.value in titles ? (tool.value as keyof typeof titles) : null))
</script>

<template>
  <input ref="xlsxInput" type="file" accept=".xlsx" aria-label="Import XLSX" hidden @change="importExcel" />
  <input ref="fileInput" type="file" accept=".csv,text/csv" aria-label="Import CSV" hidden @change="importCsv" />
  <Dialog v-if="tool === 'goto'" :open="true" title="Go to cell" size="sm" @update:open="!$event && (tool = null)">
    <form :id="formId" @submit.prevent="go">
      <label class="sheet-field">Cell address<Input v-model="target" aria-label="Cell address" placeholder="A1" autocomplete="off" /></label>
      <p class="sheet-hint">{{ sheet?.rows.toLocaleString() }} rows · {{ sheet?.columns }} columns</p>
    </form>
    <template #footer><Button :size="buttonSize" variant="secondary" type="submit" :form="formId" :disabled="!valid">Go</Button></template>
  </Dialog>
  <Dialog v-if="advanced" :open="true" :title="titles[advanced]" size="sm" @update:open="!$event && !operationBusy && (tool = null)">
    <form :id="`${formId}-advanced`" class="sheet-tool-form" @submit.prevent="applyTool">
      <template v-if="advanced === 'xlsx'">
        <p>Replace this workbook with {{ importedBook?.sheets.length }} imported sheets? Undo restores the current workbook.</p>
        <p>{{ importedBook?.sheets.map((entry) => entry.name).join(', ') }}</p>
        <p class="sheet-hint">Imports cell values, formulas, basic number formats, column widths and frozen panes. Charts, images, comments, custom styles and filter settings are not imported. Unsupported functions remain as formulas and show #NAME?.</p>
      </template>
      <template v-if="advanced === 'format'">
        <RadioGroup v-model="formatKind" :options="kinds" aria-label="Number format" />
        <label class="sheet-field" v-if="formatKind !== 'date' && formatKind !== 'general'">Decimal places<NumberInput v-model="decimals" :min="0" :max="10" aria-label="Decimal places" /></label>
        <label class="sheet-field" v-if="formatKind === 'currency'">Currency code<Input v-model="currency" aria-label="Currency code" maxlength="3" placeholder="USD" /></label>
        <p v-if="formatKind === 'date'" class="sheet-hint">Enter dates as YYYY-MM-DD. Dates are stored as serial numbers and display in your locale.</p>
      </template>
      <template v-if="advanced === 'layout'">
        <label class="sheet-field">Selected column width<NumberInput v-model="width" :min="64" :max="640" :step="4" aria-label="Column width" unit="px" /></label>
        <Checkbox v-model="wrap" label="Wrap text (taller rows)" />
        <label class="sheet-field">Frozen top rows<NumberInput v-model="frozenRows" :min="0" :max="Math.min(3, sheet?.rows ?? 0)" aria-label="Frozen rows" /></label>
        <label class="sheet-field">Frozen left columns<NumberInput v-model="frozenColumns" :min="0" :max="Math.min(2, sheet?.columns ?? 0)" aria-label="Frozen columns" /></label>
      </template>
      <template v-if="advanced === 'sort' || advanced === 'filter'">
        <p class="sheet-hint">Selected range: {{ session.selectionLabel.value }}.<template v-if="advanced === 'sort'"> Sorting moves only this rectangle; select all related columns.</template></p>
        <label class="sheet-field">Column letter<Input v-model="column" aria-label="Column letter" maxlength="3" /></label>
        <Checkbox v-model="header" label="First row is a header" />
        <Checkbox v-if="advanced === 'sort'" v-model="descending" label="Descending order" />
        <label class="sheet-field" v-else>Contains<Input v-model="filter" aria-label="Filter text" /></label>
        <p v-if="advanced === 'filter'" class="sheet-hint">The filter hides nonmatching rows for this view. Clear filter shows them again. Structural edits clear the filter.</p>
      </template>
      <label class="sheet-field" v-if="advanced === 'rename'">Sheet name<Input v-model="name" aria-label="Sheet name" maxlength="31" /></label>
      <p v-if="advanced === 'delete'">Delete “{{ sheetName }}”? References to this sheet become #REF!. You can undo this operation.</p>
    </form>
    <template #footer><Button :size="buttonSize" variant="secondary" type="submit" :form="`${formId}-advanced`" :disabled="operationBusy || advanced === 'rename' && !nameValid">{{ operationBusy ? 'Working…' : advanced === 'delete' ? 'Delete sheet' : 'Apply' }}</Button></template>
  </Dialog>
  <Dialog v-if="tool === 'help'" :open="true" title="Spreadsheet help" size="sm" @update:open="!$event && (tool = null)">
    <p>Tap a cell, then enter a value or formula in the input. Enter applies it and moves down. Escape cancels the input.</p>
    <p><code>=A1*B1</code> multiplies two cells. <code>=SUM(C1:C10)</code> totals a range. <code>=IF(A1&gt;0,"Yes","No")</code> chooses a value.</p>
    <p>While typing a formula, click a cell or drag across cells to insert its reference or range at the caret. The input stays focused. Type an operator to pick another argument; Escape cancels the edit.</p>
    <p>Functions: SUM, AVERAGE, MIN, MAX, COUNT, IF, ABS, ROUND. Use English names, a decimal point, and commas or semicolons between arguments.</p>
    <p><code>$A$1</code> stays fixed when copied; <code>A$1</code> fixes the row and <code>$A1</code> the column. Begin with an apostrophe to keep a value as text.</p>
    <p>Use Shift + arrows or Shift + click to select a range. On a phone, choose Select range and tap its other corner. Fill down copies the top row with adjusted formulas; Fill right copies the left column.</p>
    <p>CSV imports into the selected cell and overwrites that rectangle; Undo restores it. CSV export preserves formula text. CSV uses commas, quoted cells and UTF-8.</p>
    <p class="sheet-hint">Up to 16 sheets · up to 10,000 rows, 256 columns and 50,000 filled cells. Clipboard, CSV and fill operations support up to 50,000 cells. #LIMIT! means a formula exceeded the calculation limits; split it into smaller steps.</p>
  </Dialog>
</template>

<style scoped>
.sheet-tool-form { display: flex; flex-direction: column; gap: 16px; }
.sheet-field { display: flex; flex-direction: column; gap: 8px; }
p { margin: 0 0 12px; }
.sheet-hint { color: var(--gray-11); font-size: var(--font-size-sm); }
</style>
