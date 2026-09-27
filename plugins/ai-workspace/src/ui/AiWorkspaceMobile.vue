<script setup lang="ts">
import { type DiffController, DiffView, useDiffController } from '@arxhub/plugin-diff/ui'
import { EmptyState, PageLayout, Row, ScrollArea, SectionLabel } from '@arxhub/uikit/core'
import { useBackStack } from '@arxhub/uikit/hooks'
import { onUnmounted } from 'vue'
import { t } from '../i18n/messages'
import { errorText } from './error-text'
import { type AiWorkspaceCore, type AiWorkspaceProps, changeLabel, sessionDetail, statusLine, useAiWorkspace } from './use-ai-workspace'

// Every command of the session and of its open diff is in the band above the type row (`aiWorkspaceBar`), not
// in the page: nothing on the phone is pressed at the top or in the middle of a scroll.
const props = defineProps<AiWorkspaceProps & { state?: AiWorkspaceCore }>()
const state = useAiWorkspace(props, props.state)
const { sessions, active, selectedPath, selectedName, busy, error, comparing, diff, diffOpen } = state
const controller: DiffController = useDiffController(() => diff.result.value)
// The band is described by the type, outside this component; it steps the diff through the same controller.
state.diffController.value = controller
onUnmounted(() => {
  if (state.diffController.value === controller) state.diffController.value = null
})

useBackStack(
  () => diffOpen.value,
  () => {
    diffOpen.value = false
  },
)
</script>

<template>
  <div class="ai-mobile">
    <PageLayout v-if="!active" :title="t('title')" :description="t('description')">
      <p v-if="error" role="alert">{{ errorText(error) }}</p>
      <nav :aria-label="t('sessionsNav')">
        <Row
          v-for="session in sessions"
          :key="session.sessionId"
          as="button"
          type="button"
          icon="lu:bot"
          :label="session.sessionId"
          :detail="sessionDetail(session)"
          @click="state.selectSession(session)"
        />
        <EmptyState v-if="!sessions.length" compact icon="lu:bot" :text="t('empty')" />
      </nav>
    </PageLayout>
    <template v-else>
      <ScrollArea v-show="!diffOpen" class="proposal-scroll">
        <section data-testid="ai-workspace-proposal" class="proposal" :aria-label="t('proposal')">
          <p v-if="error" role="alert">{{ errorText(error) }}</p>
          <p>{{ statusLine(active) }}</p>
          <p>{{ t('base', { hash: active.baseSnapshotHash }) }}</p>
          <SectionLabel class="label">{{ t('changes') }}</SectionLabel>
          <nav :aria-label="t('changesNav')">
            <Row
              v-for="change in active.changes"
              :key="change.pathname + change.kind"
              as="button"
              type="button"
              :selected="selectedPath === change.pathname"
              @click="state.openChange(change.pathname)"
            >
              {{ changeLabel(change) }}
            </Row>
          </nav>
          <SectionLabel class="label">{{ t('sources') }}</SectionLabel>
          <nav data-testid="ai-workspace-sources" :aria-label="t('sourcesNav')">
            <p v-if="!active.sources.length">{{ t('noSources') }}</p>
            <Row
              v-for="source in active.sources"
              :key="source.pathname + source.excerpt"
              as="button"
              type="button"
              wrap
              :disabled="busy"
              @click="state.openSource(source.pathname, source.excerpt)"
            >
              {{ source.pathname }} — {{ source.excerpt }}
            </Row>
          </nav>
        </section>
      </ScrollArea>
      <div v-show="diffOpen" class="diff-layer">
        <p v-if="comparing || diff.loading.value" role="status">{{ t('loadingDiff') }}</p>
        <p v-if="diff.error.value" role="alert">{{ diff.error.value }}</p>
        <div v-if="diff.result.value" class="diff-frame" data-testid="ai-workspace-diff">
          <DiffView class="diff" :result="diff.result.value" :controller="controller" :title="selectedName" :open-document="() => state.openInDocuments()" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ai-mobile { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.proposal-scroll { flex: 1; }
.proposal { display: flex; flex-direction: column; padding-block: 8px 24px; }
.proposal > p { margin: 8px 16px; }
.label { margin: 16px 16px 8px; }
.diff-layer { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.diff-layer > p { margin: 8px 16px; }
.diff-frame { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.diff { flex: 1; min-height: 0; }
nav > p { margin: 8px 16px; }
p { font-size: var(--font-size-sm); color: var(--gray-11); }
</style>
