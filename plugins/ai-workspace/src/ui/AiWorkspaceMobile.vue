<script setup lang="ts">
import { DiffBand, type DiffController, DiffView, useDiffController } from '@arxhub/plugin-diff/ui'
import { type ActionItem, Button, PageLayout, Row, ScrollArea, SectionLabel } from '@arxhub/uikit/core'
import { useArxHub, useBackStack } from '@arxhub/uikit/hooks'
import { type Component, computed, h, markRaw, onUnmounted, ref, watch } from 'vue'
import { AiWorkspaceExtension } from '../ai-workspace-extension'
import { type AiWorkspaceProps, changeLabel, MODE_OPTIONS, useAiWorkspace } from './use-ai-workspace'

const props = defineProps<AiWorkspaceProps>()
const state = useAiWorkspace(props)
const { sessions, active, selectedPath, selectedName, diffMode, busy, error, archived, comparing, diff, parts } = state
const controller: DiffController = useDiffController(() => diff.result.value)
const extension = useArxHub().extensions.get(AiWorkspaceExtension)

const diffOpen = ref(false)
useBackStack(
  () => diffOpen.value,
  () => {
    diffOpen.value = false
  },
)

function openChange(pathname: string): void {
  state.selectChange(pathname)
  diffOpen.value = true
}

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
  { id: 'ai.accept', label: 'Принять всё', icon: 'lu:check', disabled: busy.value || archived.value, onSelect: () => void finish('accept') },
  {
    id: 'ai.reject',
    label: 'Отклонить',
    icon: 'lu:x',
    variant: 'danger',
    disabled: busy.value || archived.value,
    onSelect: () => void finish('reject'),
  },
  { id: 'ai.mode', label: `Режим: ${modeLabel.value}`, icon: 'lu:git-compare', onSelect: state.toggleMode },
  { id: 'ai.back', label: 'К предложению', icon: 'lu:arrow-left', onSelect: () => afterSheet(() => (diffOpen.value = false)) },
])

// Read on every render of the dock, so the band follows the change, the parts and the busy state without the dock
// being re-claimed.
const band: Component = markRaw(() =>
  h(DiffBand, {
    controller,
    title: selectedName.value,
    parts: parts.value,
    partsTitle: 'Изменения',
    activePart: selectedPath.value ?? undefined,
    actions: bandActions.value,
    openDocument: () => void state.openInDocuments(),
    'onUpdate:activePart': (id: string) => state.selectChange(id),
  }),
)

// The dock is claimed only while a diff is on screen: the proposal has nothing to put there, and an empty band
// would take 48px on the shortest screen there is.
const showing = computed(() => diffOpen.value && diff.result.value != null)
watch(
  showing,
  (visible) => {
    if (visible) extension.dock.value = band
    else if (extension.dock.value === band) extension.dock.value = null
  },
  { immediate: true },
)
onUnmounted(() => {
  if (extension.dock.value === band) extension.dock.value = null
})

watch(active, (session) => {
  if (session == null) diffOpen.value = false
})
</script>

<template>
  <div class="ai-mobile">
    <PageLayout v-if="!active" title="AI workspace" description="Review agent worktree sessions before they enter the main vault.">
      <p v-if="error" role="alert">{{ error }}</p>
      <nav aria-label="AiWorkspace sessions">
        <Row v-for="session in sessions" :key="session.sessionId" as="button" type="button" @click="state.selectSession(session)">
          {{ session.status }} · {{ session.sessionId }}
        </Row>
        <p v-if="!sessions.length">No agent sessions yet.</p>
      </nav>
      <Button size="lg" variant="ghost" :disabled="busy" @click="state.refresh">Refresh</Button>
    </PageLayout>
    <template v-else>
      <ScrollArea v-show="!diffOpen" class="proposal-scroll">
        <section data-testid="ai-workspace-proposal" class="proposal" aria-label="AiWorkspace proposal">
          <Row as="button" type="button" @click="state.selectSession(null)">Все сессии</Row>
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
              @click="openChange(change.pathname)"
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
          <div class="actions">
            <Button size="lg" :disabled="busy || archived" @click="finish('accept')">Accept all</Button>
            <Button size="lg" variant="secondary" :disabled="busy || archived" @click="finish('reject')">Reject</Button>
            <Button size="lg" variant="ghost" :disabled="busy" @click="state.refresh">Refresh</Button>
          </div>
        </section>
      </ScrollArea>
      <div v-show="diffOpen" class="diff-layer">
        <p v-if="comparing || diff.loading.value" role="status">Loading diff…</p>
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
.actions { display: flex; gap: 8px; flex-wrap: wrap; padding: 16px; }
.diff-layer { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.diff-layer > p { margin: 8px 16px; }
.diff-frame { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.diff { flex: 1; min-height: 0; }
nav > p { margin: 8px 16px; }
p { font-size: var(--font-size-sm); color: var(--gray-11); }
</style>
