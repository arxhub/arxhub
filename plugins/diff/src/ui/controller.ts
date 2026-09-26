import { type ComputedRef, computed, type MaybeRefOrGetter, type Ref, ref, type ShallowRef, shallowRef, toValue, watch } from 'vue'
import type { DiffCounts, DiffModel, DiffResult, DiffStop } from '../model'
import { countsOf, stopsOf } from '../stops'
import type { DiffLayout, SheetView } from './types'

export interface DiffReveal {
  target: string
  // Bumped on every step, so stepping onto the same stop twice (a list of one) still reveals it again.
  seq: number
}

export interface DiffController {
  readonly result: Readonly<ShallowRef<DiffResult | null>>
  readonly showSource: Ref<boolean>
  readonly model: ComputedRef<DiffModel | null>
  readonly layout: Ref<DiffLayout>
  readonly sheetView: Ref<SheetView>
  readonly onlyChangedRows: Ref<boolean>
  readonly zoom: Ref<number>
  readonly tabId: Ref<string | null>
  readonly stops: ComputedRef<readonly DiffStop[]>
  readonly counts: ComputedRef<DiffCounts>
  readonly current: Ref<number>
  readonly currentStop: ComputedRef<DiffStop | null>
  readonly expanded: ShallowRef<ReadonlySet<string>>
  expand(foldId: string): void
  step(direction: 1 | -1): void
  goTo(index: number): void
  readonly reveal: ShallowRef<DiffReveal | null>
}

const NO_COUNTS: DiffCounts = { added: 0, removed: 0, changed: 0 }

// The state of one diff on screen, with no DOM: both frames and an external band (the phone's dock) read and
// step the same object, which is what keeps "k из n" in the band and the focused change in the view in step.
export function useDiffController(source: MaybeRefOrGetter<DiffResult | null>): DiffController {
  const result = shallowRef<DiffResult | null>(null)
  const showSource = ref(false)
  const layout = ref<DiffLayout>('stream')
  const sheetView = ref<SheetView>('list')
  const onlyChangedRows = ref(true)
  const zoom = ref(1)
  const tabId = ref<string | null>(null)
  const current = ref(-1)
  const expanded = shallowRef<ReadonlySet<string>>(new Set())
  const reveal = shallowRef<DiffReveal | null>(null)

  const model = computed<DiffModel | null>(() => {
    const value = result.value
    if (value == null) return null
    return showSource.value ? (value.source() ?? value.model) : value.model
  })
  const stops = computed<readonly DiffStop[]>(() => (model.value == null ? [] : stopsOf(model.value, tabId.value)))
  const counts = computed<DiffCounts>(() => (model.value == null ? NO_COUNTS : countsOf(model.value, tabId.value)))
  const currentStop = computed(() => stops.value[current.value] ?? null)

  // Synchronous, so a reset lands before anything reads the new result — a "k из n" of the previous file
  // for one frame is the bug a post-flush watcher would buy.
  watch(
    () => toValue(source),
    (next) => {
      result.value = next
      showSource.value = false
      expanded.value = new Set()
      reveal.value = null
      tabId.value = next?.model.format === 'sheets' ? next.model.initialTab : null
      current.value = -1
    },
    { immediate: true, flush: 'sync' },
  )
  // A position means nothing in another list of stops.
  watch(
    [tabId, showSource],
    () => {
      current.value = -1
    },
    { flush: 'sync' },
  )

  function goTo(index: number): void {
    const target = stops.value[index]
    if (target == null) return
    current.value = index
    reveal.value = { target: target.target, seq: (reveal.value?.seq ?? 0) + 1 }
  }

  function step(direction: 1 | -1): void {
    const n = stops.value.length
    if (n === 0) return
    if (current.value < 0 || current.value >= n) goTo(direction === 1 ? 0 : n - 1)
    else goTo((current.value + direction + n) % n)
  }

  function expand(foldId: string): void {
    if (expanded.value.has(foldId)) return
    const next = new Set(expanded.value)
    next.add(foldId)
    expanded.value = next
  }

  return {
    result,
    showSource,
    model,
    layout,
    sheetView,
    onlyChangedRows,
    zoom,
    tabId,
    stops,
    counts,
    current,
    currentStop,
    expanded,
    expand,
    step,
    goTo,
    reveal,
  }
}
