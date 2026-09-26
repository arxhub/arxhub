<script setup lang="ts">
import { type ActionItem, ActionMenuButton, Icon, IconButton, Segmented, Strip } from '@arxhub/uikit/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { collapsedCount } from '../strip-collapse'
import type { DiffController } from './controller'
import DiffSummary from './DiffSummary.vue'
import { changesLabel, DIFF_LABELS, positionLabel } from './labels'
import type { DiffLayout } from './types'

const props = defineProps<{
  controller: DiffController
  title: string
  icon: string
  leftLabel: string
  rightLabel: string
  actions?: readonly ActionItem[]
  openDocument?: () => void
}>()

const meta = computed(() => `${props.leftLabel} → ${props.rightLabel}`)
const counts = computed(() => props.controller.counts.value)
const total = computed(() => props.controller.stops.value.length)
const counter = computed(() =>
  total.value === 0
    ? ''
    : props.controller.current.value < 0
      ? changesLabel(total.value)
      : positionLabel(props.controller.current.value, total.value),
)
const layoutApplies = computed(() => {
  const format = props.controller.model.value?.format
  return format === 'blocks' || format === 'text'
})
const layoutOptions = [
  { value: 'stream', label: DIFF_LABELS.stream },
  { value: 'side', label: DIFF_LABELS.side },
]

function setLayout(value: string): void {
  if (value === 'stream' || value === 'side') props.controller.layout.value = value satisfies DiffLayout
}

// Why not OverflowActions: it partitions equal-width icon actions, and these three are text of different widths
// that drop in a fixed order — the «…» they fall into is the same ActionMenuButton it uses.
type Part = 'meta' | 'summary' | 'segment'
const host = ref<HTMLElement | null>(null)
const metaEl = ref<HTMLElement | null>(null)
const summaryEl = ref<HTMLElement | null>(null)
const segmentEl = ref<HTMLElement | null>(null)
const fixedEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const widths: Record<Part, number> = { meta: 0, summary: 0, segment: 0 }
const hidden = ref<ReadonlySet<Part>>(new Set())

// A name cut to a few letters still says which file this is; below that the name is gone, so parts drop first.
const TITLE_MIN = 96
const GAP = 8
const ICON = 14
const INSET = 8

const parts = computed<Part[]>(() => {
  const list: Part[] = ['meta']
  if (total.value > 0) list.push('summary')
  if (layoutApplies.value) list.push('segment')
  return list
})

function remember(part: Part, element: HTMLElement | null): void {
  // Only while shown: a hidden part measures 0, and its last shown width is what it would cost to bring back.
  if (element != null && element.offsetParent !== null) widths[part] = element.offsetWidth
}

function measure(): void {
  const strip = host.value
  if (strip == null) return
  remember('meta', metaEl.value)
  remember('summary', summaryEl.value)
  remember('segment', segmentEl.value)
  const fixed = INSET + ICON + GAP + TITLE_MIN + GAP + (fixedEl.value?.offsetWidth ?? 0) + (menuEl.value?.offsetWidth ?? 0)
  const list = parts.value
  const count = collapsedCount(
    strip.clientWidth,
    fixed,
    list.map((part) => widths[part]),
    GAP,
  )
  const next = new Set(list.slice(0, count))
  const current = hidden.value
  if (next.size !== current.size || [...next].some((part) => !current.has(part))) hidden.value = next
}

let observer: ResizeObserver | null = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && host.value != null) {
    observer = new ResizeObserver(() => measure())
    observer.observe(host.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch([counter, counts, meta, parts, () => props.title], () => nextTick(measure))

const shown = (part: Part): boolean => !hidden.value.has(part)

function menuItems(): ActionItem[] {
  const items: ActionItem[] = []
  const result = props.controller.result.value
  if (props.controller.showSource.value || result?.source() != null) {
    items.push({
      id: 'diff.source',
      label: props.controller.showSource.value ? DIFF_LABELS.showDiff : DIFF_LABELS.showSource,
      icon: 'lu:code',
      onSelect: () => {
        props.controller.showSource.value = !props.controller.showSource.value
      },
    })
  }
  if (layoutApplies.value && !shown('segment')) {
    const side = props.controller.layout.value === 'side'
    items.push({
      id: 'diff.layout',
      label: side ? DIFF_LABELS.showStream : DIFF_LABELS.showSide,
      icon: side ? 'lu:rows-3' : 'lu:columns-2',
      onSelect: () => setLayout(side ? 'stream' : 'side'),
    })
  }
  if (props.openDocument != null) {
    const open = props.openDocument
    items.push({ id: 'diff.open', label: DIFF_LABELS.openDocument, icon: 'lu:file-text', opensObject: true, onSelect: () => open() })
  }
  items.push(...(props.actions ?? []))
  return items
}
</script>

<template>
  <div ref="host" class="diff-strip">
    <Strip flush-actions>
      <Icon :name="icon" :size="14" />
      <span class="title">{{ title }}</span>
      <span v-show="shown('meta')" ref="metaEl" class="meta">{{ meta }}</span>
      <template #actions>
        <span v-show="shown('summary') && total > 0" ref="summaryEl" class="summary" data-testid="diff-summary">
          <DiffSummary :counts="counts" />
        </span>
        <span ref="fixedEl" class="fixed">
          <span v-if="counter" class="counter" data-testid="diff-counter">{{ counter }}</span>
          <IconButton
            size="lg"
            icon="lu:arrow-up"
            :tooltip="DIFF_LABELS.previous"
            :disabled="total === 0"
            data-testid="diff-previous"
            @click="controller.step(-1)"
          />
          <IconButton
            size="lg"
            icon="lu:arrow-down"
            :tooltip="DIFF_LABELS.next"
            :disabled="total === 0"
            data-testid="diff-next"
            @click="controller.step(1)"
          />
        </span>
        <span v-show="shown('segment') && layoutApplies" ref="segmentEl" class="segment">
          <Segmented
            :model-value="controller.layout.value"
            :options="layoutOptions"
            :aria-label="DIFF_LABELS.layout"
            @update:model-value="setLayout"
          />
        </span>
        <span ref="menuEl" class="fixed">
          <ActionMenuButton :label="DIFF_LABELS.more" :title="DIFF_LABELS.menuTitle" :items="menuItems" />
        </span>
      </template>
    </Strip>
  </div>
</template>

<style scoped>
.diff-strip {
  flex: none;
  min-width: 0;
}

.title {
  min-width: 0;
  overflow: hidden;
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.meta {
  flex: none;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.summary {
  display: inline-flex;
  flex: none;
  margin-right: 4px;
}

.segment {
  display: inline-flex;
  flex: none;
  margin: 0 4px;
}

.fixed {
  display: inline-flex;
  align-items: center;
  flex: none;
}

.counter {
  margin: 0 4px;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
