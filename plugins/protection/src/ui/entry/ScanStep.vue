<script setup lang="ts">
import { Button, Card, GateLayout, QrScanner } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { onMounted, ref } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

const touch = useShellFrame() === 'mobile'
const hint = 'Point the camera at the QR on the first device'
// Remounting the in-page scanner restarts its camera: it reports one code and stops, so a QR that was
// not an invitation needs a fresh one.
const attempt = ref(0)
const cameraFailed = ref(false)

function detected(text: string): void {
  props.flow.scanned(text)
  if (props.flow.step.value === 'join-scan') attempt.value += 1
}

function unavailable(reason: string): void {
  cameraFailed.value = true
  props.flow.scanUnavailable(reason)
}

onMounted(() => {
  if (props.flow.camera === 'native') void props.flow.scanNative()
})
</script>

<template>
  <!-- On the phone the camera is the screen (bleed): the picture from edge to edge, the actions under it. -->
  <GateLayout :bleed="flow.camera === 'page' && !cameraFailed">
    <template #kicker>{{ kicker }}</template>
    <template #title>Scan the QR</template>

    <QrScanner v-if="flow.camera === 'page' && !cameraFailed" :key="attempt" :fill="touch" :hint="hint" @detected="detected" @unavailable="unavailable" />
    <p v-else-if="flow.camera === 'native'" class="hint">{{ hint }}</p>
    <Card v-if="flow.scanError.value" notice variant="warning" icon="lu:triangle-alert" :title="flow.scanError.value" data-testid="scan-error" />

    <template #actions>
      <Button v-if="flow.camera === 'native'" block variant="secondary" :disabled="flow.scanning.value" @click="flow.scanNative()">Scan again</Button>
      <Button block variant="ghost" data-testid="scan-manual" @click="flow.enterCodeManually()">Enter the code manually</Button>
      <Button block variant="ghost" icon="lu:chevron-left" @click="flow.back()">Back</Button>
    </template>
  </GateLayout>
</template>

<style scoped>
.hint {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}
</style>
