<script setup lang="ts">
import { formatList } from '@arxhub/i18n'
import { Button, Checkbox, Dialog, Input, Interpolated, NumberInput, RadioGroup } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref, useId, watch } from 'vue'
import { defaultFormat, type NumberKind } from '../format'
import { FUNCTIONS } from '../formula-help'
import { messages, t } from '../i18n/messages'
import { columnName, pointOf } from '../model'
import { validSheetName } from '../workbook'
import { useSheet } from './use-sheet'

const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
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
const KINDS = ['general', 'number', 'percent', 'currency', 'date'] as const
const kinds = computed(() => KINDS.map((value) => ({ value, label: t(`tools.kinds.${value}`) })))
// Formulas, addresses and codes read the same in every language, so the help quotes them as they are typed.
const SAMPLES = {
  address: 'A1',
  currency: 'USD',
  multiply: '=A1*B1',
  sum: '=SUM(C1:C10)',
  choose: '=IF(A1>0,"Yes","No")',
  absolute: '$A$1',
  fixedRow: 'A$1',
  fixedColumn: '$A1',
}
const FUNCTION_NAMES = FUNCTIONS.map((fn) => fn.name).join(', ')
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
const ADVANCED = ['xlsx', 'format', 'layout', 'rename', 'delete', 'sort', 'filter'] as const
type AdvancedTool = (typeof ADVANCED)[number]
const advanced = computed(() => (ADVANCED.find((id) => id === tool.value) ?? null) as AdvancedTool | null)
</script>

<template>
  <input ref="xlsxInput" type="file" accept=".xlsx" :aria-label="t('tools.importXlsx')" hidden @change="importExcel" />
  <input ref="fileInput" type="file" accept=".csv,text/csv" :aria-label="t('tools.importCsv')" hidden @change="importCsv" />
  <Dialog v-if="tool === 'goto'" :open="true" :title="t('tools.goto')" size="sm" @update:open="!$event && (tool = null)">
    <form :id="formId" @submit.prevent="go">
      <label class="sheet-field">{{ t('tools.address') }}<Input v-model="target" :aria-label="t('tools.address')" :placeholder="SAMPLES.address" autocomplete="off" /></label>
      <p class="sheet-hint">{{ t('tools.rows', { count: sheet?.rows ?? 0 }) }} · {{ t('tools.columns', { count: sheet?.columns ?? 0 }) }}</p>
    </form>
    <template #footer><Button :size="buttonSize" variant="secondary" type="submit" :form="formId" :disabled="!valid">{{ t('tools.go') }}</Button></template>
  </Dialog>
  <Dialog v-if="advanced" :open="true" :title="t(`tools.titles.${advanced}`)" size="sm" @update:open="!$event && !operationBusy && (tool = null)">
    <form :id="`${formId}-advanced`" class="sheet-tool-form" @submit.prevent="applyTool">
      <template v-if="advanced === 'xlsx'">
        <p>{{ t('tools.xlsxReplace', { count: importedBook?.sheets.length ?? 0 }) }}</p>
        <p>{{ formatList(importedBook?.sheets.map((entry) => entry.name) ?? [], 'unit') }}</p>
        <p class="sheet-hint">{{ t('tools.xlsxHint') }}</p>
      </template>
      <template v-if="advanced === 'format'">
        <RadioGroup v-model="formatKind" :options="kinds" :aria-label="t('tools.numberFormat')" />
        <label class="sheet-field" v-if="formatKind !== 'date' && formatKind !== 'general'">{{ t('tools.decimals') }}<NumberInput v-model="decimals" :min="0" :max="10" :aria-label="t('tools.decimals')" /></label>
        <label class="sheet-field" v-if="formatKind === 'currency'">{{ t('tools.currency') }}<Input v-model="currency" :aria-label="t('tools.currency')" maxlength="3" :placeholder="SAMPLES.currency" /></label>
        <p v-if="formatKind === 'date'" class="sheet-hint">{{ t('tools.dateHint') }}</p>
      </template>
      <template v-if="advanced === 'layout'">
        <label class="sheet-field">{{ t('tools.width') }}<NumberInput v-model="width" :min="64" :max="640" :step="4" :aria-label="t('tools.widthLabel')" unit="px" /></label>
        <Checkbox v-model="wrap" :label="t('tools.wrap')" />
        <label class="sheet-field">{{ t('tools.frozenRows') }}<NumberInput v-model="frozenRows" :min="0" :max="Math.min(3, sheet?.rows ?? 0)" :aria-label="t('tools.frozenRowsLabel')" /></label>
        <label class="sheet-field">{{ t('tools.frozenColumns') }}<NumberInput v-model="frozenColumns" :min="0" :max="Math.min(2, sheet?.columns ?? 0)" :aria-label="t('tools.frozenColumnsLabel')" /></label>
      </template>
      <template v-if="advanced === 'sort' || advanced === 'filter'">
        <p class="sheet-hint">{{ t('tools.selectedRange', { range: session.selectionLabel.value }) }}<template v-if="advanced === 'sort'"> {{ t('tools.sortHint') }}</template></p>
        <label class="sheet-field">{{ t('tools.column') }}<Input v-model="column" :aria-label="t('tools.column')" maxlength="3" /></label>
        <Checkbox v-model="header" :label="t('tools.header')" />
        <Checkbox v-if="advanced === 'sort'" v-model="descending" :label="t('tools.descending')" />
        <label class="sheet-field" v-else>{{ t('tools.contains') }}<Input v-model="filter" :aria-label="t('tools.filterText')" /></label>
        <p v-if="advanced === 'filter'" class="sheet-hint">{{ t('tools.filterHint') }}</p>
      </template>
      <label class="sheet-field" v-if="advanced === 'rename'">{{ t('tools.sheetName') }}<Input v-model="name" :aria-label="t('tools.sheetName')" maxlength="31" /></label>
      <p v-if="advanced === 'delete'">{{ t('tools.deleteConfirm', { name: sheetName }) }}</p>
    </form>
    <template #footer><Button :size="buttonSize" variant="secondary" type="submit" :form="`${formId}-advanced`" :disabled="operationBusy || advanced === 'rename' && !nameValid">{{ operationBusy ? t('tools.working') : advanced === 'delete' ? t('tools.deleteSheet') : t('tools.apply') }}</Button></template>
  </Dialog>
  <Dialog v-if="tool === 'help'" :open="true" :title="t('help.title')" size="sm" @update:open="!$event && (tool = null)">
    <p>{{ t('help.enter') }}</p>
    <p>
      <Interpolated :text="messages.raw('help.formulas')">
        <template #multiply><code>{{ SAMPLES.multiply }}</code></template>
        <template #sum><code>{{ SAMPLES.sum }}</code></template>
        <template #choose><code>{{ SAMPLES.choose }}</code></template>
      </Interpolated>
    </p>
    <p>{{ t('help.pointing') }}</p>
    <p>{{ t('help.functions', { names: FUNCTION_NAMES }) }}</p>
    <p>
      <Interpolated :text="messages.raw('help.references')">
        <template #absolute><code>{{ SAMPLES.absolute }}</code></template>
        <template #fixedRow><code>{{ SAMPLES.fixedRow }}</code></template>
        <template #fixedColumn><code>{{ SAMPLES.fixedColumn }}</code></template>
      </Interpolated>
    </p>
    <p>{{ t('help.select') }}</p>
    <p>{{ t('help.csv') }}</p>
    <p class="sheet-hint">{{ t('help.limits') }}</p>
  </Dialog>
</template>

<style scoped>
.sheet-tool-form { display: flex; flex-direction: column; gap: 16px; }
.sheet-field { display: flex; flex-direction: column; gap: 8px; }
p { margin: 0 0 12px; }
.sheet-hint { color: var(--gray-11); font-size: var(--font-size-sm); }
</style>
