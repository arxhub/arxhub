<script setup lang="ts">
import { DiffView, useDiffController } from '@arxhub/plugin-diff/ui'
import { Button, PageLayout, Row, ScrollArea, Segmented } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { t } from '../i18n/messages'
import { errorText } from './error-text'
import {
  type AiWorkspaceCore,
  type AiWorkspaceProps,
  changeLabel,
  modeOptions,
  statusLabel,
  statusLine,
  useAiWorkspace,
} from './use-ai-workspace'

const props = defineProps<AiWorkspaceProps & { state?: AiWorkspaceCore }>()
const state = useAiWorkspace(props, props.state)
const { sessions, active, selectedPath, selectedChange, selectedName, diffMode, busy, error, archived, comparing, diff } = state
const controller = useDiffController(() => diff.result.value)
const modes = computed(modeOptions)
</script>

<template>
  <PageLayout :title="t('title')" :description="t('description')">
    <p v-if="error" role="alert">{{ errorText(error) }}</p>
    <div class="layout">
      <ScrollArea class="list">
        <nav :aria-label="t('sessionsNav')">
          <Row
            v-for="session in sessions"
            :key="session.sessionId"
            as="button"
            type="button"
            :selected="active?.sessionId === session.sessionId"
            @click="state.selectSession(session)"
          >
            {{ statusLabel(session.status) }} · {{ session.sessionId }}
          </Row>
          <p v-if="!sessions.length">{{ t('empty') }}</p>
        </nav>
      </ScrollArea>
      <section v-if="active" data-testid="ai-workspace-proposal" class="proposal" :aria-label="t('proposal')">
        <p>{{ statusLine(active) }}</p>
        <p>{{ t('base', { hash: active.baseSnapshotHash }) }}</p>
        <h2>{{ t('changes') }}</h2>
        <ul class="changes">
          <li v-for="change in active.changes" :key="change.pathname + change.kind">
            <Row as="button" type="button" class="change" :selected="selectedPath === change.pathname" @click="state.selectChange(change.pathname)">
              {{ changeLabel(change) }}
            </Row>
            <Button size="sm" variant="ghost" :disabled="busy || archived" @click.stop="state.openInDocuments(change.pathname)">{{ t('open') }}</Button>
          </li>
        </ul>
        <div v-if="selectedChange" class="diff-panel">
          <Segmented v-model="diffMode" :options="modes" :aria-label="t('compareMode')" />
          <p v-if="comparing || diff.loading.value" role="status">{{ t('loadingDiff') }}</p>
          <p v-if="diff.error.value" role="alert">{{ diff.error.value }}</p>
          <div v-if="diff.result.value" class="diff-frame" data-testid="ai-workspace-diff">
            <DiffView class="diff" :result="diff.result.value" :controller="controller" :title="selectedName" :open-document="() => state.openInDocuments()" />
          </div>
        </div>
        <h2>{{ t('sources') }}</h2>
        <ul data-testid="ai-workspace-sources">
          <li v-if="!active.sources.length">{{ t('noSources') }}</li>
          <li v-for="source in active.sources" :key="source.pathname + source.excerpt">
            <button type="button" class="source-btn" :disabled="busy" @click="state.openSource(source.pathname, source.excerpt)">
              {{ source.pathname }} — {{ source.excerpt }}
            </button>
          </li>
        </ul>
        <h2>{{ t('actions') }}</h2>
        <ul>
          <li v-for="(action, index) in active.actions" :key="index">
            {{ action.tool }}{{ action.pathname ? ` · ${action.pathname}` : '' }} · {{ action.ok ? t('actionOk') : t('actionError') }}
          </li>
        </ul>
        <div class="actions">
          <Button :disabled="busy || archived" @click="state.run('accept')">{{ t('acceptAll') }}</Button>
          <Button variant="secondary" :disabled="busy || archived" @click="state.run('reject')">{{ t('reject') }}</Button>
          <Button variant="ghost" :disabled="busy" @click="state.refresh">{{ t('refresh') }}</Button>
        </div>
      </section>
    </div>
  </PageLayout>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(200px, 280px) 1fr; gap: 16px; min-height: 0; }
.list { max-height: 70vh; }
.proposal { min-width: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.changes { list-style: none; margin: 0; padding: 0; }
.changes li { display: flex; align-items: center; gap: 8px; }
.change { flex: 1; min-width: 0; }
.diff-panel { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
/* The diff scrolls inside itself, so it needs a height of its own; the page around it scrolls as a whole. */
.diff-frame {
  display: flex;
  flex-direction: column;
  height: 70vh;
  min-height: 480px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.diff { flex: 1; min-height: 0; }
.source-btn {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--accent-11);
  font-size: var(--font-size-sm);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.source-btn:focus-visible { outline: 2px solid var(--accent-8); outline-offset: 1px; }
.source-btn:disabled { color: var(--gray-9); cursor: not-allowed; text-decoration: none; }
h2 { font-size: var(--font-size-sm); color: var(--gray-11); margin: 16px 0 8px; }
ul { margin: 0; padding-inline-start: 20px; font-size: var(--font-size-sm); }
p { font-size: var(--font-size-sm); color: var(--gray-11); }
</style>
