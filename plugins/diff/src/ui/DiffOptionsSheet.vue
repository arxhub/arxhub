<script setup lang="ts">
import { type ActionItem, BottomSheet, Checkbox, Icon, Row, Segmented, type SelectOption, ZoomControl } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { t } from '../i18n/messages'
import type { DiffController } from './controller'
import DiffSummary from './DiffSummary.vue'
import { zoomLabels } from './labels'
import { DIFF_ZOOM_STEPS } from './types'

// The phone's «…»: everything the desktop strip shows at once and the band has no room for — what is compared,
// how a workbook is drawn, and the occasional actions.
const props = defineProps<{
  open: boolean
  controller: DiffController
  leftLabel: string
  rightLabel: string
  actions?: readonly ActionItem[]
  openDocument?: () => void
}>()

const emit = defineEmits<{ close: [] }>()

const sheets = computed(() => props.controller.model.value?.format === 'sheets')
const grid = computed(() => props.controller.sheetView.value === 'grid')
const viewOptions = computed<SelectOption[]>(() => [
  { value: 'list', label: t('list') },
  { value: 'grid', label: t('grid') },
])

// The source row is offered only when there is a raw diff to switch to, or to switch back from.
const sourceAvailable = computed(() => props.controller.showSource.value || props.controller.result.value?.source() != null)

function pickView(value: string): void {
  if (value === 'list' || value === 'grid') props.controller.sheetView.value = value
}

function toggleSource(): void {
  props.controller.showSource.value = !props.controller.showSource.value
  emit('close')
}

function runOpenDocument(): void {
  props.openDocument?.()
  emit('close')
}

function run(action: ActionItem): void {
  if (action.disabled) return
  action.onSelect()
  emit('close')
}
</script>

<template>
  <BottomSheet :open="open" :title="t('menuTitle')" @close="emit('close')">
    <div class="options" data-testid="diff-options">
      <Row plain wrap class="info">
        <span class="text">
          <span>{{ leftLabel }} → {{ rightLabel }}</span>
          <DiffSummary :counts="controller.counts.value" />
        </span>
      </Row>
      <template v-if="sheets">
        <Row plain class="option">
          <span class="text">{{ t('view') }}</span>
          <Segmented
            class="control"
            stretch
            :model-value="controller.sheetView.value"
            :options="viewOptions"
            :aria-label="t('view')"
            @update:model-value="pickView"
          />
        </Row>
        <Row v-if="grid" plain class="option">
          <span class="text">{{ t('rows') }}</span>
          <Checkbox v-model="controller.onlyChangedRows.value" :label="t('onlyChangedRows')" />
        </Row>
        <!-- Zoom scales the grid only; the list has nothing it would change. -->
        <Row v-if="grid" plain class="option">
          <span class="text">
            <span>{{ t('zoom') }}</span>
            <span class="meta">{{ t('zoomHint') }}</span>
          </span>
          <ZoomControl
            v-model="controller.zoom.value"
            :min="DIFF_ZOOM_STEPS[0]"
            :max="DIFF_ZOOM_STEPS[DIFF_ZOOM_STEPS.length - 1]"
            :steps="DIFF_ZOOM_STEPS"
            :reset-to="1"
            :labels="zoomLabels()"
          />
        </Row>
      </template>
      <Row v-if="sourceAvailable" as="button" data-testid="diff-source" @click="toggleSource">
        <Icon name="lu:code" :size="16" />
        <span class="text">{{ controller.showSource.value ? t('showDiff') : t('showSource') }}</span>
      </Row>
      <Row v-if="props.openDocument" as="button" data-testid="diff-open-document" @click="runOpenDocument">
        <Icon name="lu:file-text" :size="16" />
        <span class="text">{{ t('openDocument') }}</span>
      </Row>
      <Row
        v-for="action in actions ?? []"
        :key="action.id"
        as="button"
        :disabled="action.disabled"
        :tone="action.tone ?? 'neutral'"
        @click="run(action)"
      >
        <Icon v-if="action.icon" :name="action.icon" :size="16" />
        <span class="text">{{ action.label }}</span>
      </Row>
    </div>
  </BottomSheet>
</template>

<style scoped>
.options {
  display: flex;
  flex-direction: column;
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.info .text {
  gap: 4px;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.meta {
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.control {
  flex: 1 1 auto;
}
</style>
