<script setup lang="ts">
import { DiffBand, type DiffController, DiffView, useDiffController } from '@arxhub/plugin-diff/ui'
import { type ActionItem, EmptyState, PageLayout, Row, ScrollArea, SectionLabel, Strip } from '@arxhub/uikit/core'
import { useBackStack } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { type AiWorkspaceCore, type AiWorkspaceProps, changeLabel, MODE_OPTIONS, sessionDetail, useAiWorkspace } from './use-ai-workspace'

// The session's own commands (accept, reject, refresh) are in the band above the type row (`aiWorkspaceBar`),
// not at the foot of the proposal: nothing on the phone is pressed at the top or in the middle of a scroll.
const props = defineProps<AiWorkspaceProps & { state?: AiWorkspaceCore }>()
const state = useAiWorkspace(props, props.state)
const { sessions, active, selectedPath, selectedName, diffMode, busy, error, archived, comparing, diff, parts, diffOpen } = state
const controller: DiffController = useDiffController(() => diff.result.value)

useBackStack(
  () => diffOpen.value,
  () => {
    diffOpen.value = false
  },
)

// An action picked in the band's sheet runs while that sheet is still closing over a history entry of its own;
// dropping the diff layer in the same task would unwind two entries at once, which history does not do reliably.
function afterSheet(work: () => void): void {
  let done = false
  const once = () => {
    if (done) return
    done = true
    window.removeEventListener('popstate', once)
    work()
  }
  window.addEventListener('popstate', once)
  window.setTimeout(once, 400)
}

async function finish(action: 'accept' | 'reject'): Promise<void> {
  if (await state.run(action)) diffOpen.value = false
}

const modeLabel = computed(() => MODE_OPTIONS.find((option) => option.value !== diffMode.value)?.label ?? '')

const bandActions = computed((): ActionItem[] => [
  { id: 'ai.accept', label: 'Accept all', icon: 'lu:check', disabled: busy.value || archived.value, onSelect: () => void finish('accept') },
  {
    id: 'ai.reject',
    label: 'Reject',
    icon: 'lu:x',
    tone: 'danger',
    disabled: busy.value || archived.value,
    onSelect: () => void finish('reject'),
  },
  { id: 'ai.mode', label: `Mode: ${modeLabel.value}`, icon: 'lu:git-compare', onSelect: state.toggleMode },
  { id: 'ai.back', label: 'Back to proposal', icon: 'lu:arrow-left', onSelect: () => afterSheet(() => (diffOpen.value = false)) },
])
</script>

<template>
  <div class="ai-mobile">
    <PageLayout v-if="!active" title="AI workspace" description="Review agent worktree sessions before they enter the main vault.">
      <p v-if="error" role="alert">{{ error }}</p>
      <nav aria-label="AiWorkspace sessions">
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
        <EmptyState v-if="!sessions.length" compact icon="lu:bot" text="No agent sessions yet." />
      </nav>
    </PageLayout>
    <template v-else>
      <ScrollArea v-show="!diffOpen" class="proposal-scroll">
        <section data-testid="ai-workspace-proposal" class="proposal" aria-label="AiWorkspace proposal">
          <p v-if="error" role="alert">{{ error }}</p>
          <p>Status: {{ active.status }}{{ active.result ? ` (${active.result})` : '' }}</p>
          <p>Base: {{ active.baseSnapshotHash }}</p>
          <SectionLabel class="label">Changes</SectionLabel>
          <nav aria-label="AiWorkspace changes">
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
          <SectionLabel class="label">Sources</SectionLabel>
          <nav data-testid="ai-workspace-sources" aria-label="AiWorkspace sources">
            <p v-if="!active.sources.length">No sources cited yet.</p>
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
        <p v-if="comparing || diff.loading.value" role="status">Loading diff…</p>
        <p v-if="diff.error.value" role="alert">{{ diff.error.value }}</p>
        <div v-if="diff.result.value" class="diff-frame" data-testid="ai-workspace-diff">
          <DiffView class="diff" :result="diff.result.value" :controller="controller" :title="selectedName" :open-document="() => state.openInDocuments()" />
        </div>
        <!-- The diff's controls sit under it, where the thumb is. The type's own band steps aside while the
             diff is open (`aiWorkspaceBar` answers null), so this is the one band on screen. -->
        <Strip v-if="diff.result.value" below flush>
          <DiffBand
            :controller="controller"
            :title="selectedName"
            :parts="parts"
            parts-title="Changes"
            :active-part="selectedPath ?? undefined"
            :actions="bandActions"
            :open-document="() => void state.openInDocuments()"
            @update:active-part="state.selectChange"
          />
        </Strip>
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
