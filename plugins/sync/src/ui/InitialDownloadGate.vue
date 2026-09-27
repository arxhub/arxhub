<script setup lang="ts">
import type { RepositoryExtension } from '@arxhub/plugin-repository'
import { Button, Card, GateLayout, ProgressBar, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import type { SyncExtension } from '../sync-extension'
import { downloadFacts } from './download-facts'

// The joining device's last step, and the one the app waits behind: nothing opens until the vault is
// here, because a vault that is half down is one where a document "does not exist" that does. There is
// no way past it on a failure either — only "Try again", which resumes rather than restarts.
const props = defineProps<{
  sync: SyncExtension
  repository: RepositoryExtension
  onOpen: () => void
}>()

const state = computed(() => props.sync.initialDownload.value)
const done = computed(() => state.value.status === 'done')
const failed = computed(() => state.value.status === 'failed')
const facts = computed(() => downloadFacts(state.value.progress))
// The note reads as the screen's own prose, which the phone sets a step larger (as GateLayout's text).
const touch = useShellFrame() === 'mobile'
const threshold = computed(() => props.repository.materializeUpToMb.value)
</script>

<template>
  <GateLayout class="initial-download" data-testid="initial-download">
    <template #kicker>Step 4 of 4</template>
    <template #title>{{ done ? 'Your vault is here' : 'Downloading your vault' }}</template>

    <ProgressBar :value="done ? 100 : facts.percent" />
    <div class="facts">
      <Row plain flush label="Documents"><span class="fact" data-testid="download-documents">{{ facts.documents }}</span></Row>
      <Row plain flush label="Downloaded"><span class="fact">{{ facts.downloaded }}</span></Row>
      <Row plain flush label="Stay in the cloud until opened"><span class="fact">{{ facts.cloud }}</span></Row>
    </div>
    <Card v-if="failed" variant="danger" icon="lu:circle-alert" :title="state.error ?? 'The download stopped'" data-testid="download-error">
      <p class="note">What already arrived is kept — trying again continues from there.</p>
    </Card>
    <Card
      v-else-if="!done"
      notice
      variant="warning"
      icon="lu:triangle-alert"
      title="Don't close or minimize the app while downloading. If it closes anyway, the download continues from the same place next time."
    />
    <p v-if="threshold > 0" class="note" :class="{ touch }">
      Files over {{ threshold }} MB (videos, archives) aren't downloaded ahead — they open on demand. Change this in Settings → Storage.
    </p>

    <template #actions>
      <Button v-if="failed" block data-testid="download-retry" @click="sync.downloadVault()">Try again</Button>
      <Button v-else block :disabled="!done" data-testid="download-open" @click="onOpen()">{{ done ? 'Open ArxHub' : 'Downloading…' }}</Button>
    </template>
  </GateLayout>
</template>

<style scoped>
.facts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fact {
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.note {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.note.touch {
  font-size: var(--font-size-md);
}
</style>
