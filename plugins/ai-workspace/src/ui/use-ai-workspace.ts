import { illegalState } from '@arxhub/errors'
import { posix } from '@arxhub/path'
import type { DiffRequest } from '@arxhub/plugin-diff'
import { type DiffController, type DiffPart, useDiff } from '@arxhub/plugin-diff/ui'
import { computed, effectScope, onMounted, ref, shallowRef, watch } from 'vue'
import { t } from '../i18n/messages'
import type { ChangeKind, CompareMode } from '../session-store'
import type { CompareResult, SessionChange, SessionView } from '../session-view'

export interface AiWorkspaceProps {
  loadSessions: () => Promise<SessionView[]>
  accept: (sessionId: string) => Promise<void>
  reject: (sessionId: string) => Promise<void>
  compare: (sessionId: string, pathname: string, mode: CompareMode) => Promise<CompareResult>
  openOverlay: (sessionId: string, pathname: string) => Promise<void>
  openSource: (pathname: string, excerpt: string) => Promise<void>
}

const MODES = ['agent', 'apply'] as const satisfies readonly CompareMode[]

export function modeOptions(): { value: CompareMode; label: string }[] {
  return MODES.map((value) => ({ value, label: t(`modes.${value}`) }))
}

export const CHANGE_ICONS: Record<ChangeKind, string> = {
  modified: 'lu:square-pen',
  created: 'lu:square-plus',
  deleted: 'lu:square-minus',
  renamed: 'lu:move',
}

// The server's words for a session and a change are wire values; one it sends that this build does not know
// is shown as it came rather than dropped.
function known<const K extends string>(keys: readonly K[], value: string, read: (key: K) => string): string {
  const key = keys.find((k) => k === value)
  return key == null ? value : read(key)
}

export function statusLabel(status: string): string {
  return known(['open', 'proposed', 'archived'] as const, status, (key) => t(`sessionStatus.${key}`))
}

export function resultLabel(result: string): string {
  return known(['accepted', 'rejected'] as const, result, (key) => t(`sessionResult.${key}`))
}

export function kindLabel(kind: ChangeKind): string {
  return t(`changeKind.${kind}`)
}

// The compare answer names its two sides in English (the server has no language); the view names them in the reader's.
export function sideLabel(label: string): string {
  return known(['Base', 'Worktree', 'Main'] as const, label, (key) => t(`sides.${key}`))
}

export function sessionDetail(session: SessionView): string {
  return `${statusLabel(session.status)} · ${t('changeCount', { count: session.changes.length })}`
}

export function changeLabel(change: SessionChange): string {
  return `${kindLabel(change.kind)} · ${change.fromPath && change.toPath ? `${change.fromPath} → ${change.toPath}` : change.pathname}`
}

export function statusLine(session: SessionView): string {
  const status = statusLabel(session.status)
  return session.result ? t('statusWithResult', { status, result: resultLabel(session.result) }) : t('status', { status })
}

// Which session and change are open. It outlives a component when the type's own page, the phone's band and its
// second-tap sheet all read it — three places that would disagree after the first tap if each held a copy — and
// that shared copy is `aiWorkspaceState`. The diff of the open change stays per component (`useAiWorkspace`),
// because computing it needs the component's app.
export function createAiWorkspaceState(props: AiWorkspaceProps) {
  const sessions = ref<SessionView[]>([])
  const active = ref<SessionView | null>(null)
  const selectedPath = ref<string | null>(null)
  const diffMode = ref<CompareMode>('agent')
  const busy = ref(false)
  const error = shallowRef<unknown>(null)
  const compared = shallowRef<{ pathname: string; answer: CompareResult } | null>(null)
  const comparing = ref(false)
  let compareTicket = 0

  const selectedChange = computed(() => active.value?.changes.find((c) => c.pathname === selectedPath.value) ?? null)
  const archived = computed(() => active.value?.status === 'archived')

  const request = computed((): DiffRequest | null => {
    const current = compared.value
    if (current == null) return null
    return {
      pathname: current.pathname,
      left: current.answer.left,
      right: current.answer.right,
      leftLabel: sideLabel(current.answer.leftLabel),
      rightLabel: sideLabel(current.answer.rightLabel),
    }
  })
  // The phone reads one change at a time: the diff takes the screen the proposal had.
  const diffOpen = ref(false)
  // The open diff's controller, published by the phone's page while it is mounted: the diff is computed
  // there (it needs the component's app), and the type's band steps the same one.
  const diffController = shallowRef<DiffController | null>(null)
  const selectedName = computed(() => (selectedPath.value == null ? '' : posix.basename(selectedPath.value)))

  async function loadCompare(): Promise<void> {
    const ticket = ++compareTicket
    const session = active.value
    const pathname = selectedPath.value
    if (session == null || pathname == null) {
      compared.value = null
      comparing.value = false
      return
    }
    comparing.value = true
    error.value = null
    try {
      const answer = await props.compare(session.sessionId, pathname, diffMode.value)
      if (ticket === compareTicket) compared.value = { pathname, answer }
    } catch (reason) {
      if (ticket === compareTicket) {
        compared.value = null
        error.value = reason
      }
    } finally {
      if (ticket === compareTicket) comparing.value = false
    }
  }

  function firstChangeOf(session: SessionView | null): string | null {
    return session?.changes[0]?.pathname ?? null
  }

  function selectSession(session: SessionView | null): void {
    active.value = session
  }

  function selectChange(pathname: string): void {
    selectedPath.value = pathname
  }

  function openChange(pathname: string): void {
    selectedPath.value = pathname
    diffOpen.value = true
  }

  async function refresh(): Promise<void> {
    error.value = null
    try {
      sessions.value = await props.loadSessions()
      const previous = active.value?.sessionId
      const preferred =
        sessions.value.find((s) => s.sessionId === previous) ??
        sessions.value.find((s) => s.status === 'proposed') ??
        sessions.value.find((s) => s.status === 'open' && s.sources.length > 0) ??
        sessions.value.find((s) => s.status === 'open' && s.changes.length > 0) ??
        sessions.value[0] ??
        null
      active.value = preferred
    } catch (reason) {
      error.value = reason
    }
  }

  async function guarded(work: () => Promise<void>): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      await work()
      return true
    } catch (reason) {
      error.value = reason
      return false
    } finally {
      busy.value = false
    }
  }

  async function run(action: 'accept' | 'reject'): Promise<boolean> {
    const session = active.value
    if (session == null) return false
    const done = await guarded(() => (action === 'accept' ? props.accept(session.sessionId) : props.reject(session.sessionId)))
    if (done) await refresh()
    return done
  }

  async function openInDocuments(pathname = selectedPath.value): Promise<void> {
    const session = active.value
    if (session == null || pathname == null) return
    await guarded(() => props.openOverlay(session.sessionId, pathname))
  }

  async function openSource(pathname: string, excerpt: string): Promise<void> {
    await guarded(() => props.openSource(pathname, excerpt))
  }

  function toggleMode(): void {
    diffMode.value = diffMode.value === 'agent' ? 'apply' : 'agent'
  }

  // A session opens on its first change: a proposal is read change by change, and an empty diff pane asks the
  // reader to pick what they came to read anyway. A refresh that keeps the session keeps the chosen change.
  watch(
    () => active.value,
    (session, before) => {
      const kept = session != null && before != null && session.sessionId === before.sessionId
      if (kept && session.changes.some((c) => c.pathname === selectedPath.value)) return
      selectedPath.value = firstChangeOf(session)
    },
  )

  watch([() => active.value?.sessionId, selectedPath, diffMode], () => {
    void loadCompare()
  })

  watch(active, (session) => {
    if (session == null) diffOpen.value = false
  })

  return {
    sessions,
    active,
    selectedPath,
    selectedChange,
    selectedName,
    diffMode,
    busy,
    error,
    archived,
    comparing,
    request,
    diffOpen,
    diffController,
    selectSession,
    selectChange,
    openChange,
    refresh,
    run,
    openInDocuments,
    openSource,
    toggleMode,
  }
}

export type AiWorkspaceCore = ReturnType<typeof createAiWorkspaceState>

// The component's view of the workspace: the shared state when the page is the type's own, a private one when the
// page is embedded with props of its own, plus the diff of the open change.
export function useAiWorkspace(props: AiWorkspaceProps, shared?: AiWorkspaceCore) {
  const state = shared ?? createAiWorkspaceState(props)
  const diff = useDiff(state.request)
  const parts = computed((): DiffPart[] =>
    (state.active.value?.changes ?? []).map((change) => ({
      id: change.pathname,
      label: posix.basename(change.pathname),
      meta: kindLabel(change.kind),
      icon: CHANGE_ICONS[change.kind],
    })),
  )
  onMounted(state.refresh)
  return { ...state, diff, parts }
}

export type AiWorkspaceState = ReturnType<typeof useAiWorkspace>

// One shared state per workspace extension, in a scope of its own: its watchers belong to no component, so they
// are stopped by the plugin (`disposeAiWorkspaceState`) and not by whichever component happened to mount first.
const shared = new WeakMap<AiWorkspaceProps, { state: AiWorkspaceCore; stop: () => void }>()

export function aiWorkspaceState(api: AiWorkspaceProps): AiWorkspaceCore {
  const known = shared.get(api)
  if (known != null) return known.state
  const scope = effectScope(true)
  const state = scope.run(() => createAiWorkspaceState(api))
  if (state == null) throw illegalState('The AI workspace state scope was stopped before it ran')
  shared.set(api, { state, stop: () => scope.stop() })
  return state
}

export function disposeAiWorkspaceState(api: AiWorkspaceProps): void {
  shared.get(api)?.stop()
  shared.delete(api)
}
