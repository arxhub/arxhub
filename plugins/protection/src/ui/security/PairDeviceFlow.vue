<script setup lang="ts">
import { formatInvitationCode } from '@arxhub/crypto'
import { Card, Interpolated, QrCode, StatusDot } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { errorText } from '../../error-text'
import { messages, t } from '../../i18n/messages'
import type { PairingHost } from '../../pairing/pairing-client'
import { formatCountdown, pairScreen } from '../../security/security-task'
import SasDigits from '../entry/SasDigits.vue'

// The first device's side of "Connect a device": the invitation (a QR, and for a device without a camera
// the server and the code), then the digits to compare, then the outcome. The buttons that move it on are
// the surface's footer, drawn by the task.
const props = defineProps<{ host: PairingHost; server: string }>()

const screen = computed(() => pairScreen(props.host.phase.value))
const invitation = computed(() => props.host.invitation.value)
const device = computed(() => props.host.deviceName.value ?? t('pair.newDevice'))
const countdown = computed(() => formatCountdown(props.host.ttlSeconds.value))
const connecting = computed(() => props.host.phase.value === 'connecting')
const reason = computed(() => {
  const error = props.host.error.value
  return error ? errorText(error) : t('common.connectionStopped')
})
</script>

<template>
  <template v-if="screen === 'preparing'">
    <p class="status" role="status"><StatusDot tone="neutral" pulse /><span>{{ t('pair.creating') }}</span></p>
  </template>

  <template v-else-if="screen === 'invite' && invitation">
    <QrCode :value="invitation.qr" :label="t('pair.qr')" data-testid="pairing-qr" />
    <p class="text">{{ t('pair.open') }}</p>
    <dl class="facts">
      <div class="fact">
        <dt>{{ t('pair.noCamera') }}</dt>
        <dd class="mono" data-testid="pairing-server">{{ server }}</dd>
      </div>
      <div class="fact">
        <dt>{{ t('pair.code') }}</dt>
        <dd class="mono code" data-testid="pairing-code">{{ formatInvitationCode(invitation.code) }}</dd>
      </div>
    </dl>
    <p class="status" role="status" data-testid="pairing-status">
      <StatusDot tone="neutral" pulse />
      <span v-if="connecting">{{ t('pair.connecting', { device }) }}</span>
      <span v-else>{{ t('pair.waiting', { time: countdown }) }}</span>
    </p>
  </template>

  <template v-else-if="screen === 'compare'">
    <p class="text">
      <Interpolated :text="messages.raw('pair.compare')"><template #device><strong class="device">{{ device }}</strong></template></Interpolated>
    </p>
    <SasDigits v-if="host.sas.value" :sas="host.sas.value" />
  </template>

  <template v-else-if="screen === 'done'">
    <p class="text" data-testid="pairing-done">
      <Interpolated :text="messages.raw('pair.done')"><template #device><strong class="device">{{ device }}</strong></template></Interpolated>
    </p>
  </template>

  <template v-else-if="screen === 'expired'">
    <p class="text" data-testid="pairing-expired">{{ t('pair.expired') }}</p>
  </template>

  <template v-else>
    <Card notice variant="danger" icon="lu:circle-alert" :title="reason" data-testid="pairing-error" />
  </template>
</template>

<style scoped>
.text {
  margin: 0;
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.device {
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.fact {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.fact dt {
  color: var(--gray-11);
}

.fact dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--gray-12);
}

.mono {
  font-family: var(--font-mono);
}

.code {
  font-size: var(--font-size-md);
  letter-spacing: 0.08em;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}
</style>
