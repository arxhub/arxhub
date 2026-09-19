<script setup lang="ts">
import { Button, IconButton, modals, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { BudgetExtension } from '../budget-extension'
import type { BudgetPlace } from '../model'
import { errorMessage } from './budget-ui'
import PlaceDialog from './PlaceDialog.vue'

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const iconSize = touch ? 'xl' : 'md'
const dialogOpen = ref(false)
const editing = ref<BudgetPlace | undefined>()
const places = computed(() => budget.data.value.places)

function create(): void {
  editing.value = undefined
  dialogOpen.value = true
}

function edit(place: BudgetPlace): void {
  editing.value = place
  dialogOpen.value = true
}

function used(place: BudgetPlace): boolean {
  return budget.data.value.transactions.some((entry) => entry.placeId === place.id)
}

function location(place: BudgetPlace): string {
  if (place.latitude === null || place.longitude === null) return 'No coordinates'
  return `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`
}

function confirmRemove(place: BudgetPlace): void {
  modals.openConfirmModal({
    title: 'Remove place?',
    children: `Remove “${place.name}”? This cannot be undone.`,
    labels: { confirm: 'Remove place', cancel: 'Cancel' },
    confirmProps: { danger: true },
    onConfirm: () => void remove(place),
  })
}

async function remove(place: BudgetPlace): Promise<void> {
  try {
    await budget.removePlace(place)
    toaster.create({ title: 'Place removed', description: place.name, type: 'success' })
  } catch (cause) {
    arxhub.logger.error('[budget] could not remove place', cause)
    toaster.create({ title: 'Could not remove place', description: errorMessage(cause), type: 'error' })
  }
}
</script>

<template>
  <section class="section" :class="{ touch }" aria-labelledby="budget-places-heading">
    <div class="section-head">
      <div>
        <h2 id="budget-places-heading">Places</h2>
        <p>Save shops and other places to recognize nearby purchases.</p>
      </div>
      <Button :size="buttonSize" variant="secondary" :disabled="budget.busy.value" @click="create">New place</Button>
    </div>

    <div v-if="places.length === 0" class="empty">
      <span>No places yet.</span>
      <Button :size="buttonSize" @click="create">Create your first place</Button>
    </div>
    <ul v-else class="list">
      <Row v-for="place in places" :key="place.id" as="li" plain wrap :data-place-id="place.id">
        <div class="row-main">
          <span class="row-title">{{ place.name }}</span>
          <span class="row-meta">{{ location(place) }}</span>
        </div>
        <div class="row-actions">
          <IconButton
            icon="lu:pencil"
            :size="iconSize"
            tooltip="Edit place"
            :aria-label="`Edit ${place.name}`"
            :disabled="budget.busy.value"
            @click="edit(place)"
          />
          <IconButton
            icon="lu:trash-2"
            :size="iconSize"
            tooltip="Remove place"
            :aria-label="`Remove ${place.name}`"
            :disabled="budget.busy.value || used(place)"
            @click="confirmRemove(place)"
          />
        </div>
      </Row>
    </ul>
    <p v-if="places.some(used)" class="footnote">Places used by transactions cannot be removed.</p>
  </section>

  <PlaceDialog v-model:open="dialogOpen" :previous="editing" />
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section.touch .section-head {
  flex-direction: column;
}

h2,
.section-head p,
.footnote {
  margin: 0;
}

h2 {
  color: var(--gray-12);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.section-head p,
.footnote,
.row-meta {
  margin-top: 4px;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-title {
  overflow: hidden;
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  overflow-wrap: anywhere;
}

.row-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}
</style>
