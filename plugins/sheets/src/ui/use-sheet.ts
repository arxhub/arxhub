import { validation } from '@arxhub/errors'
import { useHotkeyLayer, useHotkeys } from '@arxhub/plugin-hotkeys/ui'
import { NotesExtension } from '@arxhub/plugin-notes'
import { useHotkeysExtension } from '@arxhub/plugin-shell/ui'
import { createDebouncedTask } from '@arxhub/stdlib/scheduling/debounced-task'
import { toaster, useArxHub, useFileDocument } from '@arxhub/uikit/hooks'
import { VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { computed, type InjectionKey, inject, nextTick, onMounted, onUnmounted, ref, shallowRef, toRef, triggerRef, useId, watch } from 'vue'
import type { CalculationRequest } from '../calculation.worker'
import { CLIPBOARD_TYPE, copyRange, csvPatch, exportCsv, fillRange, pasteRange } from '../clipboard'
import { type CellFormat, dateSerial, formatValue } from '../format'
import { type CellValue, displayValue } from '../formula'
import { address, emptySheet, MAX_COLUMNS, MAX_FILE_BYTES, MAX_ROWS, type Patch, type Point, rangePoints, type Sheet } from '../model'
import { autofill, editStructure, renameReferences, sortRange } from '../operations'
import { canInsertReference, insertReference, type ReferenceInsertion } from '../reference-input'
import { MAX_SHEETS, parseWorkbook, serializeWorkbook, type Workbook, WorkbookHistory } from '../workbook'
import type { XlsxRequest } from '../xlsx.worker'

export function createSheetSession(props: { path: string }) {
  const hub = useArxHub(),
    vfs = hub.services.get(VaultVfs),
    notes = hub.extensions.get(NotesExtension)
  const root = ref<HTMLElement>(),
    inputRoot = ref<HTMLElement>(),
    grid = ref<HTMLElement>()
  const xlsxInput = ref<HTMLInputElement>()
  const importedBook = shallowRef<Workbook | null>(null)
  let importedRevision = -1
  const fileInput = ref<HTMLInputElement>(),
    tool = ref<'goto' | 'help' | 'format' | 'layout' | 'sort' | 'filter' | 'rename' | 'delete' | 'xlsx' | null>(null)
  const history = shallowRef<WorkbookHistory>()
  const revision = ref(0),
    savedRevision = ref(0),
    saving = ref(false),
    saveError = ref(''),
    gone = ref(false)
  const active = ref<Point>({ row: 0, column: 0 }),
    end = ref<Point>({ row: 0, column: 0 }),
    selectingRange = ref(false)
  const draft = ref(''),
    values = shallowRef<Record<string, CellValue>>({}),
    calculating = ref(false),
    calculationError = ref('')
  const formulaCaret = ref(0)
  const formulaFocused = ref(false),
    composing = ref(false)
  const reference = shallowRef<ReferenceInsertion | null>(null)
  const referenceMode = computed(() => editable.value && formulaFocused.value && draft.value.startsWith('=') && !composing.value)
  let insertingReference = false
  let visible: string[] = [],
    worker: Worker | null = null,
    running = false,
    desired = 0,
    sentRevision = -1,
    pending: Patch = {},
    needsInit = true
  let deadline: ReturnType<typeof setTimeout> | undefined,
    frame = 0,
    disposed = false
  const hiddenRows = shallowRef(new Set<number>())
  const book = computed(() => {
    revision.value
    return history.value ? { ...history.value.book } : undefined
  })
  const sheetId = computed(() => book.value?.active ?? '')
  const sheetName = computed(() => book.value?.sheets.find((entry) => entry.id === sheetId.value)?.name ?? '')
  const sheet = computed(() => {
    revision.value
    return history.value ? { ...history.value.sheet } : undefined
  })
  const activeAddress = computed(() => address(active.value))
  const selectionLabel = computed(() =>
    address(active.value) === address(end.value) ? activeAddress.value : `${activeAddress.value}:${address(end.value)}`,
  )
  const dirty = computed(() => revision.value !== savedRevision.value || draft.value !== (sheet.value?.cells[activeAddress.value] ?? ''))
  const status = computed(() =>
    document.loading.value
      ? 'Opening…'
      : document.error.value
        ? 'Cannot open'
        : gone.value
          ? 'File deleted'
          : saving.value
            ? 'Saving…'
            : saveError.value
              ? 'Save failed'
              : dirty.value
                ? 'Unsaved'
                : 'Saved',
  )
  const canUndo = computed(() => {
    revision.value
    return history.value?.canUndo ?? false
  })
  const canRedo = computed(() => {
    revision.value
    return history.value?.canRedo ?? false
  })

  function report(error: unknown): void {
    if (disposed) return
    toaster.create({ title: 'Spreadsheet', description: error instanceof Error ? error.message : String(error), type: 'error' })
  }

  const document = useFileDocument(toRef(props, 'path'), {
    retainOnPathChange: true,
    allowMissing: false,
    read: async (path) => {
      if ((await vfs.head(path)).size > MAX_FILE_BYTES) throw validation('Spreadsheet is too large (8 MB maximum)')
      return vfs.read(path)
    },
    build: (_path, bytes) => parseWorkbook(new TextDecoder().decode(bytes)),
    apply: (_path, value) => {
      stopWorker()
      history.value = new WorkbookHistory(value)
      revision.value = 0
      savedRevision.value = 0
      saveError.value = ''
      gone.value = false
      active.value = { row: 0, column: 0 }
      end.value = active.value
      draft.value = history.value.sheet.cells[activeAddress.value] ?? ''
      recalculate()
    },
  })
  const editable = computed(() => document.canSave.value && !gone.value)

  function stopWorker(): void {
    worker?.terminate()
    worker = null
    running = false
    needsInit = true
    values.value = {}
    clearTimeout(deadline)
  }

  function failCalculation(message: string): void {
    stopWorker()
    calculating.value = false
    calculationError.value = message
    values.value = {}
  }

  function sendCalculation(): void {
    frame = 0
    if (disposed || running || !sheet.value || !visible.length || calculationError.value) return
    try {
      const missing = visible.filter((key) => sheet.value?.cells[key] !== undefined && values.value[key] === undefined)
      if (!missing.length && !needsInit && !Object.keys(pending).length) {
        calculating.value = false
        return
      }
      if (!worker) {
        worker = new Worker(new URL('../calculation.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<{ id: number; values?: Record<string, CellValue>; error?: string }>) => {
          clearTimeout(deadline)
          running = false
          if (event.data.error) {
            failCalculation(event.data.error)
            return
          }
          if (sentRevision === desired) {
            Object.assign(values.value, event.data.values)
            triggerRef(values)
          }
          sendCalculation()
        }
        worker.onerror = () => failCalculation('Calculation could not start. Save your data and retry calculation.')
      }
      const request: CalculationRequest = {
        id: desired,
        sheet: needsInit ? sheet.value : undefined,
        book: needsInit ? book.value : undefined,
        active: sheetId.value,
        patch: pending,
        rows: sheet.value.rows,
        columns: sheet.value.columns,
        keys: missing,
      }
      sentRevision = desired
      worker.postMessage(request)
      needsInit = false
      pending = {}
      running = true
      deadline = setTimeout(
        () => failCalculation('Calculation took too long and was stopped. Your inputs are safe; simplify the formulas and retry.'),
        5000,
      )
    } catch {
      failCalculation('Calculation is unavailable. Your inputs can still be edited and saved.')
    }
  }

  function recalculate(patch: Patch = {}): void {
    Object.assign(pending, patch)
    desired++
    calculating.value = true
    values.value = {}
    if (!frame) frame = requestAnimationFrame(sendCalculation)
  }

  function setVisible(keys: string[]): void {
    visible = keys
    if (!keys.length) {
      stopWorker()
      calculating.value = false
      return
    }
    if (!frame) frame = requestAnimationFrame(sendCalculation)
  }
  function retryCalculation(): void {
    calculationError.value = ''
    stopWorker()
    recalculate()
  }

  function changed(patch: Patch | null): void {
    if (!patch) return
    revision.value++
    saveError.value = ''
    recalculate(patch)
    autosave.schedule()
  }

  function apply(patch: Patch): boolean {
    if (disposed || !editable.value) return false
    try {
      changed(history.value?.apply(patch) ?? null)
      return true
    } catch (error) {
      report(error)
      return false
    }
  }

  function commit(): boolean {
    reference.value = null
    if (!editable.value) return !dirty.value
    let value = draft.value
    if (sheet.value?.formats?.[activeAddress.value]?.kind === 'date') {
      const serial = dateSerial(value)
      if (serial !== null) value = String(serial)
    }
    const result = apply({ [activeAddress.value]: value })
    if (result) draft.value = value
    return result
  }

  watch(
    draft,
    () => {
      if (!insertingReference) reference.value = null
    },
    { flush: 'sync' },
  )

  function focusFormula(): void {
    formulaFocused.value = true
  }
  function blurFormula(event?: FocusEvent): void {
    if (event?.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
      return
    formulaFocused.value = false
    commit()
  }

  function canPointReference(): boolean {
    const input = inputRoot.value?.querySelector('input')
    return (
      referenceMode.value &&
      input != null &&
      canInsertReference(draft.value, input.selectionStart ?? draft.value.length, input.selectionEnd ?? draft.value.length)
    )
  }

  function writeReference(next: ReferenceInsertion): void {
    insertingReference = true
    draft.value = next.text
    insertingReference = false
    reference.value = next
    void nextTick(() => {
      if (reference.value !== next) return
      const input = inputRoot.value?.querySelector('input')
      input?.focus({ preventScroll: true })
      input?.setSelectionRange(next.end, next.end)
    })
  }

  function pointReference(point: Point, extend = false): boolean {
    const input = inputRoot.value?.querySelector('input')
    if (!input || !canPointReference()) return false
    const start = input.selectionStart ?? draft.value.length,
      end = input.selectionEnd ?? start
    const previous = reference.value
    const continuing = previous?.text === draft.value && start === previous.end && end === start
    const next = insertReference(draft.value, start, end, extend && continuing ? previous.from : point, point, previous)
    if (!next) return false
    writeReference(next)
    return true
  }

  function extendReference(point: Point): void {
    const previous = reference.value
    if (!previous || (previous.to.row === point.row && previous.to.column === point.column)) return
    const next = insertReference(draft.value, previous.end, previous.end, previous.from, point, previous)
    if (next) writeReference(next)
  }

  function select(point: Point, extend = false): void {
    if (!commit()) return
    const value = sheet.value
    if (!value) return
    const target = { row: Math.max(0, Math.min(value.rows - 1, point.row)), column: Math.max(0, Math.min(value.columns - 1, point.column)) }
    if (!extend && !selectingRange.value) {
      active.value = target
      draft.value = value.cells[address(target)] ?? ''
    }
    end.value = target
  }

  function move(rows: number, columns: number, extend = false): void {
    const from = extend ? end.value : active.value
    let row = Math.max(0, Math.min((sheet.value?.rows ?? 1) - 1, from.row + rows))
    while (rows && hiddenRows.value.has(row) && row >= 0 && row < (sheet.value?.rows ?? 0)) row += Math.sign(rows)
    if (row < 0 || row >= (sheet.value?.rows ?? 0)) row = from.row
    select({ row, column: from.column + columns }, extend)
  }

  async function edit(initial?: string): Promise<void> {
    if (!editable.value) return
    if (initial !== undefined) draft.value = initial
    await nextTick()
    const input = inputRoot.value?.querySelector('input')
    input?.focus()
    if (initial === undefined) input?.select()
  }

  function cancelEdit(): void {
    reference.value = null
    draft.value = sheet.value?.cells[activeAddress.value] ?? ''
    grid.value?.focus()
  }
  function finishEdit(): void {
    if (commit()) {
      move(1, 0)
      grid.value?.focus()
    }
  }
  function undo(): void {
    if (!editable.value || !commit()) return
    const patch = history.value?.undo() ?? null
    if (patch) resetCalculation()
    changed(patch)
    syncSelection()
  }
  function redo(): void {
    if (!editable.value || !commit()) return
    const patch = history.value?.redo() ?? null
    if (patch) resetCalculation()
    changed(patch)
    syncSelection()
  }
  function clear(): void {
    try {
      const patch: Patch = {}
      for (const point of rangePoints(active.value, end.value)) patch[address(point)] = ''
      if (apply(patch)) draft.value = sheet.value?.cells[activeAddress.value] ?? ''
    } catch (error) {
      report(error)
    }
  }
  function grow(axis: 'rows' | 'columns'): void {
    if (!editable.value || !commit() || !sheet.value) return
    const max = axis === 'rows' ? MAX_ROWS : MAX_COLUMNS
    if (sheet.value[axis] === max) {
      report(validation(`Maximum ${max} ${axis}`))
      return
    }
    updateSheet({ ...sheet.value, [axis]: Math.min(max, sheet.value[axis] + (axis === 'rows' ? 1000 : 1)) })
  }

  function resetCalculation(): void {
    needsInit = true
    pending = {}
    hiddenRows.value = new Set()
  }
  function syncSelection(): void {
    const value = sheet.value
    if (!value) return
    active.value = { row: Math.min(active.value.row, value.rows - 1), column: Math.min(active.value.column, value.columns - 1) }
    end.value = active.value
    draft.value = value.cells[activeAddress.value] ?? ''
  }
  function replaceBook(next: Workbook): boolean {
    if (!history.value || !editable.value) return false
    try {
      if (!history.value.replace(next)) return true
      resetCalculation()
      changed({})
      syncSelection()
      return true
    } catch (error) {
      report(error)
      return false
    }
  }
  function updateSheet(value: Sheet): boolean {
    if (!book.value) return false
    return replaceBook({
      ...book.value,
      sheets: book.value.sheets.map((entry) => (entry.id === sheetId.value ? { ...entry, sheet: value } : entry)),
    })
  }
  function structure(axis: 'rows' | 'columns', remove: boolean): void {
    if (!book.value || !commit()) return
    const a = axis === 'rows' ? active.value.row : active.value.column,
      b = axis === 'rows' ? end.value.row : end.value.column
    try {
      replaceBook(editStructure(book.value, sheetId.value, axis, Math.min(a, b), Math.abs(a - b) + 1, remove))
    } catch (error) {
      report(error)
    }
  }
  function switchSheet(id: string): void {
    if (!history.value || id === sheetId.value || !commit() || !book.value?.sheets.some((entry) => entry.id === id)) return
    history.value.book.active = id
    resetCalculation()
    active.value = { row: 0, column: 0 }
    end.value = active.value
    changed({})
    draft.value = history.value.sheet.cells.A1 ?? ''
    if (grid.value) {
      grid.value.scrollTop = 0
      grid.value.scrollLeft = 0
    }
  }
  function addSheet(): void {
    if (!book.value || !commit()) return
    if (book.value.sheets.length >= MAX_SHEETS) {
      report(validation('A workbook supports at most 16 sheets'))
      return
    }
    let index = 1
    while (book.value.sheets.some((entry) => entry.name.toLowerCase() === `sheet${index}`)) index++
    const id = crypto.randomUUID()
    replaceBook({ ...book.value, active: id, sheets: [...book.value.sheets, { id, name: `Sheet${index}`, sheet: emptySheet() }] })
    active.value = { row: 0, column: 0 }
    end.value = active.value
    draft.value = ''
  }
  function renameSheet(name: string): boolean {
    if (!book.value || !commit()) return false
    const next = renameReferences(book.value, sheetName.value, name)
    return replaceBook({ ...next, sheets: next.sheets.map((entry) => (entry.id === sheetId.value ? { ...entry, name } : entry)) })
  }
  function deleteSheet(): boolean {
    if (!book.value || !commit() || book.value.sheets.length < 2) return false
    const next = renameReferences(book.value, sheetName.value, null)
    const sheets = next.sheets.filter((entry) => entry.id !== sheetId.value)
    return replaceBook({ ...next, sheets, active: sheets[0].id })
  }
  function setFormat(format: CellFormat): boolean {
    if (!sheet.value || !commit()) return false
    try {
      const formats = { ...sheet.value.formats }
      for (const point of rangePoints(active.value, end.value)) {
        const key = address(point)
        if (format.kind === 'general') delete formats[key]
        else formats[key] = { ...format }
      }
      return updateSheet({ ...sheet.value, formats })
    } catch (error) {
      report(error)
      return false
    }
  }
  function setLayout(width: number, wrap: boolean, rows: number, columns: number): boolean {
    if (!sheet.value || !commit()) return false
    const widths = { ...sheet.value.widths }
    for (let column = Math.min(active.value.column, end.value.column); column <= Math.max(active.value.column, end.value.column); column++)
      widths[column] = width
    return updateSheet({ ...sheet.value, widths, wrap, freeze: { rows, columns } })
  }
  function fillTo(target: Point): void {
    if (!sheet.value || !commit()) return
    const a = active.value,
      b = end.value
    try {
      if (updateSheet(autofill(sheet.value, a, b, target))) {
        active.value = a
        end.value = target
        draft.value = sheet.value?.cells[activeAddress.value] ?? ''
      }
    } catch (error) {
      report(error)
    }
  }
  const operationBusy = ref(false)
  async function selectionValues(keys: string[]): Promise<Record<string, CellValue>> {
    if (!sheet.value || !book.value) return {}
    return new Promise((resolve, reject) => {
      const task = new Worker(new URL('../calculation.worker.ts', import.meta.url), { type: 'module' })
      conversionWorkers.add(task)
      const finish = () => {
        clearTimeout(timer)
        task.terminate()
        conversionWorkers.delete(task)
      }
      const timer = setTimeout(() => {
        finish()
        reject(validation('The selected range took too long to calculate'))
      }, 5000)
      task.onerror = () => {
        finish()
        reject(validation('Could not calculate the selected range'))
      }
      task.onmessage = (event: MessageEvent<{ values: Record<string, CellValue>; error?: string }>) => {
        finish()
        if (event.data.error) reject(validation(event.data.error))
        else resolve(event.data.values)
      }
      task.postMessage({
        id: 1,
        sheet: sheet.value,
        book: book.value,
        active: sheetId.value,
        patch: {},
        rows: sheet.value!.rows,
        columns: sheet.value!.columns,
        keys,
      } satisfies CalculationRequest)
    })
  }
  async function sortSelection(column: number, descending: boolean, header: boolean): Promise<boolean> {
    if (!sheet.value || !commit() || operationBusy.value) return false
    operationBusy.value = true
    const version = revision.value,
      a = active.value,
      b = end.value
    try {
      const keys = rangePoints({ row: a.row, column }, { row: b.row, column }).map(address)
      const values = await selectionValues(keys)
      if (disposed || version !== revision.value) throw validation('The workbook changed; please try sorting again')
      return updateSheet(sortRange(sheet.value, a, b, column, descending, header, values))
    } catch (error) {
      report(error)
      return false
    } finally {
      operationBusy.value = false
    }
  }
  async function filterSelection(column: number, text: string, header: boolean): Promise<boolean> {
    if (!sheet.value || !commit() || operationBusy.value) return false
    if (column < Math.min(active.value.column, end.value.column) || column > Math.max(active.value.column, end.value.column)) {
      report(validation('Choose a filter column inside the selected range'))
      return false
    }
    operationBusy.value = true
    const version = revision.value,
      a = active.value,
      b = end.value
    try {
      const points = rangePoints({ row: Math.min(a.row, b.row) + Number(header), column }, { row: Math.max(a.row, b.row), column })
      const values = await selectionValues(points.map(address))
      if (disposed || version !== revision.value) throw validation('The workbook changed; please try filtering again')
      hiddenRows.value = new Set(
        points
          .filter(
            (point) =>
              !displayValue(values[address(point)] ?? '')
                .toLocaleLowerCase()
                .includes(text.toLocaleLowerCase()),
          )
          .map((point) => point.row),
      )
      return true
    } catch (error) {
      report(error)
      return false
    } finally {
      operationBusy.value = false
    }
  }

  function fill(direction: 'down' | 'right'): void {
    if (!sheet.value || !commit()) return
    try {
      if (apply(fillRange(sheet.value, active.value, end.value, direction))) draft.value = sheet.value.cells[activeAddress.value] ?? ''
    } catch (error) {
      report(error)
    }
  }

  async function importCsv(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !sheet.value || !commit()) return
    try {
      if (file.size > 2_000_000) throw validation('CSV import is limited to 2 MB')
      const patch = csvPatch(sheet.value, active.value, await file.text())
      if (apply(patch)) draft.value = sheet.value.cells[activeAddress.value] ?? ''
    } catch (error) {
      report(error)
    }
  }

  function downloadCsv(): void {
    if (!sheet.value || !commit()) return
    try {
      const url = URL.createObjectURL(new Blob(['\uFEFF', exportCsv(sheet.value)], { type: 'text/csv;charset=utf-8' }))
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download =
        props.path
          .split('/')
          .pop()
          ?.replace(/\.arxs$/i, '.csv') ?? 'spreadsheet.csv'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      report(error)
    }
  }

  const conversionWorkers = new Set<Worker>()
  async function convertXlsx(request: XlsxRequest): Promise<{ book?: Workbook; bytes?: ArrayBuffer }> {
    return new Promise((resolve, reject) => {
      const task = new Worker(new URL('../xlsx.worker.ts', import.meta.url), { type: 'module' })
      conversionWorkers.add(task)
      const finish = () => {
        clearTimeout(timer)
        task.terminate()
        conversionWorkers.delete(task)
      }
      const timer = setTimeout(() => {
        finish()
        reject(validation('XLSX conversion exceeded 15 seconds'))
      }, 15_000)
      task.onerror = () => {
        finish()
        reject(validation('XLSX conversion could not start'))
      }
      task.onmessage = (event: MessageEvent<{ book?: Workbook; bytes?: ArrayBuffer; error?: string }>) => {
        finish()
        if (event.data.error) reject(validation(event.data.error))
        else resolve(event.data)
      }
      task.postMessage(request, request.kind === 'import' ? [request.bytes] : [])
    })
  }
  async function importExcel(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0]
    input.value = ''
    if (!file || !commit() || operationBusy.value) return
    operationBusy.value = true
    importedRevision = revision.value
    try {
      if (file.size > MAX_FILE_BYTES) throw validation('XLSX import is limited to 8 MB')
      const result = await convertXlsx({ kind: 'import', bytes: await file.arrayBuffer() })
      if (disposed || importedRevision !== revision.value) throw validation('The workbook changed; import again to avoid replacing newer edits')
      if (result.book) {
        importedBook.value = result.book
        tool.value = 'xlsx'
      }
    } catch (error) {
      report(error)
    } finally {
      operationBusy.value = false
    }
  }
  function applyImport(): boolean {
    if (!importedBook.value || !commit()) return false
    if (importedRevision !== revision.value) {
      report(validation('The workbook changed; import again'))
      return false
    }
    const success = replaceBook(importedBook.value)
    if (success) importedBook.value = null
    return success
  }
  async function downloadExcel(): Promise<void> {
    if (!book.value || !commit() || operationBusy.value) return
    operationBusy.value = true
    try {
      const result = await convertXlsx({ kind: 'export', book: book.value })
      if (!result.bytes || disposed) return
      const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download =
        props.path
          .split('/')
          .pop()
          ?.replace(/\.arxs$/i, '.xlsx') ?? 'workbook.xlsx'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      report(error)
    } finally {
      operationBusy.value = false
    }
  }

  function onCopy(event: ClipboardEvent): void {
    if (!sheet.value || !commit()) return
    try {
      const data = copyRange(sheet.value, active.value, end.value)
      event.clipboardData?.setData('text/plain', data.text)
      event.clipboardData?.setData(CLIPBOARD_TYPE, data.internal)
      event.preventDefault()
    } catch (error) {
      report(error)
      event.preventDefault()
    }
  }
  function onPaste(event: ClipboardEvent): void {
    event.preventDefault()
    if (!sheet.value || !commit() || !event.clipboardData) return
    try {
      const data = event.clipboardData
      if (apply(pasteRange(sheet.value, active.value, data.getData('text/plain'), data.getData(CLIPBOARD_TYPE)))) {
        draft.value = sheet.value.cells[activeAddress.value] ?? ''
      }
    } catch (error) {
      report(error)
    }
  }
  let localClipboard: ReturnType<typeof copyRange> | null = null
  async function copy(): Promise<void> {
    if (!sheet.value || !commit()) return
    try {
      localClipboard = copyRange(sheet.value, active.value, end.value)
      await navigator.clipboard.writeText(localClipboard.text)
    } catch (error) {
      report(error)
    }
  }
  async function paste(): Promise<void> {
    if (!sheet.value || !commit()) return
    try {
      const text = await navigator.clipboard.readText()
      if (apply(pasteRange(sheet.value, active.value, text, localClipboard?.text === text ? localClipboard.internal : ''))) {
        draft.value = sheet.value.cells[activeAddress.value] ?? ''
      }
    } catch {
      report(validation('Clipboard access is unavailable. Focus the grid and paste with your keyboard.'))
    }
  }

  async function doSave(): Promise<void> {
    if (!editable.value || !sheet.value || savedRevision.value === revision.value) return
    const target = props.path,
      version = revision.value
    saving.value = true
    try {
      if (!(await vfs.exists(target)) || gone.value) throw validation('The file no longer exists. Saving was stopped to avoid recreating it.')
      if (disposed || target !== props.path) return
      const bytes = new TextEncoder().encode(serializeWorkbook(history.value!.book))
      if (bytes.length > MAX_FILE_BYTES) throw validation('The encoded spreadsheet exceeds 8 MB. Reduce the contents or undo the last change.')
      await vfs.write(target, bytes)
      if (target === props.path) savedRevision.value = version
      saveError.value = ''
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : String(error)
      hub.logger.error(`[sheets] could not save ${target}`, error)
      report(error)
      throw error
    } finally {
      saving.value = false
      // A debounce that expired during this write joined it; schedule the newer revision again.
      if (!disposed && editable.value && !saveError.value && revision.value !== savedRevision.value) autosave.schedule()
    }
  }
  const autosave = createDebouncedTask({ run: doSave, debounceMs: 1000 })
  let closing: Promise<boolean> | null = null
  function beforeClose(): Promise<boolean> {
    if (closing) return closing
    closing = (async () => {
      if (!commit()) return false
      try {
        while (savedRevision.value !== revision.value) {
          if (!editable.value) return false
          await autosave.flush()
          if (!commit()) return false
        }
        return true
      } catch {
        return false
      }
    })().finally(() => {
      closing = null
    })
    return closing
  }
  async function save(): Promise<void> {
    await beforeClose()
  }
  onUnmounted(
    notes.registerOpenView(
      () => props.path,
      () => false,
      beforeClose,
    ),
  )
  onUnmounted(
    hub.services.get(VaultWatcher).subscribe((change) => {
      if (change.kind === 'deleted' && (change.pathname === props.path || props.path.startsWith(`${change.pathname}/`))) {
        gone.value = true
        autosave.cancel()
      }
    }),
  )
  watch(
    () => props.path,
    () => {
      if (editable.value) changed({})
    },
  )

  const layer = `sheets:${useId()}`
  const hotkeys = useHotkeysExtension()
  useHotkeyLayer(hotkeys, { id: layer, kind: 'editor' }, root)
  useHotkeys(hotkeys, [
    {
      id: `${layer}.save`,
      chord: 'Mod-s',
      layer,
      title: 'Save spreadsheet',
      run: () => {
        void save()
      },
    },
    ...[
      ['Mod-z', 'undo', undo],
      ['Mod-Shift-z', 'redo', redo],
      ['Mod-y', 'redo-alt', redo],
    ].map(([chord, id, run]) => ({
      id: `${layer}.${id}`,
      chord: String(chord),
      layer,
      title: String(id),
      when: () => !inputRoot.value?.contains(window.document.activeElement),
      run: run as () => void,
    })),
  ])
  onUnmounted(() => {
    disposed = true
    for (const worker of conversionWorkers) worker.terminate()
    conversionWorkers.clear()
    autosave.cancel()
    stopWorker()
    cancelAnimationFrame(frame)
  })

  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!dirty.value || !editable.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))

  function cellText(key: string): string {
    const value = values.value[key]
    if (value !== undefined) return formatValue(value, sheet.value?.formats?.[key])
    const raw = sheet.value?.cells[key] ?? ''
    return raw.startsWith('=') ? (calculationError.value ? '#CALC!' : '…') : raw.startsWith("'") ? raw.slice(1) : raw
  }

  return {
    xlsxInput,
    importedBook,
    importExcel,
    applyImport,
    downloadExcel,
    book,
    sheetId,
    sheetName,
    switchSheet,
    addSheet,
    renameSheet,
    deleteSheet,
    structure,
    setFormat,
    setLayout,
    fillTo,
    sortSelection,
    filterSelection,
    hiddenRows,
    operationBusy,
    formulaCaret,
    formulaFocused,
    composing,
    reference,
    referenceMode,
    focusFormula,
    blurFormula,
    canPointReference,
    pointReference,
    extendReference,
    root,
    inputRoot,
    grid,
    sheet,
    revision,
    active,
    end,
    draft,
    values,
    calculating,
    calculationError,
    selectingRange,
    fileInput,
    tool,
    importCsv,
    downloadCsv,
    fill,
    activeAddress,
    selectionLabel,
    dirty,
    status,
    canUndo,
    canRedo,
    editable,
    document,
    saveError,
    reload: () => document.reload(props.path),
    setVisible,
    retryCalculation,
    select,
    move,
    edit,
    cancelEdit,
    finishEdit,
    commit,
    undo,
    redo,
    clear,
    grow,
    onCopy,
    onPaste,
    copy,
    paste,
    save,
    cellText,
  }
}

export type SheetSession = ReturnType<typeof createSheetSession>
export const sheetSessionKey: InjectionKey<SheetSession> = Symbol('sheet-session')
export function useSheet(): SheetSession {
  const session = inject(sheetSessionKey)
  if (!session) throw validation('Spreadsheet session is unavailable')
  return session
}
