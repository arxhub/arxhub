<script setup lang="ts">
import { Button, Card, GateLayout, StatusDot } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import SasDigits from './SasDigits.vue'

// The new device's side of the handover. The owner confirms the digits here as well as on the first
// device: the first device's word decides whether the real key is sent, this one whether anything the
// server hands over is taken at all.
const props = defineProps<{ flow: EntryFlow }>()

const joiner = computed(() => props.flow.joiner.value)
const phase = computed(() => joiner.value?.phase.value ?? 'claiming')
const sas = computed(() => joiner.value?.sas.value ?? null)
const matched = computed(() => joiner.value?.matched.value ?? false)
const deciding = computed(() => phase.value === 'compare' && sas.value != null && !matched.value)
const failed = computed(() => phase.value === 'failed' || phase.value === 'expired' || phase.value === 'cancelled')
const reason = computed(() => joiner.value?.error.value?.message ?? 'The connection stopped.')
</script>

<template>
  <GateLayout center>
    <template #title>{{ failed ? 'Not connected' : 'Compare the digits' }}</template>
    <template v-if="!failed" #text>The first device should show the same digits. Confirm on both devices.</template>

    <template v-if="!failed">
      <SasDigits v-if="sas" :sas="sas" />
      <p v-if="!deciding" class="status" role="status" data-testid="join-status">
        <StatusDot tone="neutral" pulse />
        <span>{{ sas ? 'Waiting for confirmation on the first device…' : 'Connecting to the first device…' }}</span>
      </p>
    </template>
    <Card v-else notice variant="danger" icon="lu:circle-alert" :title="reason" data-testid="join-error" />

    <template #actions>
      <template v-if="deciding">
        <Button block variant="secondary" data-testid="join-mismatch" @click="flow.joinMismatch()">They don't match</Button>
        <Button block variant="primary" data-testid="join-match" @click="flow.joinMatch()">They match</Button>
      </template>
      <Button
        v-else
        block
        :variant="failed ? 'secondary' : 'ghost'"
        :icon="failed ? 'lu:chevron-left' : undefined"
        data-testid="join-cancel" @click="flow.cancelJoin()">
        {{ failed ? 'Back' : 'Cancel' }}
      </Button>
    </template>
  </GateLayout>
</template>

<style scoped>
.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}
</style>
