<script setup lang="ts">
import { Button, Card, GateLayout, StatusDot } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import { errorText } from '../../error-text'
import { t } from '../../i18n/messages'
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
const reason = computed(() => {
  const error = joiner.value?.error.value
  return error ? errorText(error) : t('common.connectionStopped')
})
</script>

<template>
  <GateLayout center>
    <template #title>{{ failed ? t('common.notConnected') : t('common.compareDigits') }}</template>
    <template v-if="!failed" #text>{{ t('entry.compare.text') }}</template>

    <template v-if="!failed">
      <SasDigits v-if="sas" :sas="sas" />
      <p v-if="!deciding" class="status" role="status" data-testid="join-status">
        <StatusDot tone="neutral" pulse />
        <span>{{ sas ? t('entry.compare.waitingFirst') : t('entry.compare.connecting') }}</span>
      </p>
    </template>
    <Card v-else notice variant="danger" icon="lu:circle-alert" :title="reason" data-testid="join-error" />

    <template #actions>
      <template v-if="deciding">
        <Button block variant="secondary" data-testid="join-mismatch" @click="flow.joinMismatch()">{{ t('common.theyDontMatch') }}</Button>
        <Button block variant="primary" data-testid="join-match" @click="flow.joinMatch()">{{ t('entry.compare.match') }}</Button>
      </template>
      <Button
        v-else
        block
        :variant="failed ? 'secondary' : 'ghost'"
        :icon="failed ? 'lu:chevron-left' : undefined"
        data-testid="join-cancel" @click="flow.cancelJoin()">
        {{ failed ? t('common.back') : t('common.cancel') }}
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
