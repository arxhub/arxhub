<script setup lang="ts">
import { validation } from '@arxhub/errors'
import type { ArxEditorControlProps } from '@arxhub/plugin-editor/ui'
import { NOTES_TYPE_ID } from '@arxhub/plugin-notes/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { Button, Dialog, IconButton, Input, Strip } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { computed, onMounted, onUnmounted, ref, shallowRef, useId, watch } from 'vue'
import type { CalculationRequest } from '../calculation.worker'
import { embedRange, validateEmbedPath } from '../embed-model'
import { formatValue } from '../format'
import type { CellValue } from '../formula'
import { address, columnName, MAX_FILE_BYTES, rangePoints, type Sheet } from '../model'
import { parseWorkbook } from '../workbook'

const props = defineProps<ArxEditorControlProps>()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'
const hub = useArxHub(),
  vfs = hub.services.get(VaultVfs)
const root = ref<HTMLElement>(),
  setup = ref(false),
  path = ref(''),
  name = ref(''),
  range = ref(''),
  error = ref(''),
  loading = ref(false)
const values = shallowRef<Record<string, CellValue>>({}),
  sheet = shallowRef<Sheet>()
const visible = ref(false),
  id = useId()
let generation = 0,
  worker: Worker | null = null,
  observer: IntersectionObserver | null = null,
  timer: ReturnType<typeof setTimeout> | undefined,
  deadline: ReturnType<typeof setTimeout> | undefined
const bounds = computed(() => {
  try {
    return embedRange(props.node.attrs.range)
  } catch {
    return null
  }
})
const rows = computed(() =>
  bounds.value ? Array.from({ length: bounds.value.to.row - bounds.value.from.row + 1 }, (_, i) => bounds.value!.from.row + i) : [],
)
const columns = computed(() =>
  bounds.value ? Array.from({ length: bounds.value.to.column - bounds.value.from.column + 1 }, (_, i) => bounds.value!.from.column + i) : [],
)
function stop() {
  generation++
  worker?.terminate()
  worker = null
  clearTimeout(deadline)
  loading.value = false
}
async function load() {
  stop()
  const version = generation
  if (!visible.value || !props.node.attrs.path || !bounds.value) return
  loading.value = true
  error.value = ''
  try {
    validateEmbedPath(props.node.attrs.path)
    const size = (await vfs.head(props.node.attrs.path)).size
    if (size > MAX_FILE_BYTES) throw validation('Spreadsheet exceeds 8 MB')
    const book = parseWorkbook(new TextDecoder().decode(await vfs.read(props.node.attrs.path)))
    if (version !== generation) return
    const entry = props.node.attrs.sheet ? book.sheets.find((entry) => entry.name === props.node.attrs.sheet) : book.sheets[0]
    if (!entry) throw validation('Worksheet was not found')
    if (bounds.value.to.row >= entry.sheet.rows || bounds.value.to.column >= entry.sheet.columns)
      throw validation('Embedded range is outside the worksheet')
    sheet.value = entry.sheet
    worker = new Worker(new URL('../calculation.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ values?: Record<string, CellValue>; error?: string }>) => {
      if (version !== generation) return
      values.value = event.data.values ?? {}
      error.value = event.data.error ?? ''
      stop()
    }
    worker.onerror = () => {
      error.value = 'Could not calculate spreadsheet'
      stop()
    }
    deadline = setTimeout(() => {
      error.value = 'Spreadsheet calculation timed out'
      stop()
    }, 5000)
    worker.postMessage({
      id: 1,
      sheet: entry.sheet,
      book,
      active: entry.id,
      patch: {},
      rows: entry.sheet.rows,
      columns: entry.sheet.columns,
      keys: rangePoints(bounds.value.from, bounds.value.to).map(address),
    } satisfies CalculationRequest)
  } catch (cause) {
    if (version === generation) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      stop()
    }
  }
}
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    void load()
  }, 250)
}
watch(() => [props.node.attrs.path, props.node.attrs.sheet, props.node.attrs.range], schedule)
watch(visible, (value) => {
  if (value) schedule()
  else stop()
})
watch(setup, () => {
  path.value = props.node.attrs.path
  name.value = props.node.attrs.sheet
  range.value = props.node.attrs.range
})
function apply() {
  try {
    validateEmbedPath(path.value)
    embedRange(range.value)
    props.change({ path: path.value, sheet: name.value, range: range.value })
    setup.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
async function open() {
  try {
    await hub.extensions.get(ShellExtension).workspace.openObject(NOTES_TYPE_ID, { id: props.node.attrs.path })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    visible.value = entry.isIntersecting
  })
  if (root.value) observer.observe(root.value)
})
onUnmounted(
  hub.services.get(VaultWatcher).subscribe((change) => {
    if (change.pathname === props.node.attrs.path) schedule()
  }),
)
onUnmounted(() => {
  stop()
  clearTimeout(timer)
  observer?.disconnect()
})
</script>
<template>
  <div ref="root" class="sheet-embed">
    <Strip>
      <span class="embed-title" :title="node.attrs.path">{{ node.attrs.path || 'Spreadsheet' }}</span>
      <template #actions>
        <Button v-if="node.attrs.path" :size="buttonSize" variant="secondary" @click="open">Open spreadsheet</Button>
        <IconButton v-if="mode === 'editable'" size="lg" icon="lu:settings-2" tooltip="Configure spreadsheet" @click="setup = true" />
      </template>
    </Strip>
    <p v-if="error" role="alert">{{ error }} <Button :size="buttonSize" variant="secondary" @click="load">Retry</Button></p>
    <p v-else-if="!node.attrs.path">Choose a spreadsheet file and range to display.</p>
    <div v-else class="sheet-embed-scroll" :aria-busy="loading">
      <table aria-label="Embedded spreadsheet"><thead><tr><th scope="col">{{ node.attrs.sheet }}</th><th v-for="column in columns" :key="column" scope="col">{{ columnName(column) }}</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row"><th scope="row">{{ row + 1 }}</th><td v-for="column in columns" :key="column">{{ formatValue(values[address({ row, column })] ?? '', sheet?.formats?.[address({ row, column })]) }}</td></tr></tbody>
      </table>
    </div>
    <Dialog :open="setup" title="Embed spreadsheet" size="sm" @update:open="setup = $event">
      <form :id="id" class="embed-form" @submit.prevent="apply">
        <label>Vault file path<Input v-model="path" aria-label="Spreadsheet path" placeholder="Budget.arxs" /></label>
        <label>Worksheet name (blank = first)<Input v-model="name" aria-label="Embedded worksheet" maxlength="31" /></label>
        <label>Range (up to 20 × 8)<Input v-model="range" aria-label="Embedded range" placeholder="A1:D8" /></label>
        <p>Displays saved values. Open the spreadsheet to edit its source.</p>
        <p v-if="error" role="alert">{{ error }}</p>
      </form>
      <template #footer><Button :size="buttonSize" variant="secondary" type="submit" :form="id">Apply</Button></template>
    </Dialog>
  </div>
</template>
<style scoped>
.sheet-embed { border: 1px solid var(--gray-6); border-radius: var(--radius-sm); overflow: hidden; }
.embed-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sheet-embed-scroll { overflow: auto; max-height: 400px; }
table { border-collapse: collapse; font-size: var(--font-size-sm); min-width: 100%; }
th, td { border: 1px solid var(--gray-4); padding: 8px; min-width: 80px; white-space: pre-wrap; overflow-wrap: anywhere; }
th { color: var(--gray-11); background: var(--gray-2); }
p { padding: 8px; margin: 0; color: var(--gray-11); font-size: var(--font-size-sm); }
.embed-form, label { display: flex; flex-direction: column; gap: 8px; }
.embed-form { gap: 16px; }
</style>
