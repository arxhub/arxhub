<script setup lang="ts">
import { Icon, IconButton } from '@arxhub/uikit/core'
import { computed, ref } from 'vue'
import DiffOptionsSheet from './DiffOptionsSheet.vue'
import DiffPartsSheet from './DiffPartsSheet.vue'
import { BAND_LABELS, counterLabel, DIFF_LABELS } from './labels'
import type { DiffBandProps } from './types'

// The phone's controls for an open diff, in the band above the type row (the host docks it): nothing of the diff
// is interactive at the top of the screen, and the road taken every few seconds — the next change — sits under the
// right thumb.
const props = defineProps<DiffBandProps>()
const emit = defineEmits<{ 'update:activePart': [id: string] }>()

const result = computed(() => props.controller.result.value)
const sheets = computed(() => {
  const model = props.controller.model.value
  return model?.format === 'sheets' ? model : null
})
const tabs = computed(() => sheets.value?.tabs ?? [])
const activeTab = computed(() => tabs.value.find((tab) => tab.id === props.controller.tabId.value) ?? null)
const hostParts = computed(() => props.parts ?? [])

// The name opens something only when there is something to choose between; otherwise a chevron would promise a
// layer that holds one row.
const hasParts = computed(() => hostParts.value.length > 1 || tabs.value.length > 1)
const icon = computed(() => props.icon ?? (result.value?.model.format === 'sheets' ? 'lu:table-2' : 'lu:file-text'))
const name = computed(() => (activeTab.value != null ? `${props.title} · ${activeTab.value.name}` : props.title))
const partsTitle = computed(() => props.partsTitle ?? (hostParts.value.length === 0 && sheets.value != null ? DIFF_LABELS.sheets : props.title))

const total = computed(() => props.controller.stops.value.length)
const counter = computed(() => counterLabel(props.controller.current.value, total.value))

const layer = ref<'parts' | 'options' | null>(null)

function pickTab(id: string): void {
  props.controller.tabId.value = id
}
</script>

<template>
  <div class="diff-band" data-testid="diff-band">
    <button
      v-if="hasParts"
      type="button"
      class="name"
      :class="{ open: layer === 'parts' }"
      :aria-label="`${name} · ${BAND_LABELS.parts}`"
      aria-haspopup="dialog"
      :aria-expanded="layer === 'parts'"
      data-testid="diff-band-parts"
      @click="layer = 'parts'"
    >
      <Icon :name="icon" :size="16" />
      <span class="title">{{ name }}</span>
      <Icon name="lu:chevron-up" :size="16" />
    </button>
    <div v-else class="name label">
      <Icon :name="icon" :size="16" />
      <span class="title">{{ name }}</span>
    </div>
    <span v-if="counter" class="counter" data-testid="diff-counter">{{ counter }}</span>
    <span class="key">
      <IconButton
        size="xl"
        :aria-label="DIFF_LABELS.previousTitle"
        :disabled="total === 0"
        data-testid="diff-previous"
        @click="controller.step(-1)"
      >
        <Icon name="lu:arrow-up" :size="16" />
      </IconButton>
    </span>
    <span class="key">
      <IconButton size="xl" :aria-label="DIFF_LABELS.nextTitle" :disabled="total === 0" data-testid="diff-next" @click="controller.step(1)">
        <Icon name="lu:arrow-down" :size="16" />
      </IconButton>
    </span>
    <span class="key">
      <IconButton
        size="xl"
        :aria-label="DIFF_LABELS.more"
        :active="layer === 'options'"
        aria-haspopup="dialog"
        data-testid="diff-more"
        @click="layer = 'options'"
      >
        <Icon name="lu:ellipsis" :size="16" />
      </IconButton>
    </span>

    <DiffPartsSheet
      :open="layer === 'parts'"
      :title="partsTitle"
      :parts="hostParts"
      :active-part="activePart"
      :tabs="tabs"
      :active-tab="controller.tabId.value"
      @close="layer = null"
      @pick-part="emit('update:activePart', $event)"
      @pick-tab="pickTab"
    />
    <DiffOptionsSheet
      v-if="result"
      :open="layer === 'options'"
      :controller="controller"
      :left-label="result.leftLabel"
      :right-label="result.rightLabel"
      :actions="actions"
      :open-document="openDocument"
      @close="layer = null"
    />
  </div>
</template>

<style scoped>
/* Fills whatever band it is docked in: the dock sizes the row, the band spreads over it. */
.diff-band {
  display: flex;
  flex: 1;
  align-self: stretch;
  align-items: center;
  min-width: 0;
  height: 100%;
}

.name {
  display: flex;
  flex: 1;
  align-items: center;
  align-self: stretch;
  gap: 8px;
  min-width: 0;
  padding: 0 12px 0 16px;
  border: none;
  background: transparent;
  color: var(--gray-11);
  font: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.name:hover,
.name:active,
.name.open {
  background: var(--gray-4);
  color: var(--gray-12);
}

.name:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.name.label {
  cursor: default;
}

.name.label:hover {
  background: transparent;
  color: var(--gray-11);
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.counter {
  flex: none;
  margin: 0 8px;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Each key is set off by a hairline inside the band, as in the reference, so three same-sized icons read as
   three keys rather than one control. */
.key {
  display: flex;
  flex: none;
  align-self: stretch;
  align-items: center;
  border-left: 1px solid var(--gray-4);
}
</style>
