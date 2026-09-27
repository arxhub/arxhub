<script setup lang="ts">
import { describeError, formatNumber } from '@arxhub/i18n'
import type { RepositoryExtension } from '@arxhub/plugin-repository'
import { Button, Card, GateLayout, ProgressBar, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { t } from '../i18n/messages'
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
const failure = computed(() => describeError(state.value.cause)?.message ?? state.value.error ?? t('download.stopped'))
</script>

<template>
  <GateLayout class="initial-download" data-testid="initial-download">
    <template #kicker>{{ t('download.step') }}</template>
    <template #title>{{ done ? t('download.here') : t('download.downloading') }}</template>

    <ProgressBar :value="done ? 100 : facts.percent" />
    <div class="facts">
      <Row plain flush :label="t('download.documents')"><span class="fact" data-testid="download-documents">{{ facts.documents }}</span></Row>
      <Row plain flush :label="t('download.downloaded')"><span class="fact">{{ facts.downloaded }}</span></Row>
      <Row plain flush :label="t('download.cloud')"><span class="fact">{{ facts.cloud }}</span></Row>
    </div>
    <Card v-if="failed" variant="danger" icon="lu:circle-alert" :title="failure" data-testid="download-error">
      <p class="note">{{ t('download.kept') }}</p>
    </Card>
    <Card
      v-else-if="!done"
      notice
      variant="warning"
      icon="lu:triangle-alert"
      :title="t('download.keepOpen')"
    />
    <p v-if="threshold > 0" class="note" :class="{ touch }">
      {{ t('download.threshold', { size: formatNumber(threshold) }) }}
    </p>

    <template #actions>
      <Button v-if="failed" block data-testid="download-retry" @click="sync.downloadVault()">{{ t('download.retry') }}</Button>
      <Button v-else block :disabled="!done" data-testid="download-open" @click="onOpen()">{{ done ? t('download.open') : t('download.busy') }}</Button>
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
