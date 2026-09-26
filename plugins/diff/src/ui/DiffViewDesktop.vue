<script setup lang="ts">
import { Checkbox, ScrollArea, Segmented, type SelectOption, Strip, ZoomControl } from '@arxhub/uikit/core'
import { computed, ref } from 'vue'
import type { DiffSheetTab } from '../model'
import { useDiffController } from './controller'
import DiffBody from './DiffBody.vue'
import DiffStrip from './DiffStrip.vue'
import { DIFF_LABELS, ZOOM_LABELS } from './labels'
import { DIFF_ZOOM_STEPS, type DiffViewProps } from './types'
import { useDiffView, useStopFocusSync } from './use-diff-view'

const props = defineProps<DiffViewProps>()

const controller = props.controller ?? useDiffController(() => props.result)
const root = ref<HTMLElement | null>(null)
useDiffView(controller, root)
const onFocusIn = useStopFocusSync(controller)

const model = computed(() => controller.model.value)
const icon = computed(() => props.icon ?? (props.result.model.format === 'sheets' ? 'lu:table-2' : 'lu:file-text'))
const sheets = computed(() => (model.value?.format === 'sheets' ? model.value : null))

function tabIcon(tab: DiffSheetTab): string {
  if (tab.status === 'added') return 'lu:square-plus'
  if (tab.status === 'removed') return 'lu:square-minus'
  return 'lu:table-2'
}

const tabOptions = computed<SelectOption[]>(() =>
  (sheets.value?.tabs ?? []).map((tab) => ({ value: tab.id, label: tab.name, icon: tabIcon(tab), count: tab.stops.length || undefined })),
)
const viewOptions: SelectOption[] = [
  { value: 'list', label: DIFF_LABELS.list },
  { value: 'grid', label: DIFF_LABELS.grid },
]
const grid = computed(() => controller.sheetView.value === 'grid')

function pickTab(value: string): void {
  if (value !== '') controller.tabId.value = value
}

function pickView(value: string): void {
  if (value === 'list' || value === 'grid') controller.sheetView.value = value
}
</script>

<template>
  <div
    ref="root"
    class="diff-view"
    data-testid="diff-view"
    role="region"
    :aria-label="`${result.leftLabel} → ${result.rightLabel}`"
    tabindex="-1"
    @focusin="onFocusIn"
  >
    <DiffStrip
      :controller="controller"
      :title="title"
      :icon="icon"
      :left-label="result.leftLabel"
      :right-label="result.rightLabel"
      :actions="actions"
      :open-document="openDocument"
    />
    <template v-if="sheets">
      <Strip>
        <ScrollArea axis="x" passive class="tabs">
          <Segmented
            :model-value="controller.tabId.value ?? undefined"
            :options="tabOptions"
            :aria-label="DIFF_LABELS.sheets"
            @update:model-value="pickTab"
          />
        </ScrollArea>
      </Strip>
      <Strip :flush-actions="grid">
        <Segmented :model-value="controller.sheetView.value" :options="viewOptions" :aria-label="DIFF_LABELS.view" @update:model-value="pickView" />
        <Checkbox v-if="grid" v-model="controller.onlyChangedRows.value" :label="DIFF_LABELS.onlyChangedRows" />
        <template v-if="grid" #actions>
          <ZoomControl
            v-model="controller.zoom.value"
            :min="DIFF_ZOOM_STEPS[0]"
            :max="DIFF_ZOOM_STEPS[DIFF_ZOOM_STEPS.length - 1]"
            :steps="DIFF_ZOOM_STEPS"
            :reset-to="1"
            :labels="ZOOM_LABELS"
          />
        </template>
      </Strip>
    </template>
    <DiffBody :left-label="result.leftLabel" :right-label="result.rightLabel" :side-by-side="true" />
  </div>
</template>

<style scoped>
.diff-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--gray-1);
}

.diff-view:focus {
  outline: none;
}

.tabs {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
