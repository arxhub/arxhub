<script setup lang="ts">
import { diffTexts, DiffView } from '@arxhub/plugin-editor/ui'
import type { DiffResult } from '@arxhub/plugin-editor/ui'
import { Button, PageLayout, Row, Segmented } from '@arxhub/uikit/core'
import { computed, onMounted, ref, watch } from 'vue'
import type { CompareMode } from '../session-store'

export type SessionView = {
  sessionId: string
  status: string
  result: string | null
  baseSnapshotHash: string
  changes: Array<{ pathname: string; kind: string; fromPath?: string; toPath?: string }>
  actions: Array<{ at: string; tool: string; pathname?: string; ok: boolean }>
  sources: Array<{ pathname: string; excerpt: string }>
}

export type CompareResult = {
  leftLabel: string
  rightLabel: string
  left: string
  right: string
}

const props = defineProps<{
  loadSessions: () => Promise<SessionView[]>
  accept: (sessionId: string) => Promise<void>
  reject: (sessionId: string) => Promise<void>
  compare: (sessionId: string, pathname: string, mode: CompareMode) => Promise<CompareResult>
  openOverlay: (sessionId: string, pathname: string) => Promise<void>
  openSource: (pathname: string, excerpt: string) => Promise<void>
}>()

const sessions = ref<SessionView[]>([])
const active = ref<SessionView | null>(null)
const selectedPath = ref<string | null>(null)
const diffMode = ref<CompareMode>('agent')
const diffResult = ref<DiffResult | null>(null)
const error = ref('')
const busy = ref(false)
const diffLoading = ref(false)

const modeOptions = [
  { value: 'agent', label: 'Агент (base→worktree)' },
  { value: 'apply', label: 'Перенос (worktree→main)' },
]

const selectedChange = computed(() => active.value?.changes.find((c) => c.pathname === selectedPath.value) ?? null)

async function refresh() {
  error.value = ''
  try {
    sessions.value = await props.loadSessions()
    const preferred =
      sessions.value.find((s) => s.status === 'proposed') ??
      sessions.value.find((s) => s.status === 'open' && s.sources.length > 0) ??
      sessions.value.find((s) => s.status === 'open' && s.changes.length > 0) ??
      sessions.value[0] ??
      null
    active.value = preferred
    if (preferred && selectedPath.value && !preferred.changes.some((c) => c.pathname === selectedPath.value)) {
      selectedPath.value = null
      diffResult.value = null
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

async function loadDiff() {
  if (!active.value || !selectedPath.value) {
    diffResult.value = null
    return
  }
  diffLoading.value = true
  error.value = ''
  try {
    const compared = await props.compare(active.value.sessionId, selectedPath.value, diffMode.value)
    diffResult.value = diffTexts({
      left: compared.left,
      right: compared.right,
      pathname: selectedPath.value,
      leftLabel: compared.leftLabel,
      rightLabel: compared.rightLabel,
    })
  } catch (reason) {
    diffResult.value = null
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    diffLoading.value = false
  }
}

async function selectChange(pathname: string) {
  selectedPath.value = pathname
  await loadDiff()
}

async function run(action: 'accept' | 'reject') {
  if (!active.value) return
  busy.value = true
  error.value = ''
  try {
    if (action === 'accept') await props.accept(active.value.sessionId)
    else await props.reject(active.value.sessionId)
    selectedPath.value = null
    diffResult.value = null
    await refresh()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function openInNotes() {
  if (!active.value || !selectedPath.value) return
  busy.value = true
  error.value = ''
  try {
    await props.openOverlay(active.value.sessionId, selectedPath.value)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function openSource(pathname: string, excerpt: string) {
  busy.value = true
  error.value = ''
  try {
    await props.openSource(pathname, excerpt)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

watch(diffMode, () => {
  void loadDiff()
})

watch(active, () => {
  selectedPath.value = null
  diffResult.value = null
})

onMounted(refresh)
</script>

<template>
  <PageLayout title="AI workspace" description="Review agent worktree sessions before they enter the main vault.">
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="layout">
      <nav class="list" aria-label="AiWorkspace sessions">
        <Row
          v-for="session in sessions"
          :key="session.sessionId"
          as="button"
          type="button"
          :selected="active?.sessionId === session.sessionId"
          @click="active = session"
        >
          {{ session.status }} · {{ session.sessionId }}
        </Row>
        <p v-if="!sessions.length">No agent sessions yet.</p>
      </nav>
      <section
        v-if="active"
        data-testid="ai-workspace-proposal"
        class="proposal"
        aria-label="AiWorkspace proposal"
      >
        <p>Status: {{ active.status }}{{ active.result ? ` (${active.result})` : '' }}</p>
        <p>Base: {{ active.baseSnapshotHash }}</p>
        <h2>Changes</h2>
        <ul class="changes">
          <li v-for="change in active.changes" :key="change.pathname + change.kind">
            <button
              type="button"
              class="change-btn"
              :class="{ selected: selectedPath === change.pathname }"
              @click="selectChange(change.pathname)"
            >
              {{ change.kind }} · {{ change.fromPath && change.toPath ? `${change.fromPath} → ${change.toPath}` : change.pathname }}
            </button>
            <Button
              size="sm"
              variant="ghost"
              :disabled="busy || active.status === 'archived'"
              @click.stop="selectedPath = change.pathname; openInNotes()"
            >
              Открыть
            </Button>
          </li>
        </ul>
        <div v-if="selectedChange" class="diff-panel">
          <Segmented
            v-model="diffMode"
            :options="modeOptions"
            aria-label="Compare mode"
          />
          <p v-if="diffLoading" role="status">Loading diff…</p>
          <div v-if="diffResult" data-testid="ai-workspace-diff">
            <DiffView :result="diffResult" />
          </div>
        </div>
        <h2>Sources</h2>
        <ul data-testid="ai-workspace-sources">
          <li v-if="!active.sources.length">No sources cited yet.</li>
          <li v-for="source in active.sources" :key="source.pathname + source.excerpt">
            <button
              type="button"
              class="source-btn"
              :disabled="busy"
              @click="openSource(source.pathname, source.excerpt)"
            >
              {{ source.pathname }} — {{ source.excerpt }}
            </button>
          </li>
        </ul>
        <h2>Actions</h2>
        <ul>
          <li v-for="(action, index) in active.actions" :key="index">
            {{ action.tool }}{{ action.pathname ? ` · ${action.pathname}` : '' }} · {{ action.ok ? 'ok' : 'error' }}
          </li>
        </ul>
        <div class="actions">
          <Button
            :disabled="busy || active.status === 'archived'"
            @click="run('accept')"
          >
            Accept all
          </Button>
          <Button
            variant="secondary"
            :disabled="busy || active.status === 'archived'"
            @click="run('reject')"
          >
            Reject
          </Button>
          <Button variant="ghost" :disabled="busy" @click="refresh">Refresh</Button>
        </div>
      </section>
    </div>
  </PageLayout>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(200px, 280px) 1fr; gap: 16px; min-height: 0; }
.list { overflow: auto; max-height: 70vh; }
.proposal { min-width: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.changes { list-style: none; margin: 0; padding: 0; }
.changes li { display: flex; align-items: center; gap: 8px; margin-block: 4px; }
.change-btn {
  flex: 1;
  min-width: 0;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-xs);
  background: var(--gray-2);
  color: var(--gray-12);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.change-btn.selected {
  background: var(--accent-3);
  color: var(--accent-11);
  border-color: var(--accent-7);
}
.diff-panel { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
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
.source-btn:disabled { color: var(--gray-9); cursor: not-allowed; text-decoration: none; }
h2 { font-size: var(--font-size-sm); color: var(--gray-11); margin: 16px 0 8px; }
ul { margin: 0; padding-inline-start: 20px; font-size: var(--font-size-sm); }
p { font-size: var(--font-size-sm); color: var(--gray-11); }
@media (max-width: 720px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
