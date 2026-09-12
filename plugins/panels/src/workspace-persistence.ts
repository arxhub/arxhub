import { watch } from 'vue'
import type { LayoutNode, PanelGroup, PanelStore, PanelWorkspaceState } from './types'

const STORAGE_KEY = 'arxhub.panels.workspace'
// Coalesces bursts (dragging a split ratio, opening several files in a row) into one write instead of
// one per intermediate frame.
const PERSIST_DEBOUNCE_MS = 500

// localStorage may be absent (non-browser env) or throw (Safari private mode, sandboxed iframe,
// storage disabled) — mirrors use-rail-width.ts's guard. Losing persistence is fine; losing the
// workspace itself over a storage hiccup would not be.
function safeGetItem(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Persistence unavailable — the in-memory workspace still works for this session.
  }
}

// Restores whatever was saved (best-effort: a corrupt or incompatible snapshot is dropped, not
// thrown), then persists every later change. Device-local by design — this is UI layout, not vault
// content, and never goes through sync. Call once, right where the store is created: registering the
// watcher in a component's setup scope would stop persisting the moment that component unmounts (the
// mini-app switches away), exactly the trap use-rail-width.ts's module-level effectScope works around.
export function restoreAndPersistWorkspace(store: PanelStore): () => void {
  const saved = safeGetItem(STORAGE_KEY)
  if (saved != null) {
    try {
      const state = parsePanelWorkspace(JSON.parse(saved))
      if (state != null) store.restore(state)
    } catch {
      // Shape changed, or the JSON itself is corrupt — start from an empty workspace rather than throw
      // during boot over a cache of UI state.
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.serialize(),
    (state) => {
      clearTimeout(timer)
      timer = setTimeout(() => safeSetItem(STORAGE_KEY, JSON.stringify(state)), PERSIST_DEBOUNCE_MS)
    },
  )
  return () => {
    stop()
    clearTimeout(timer)
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function parsePanelWorkspace(value: unknown): PanelWorkspaceState | null {
  if (!record(value) || !record(value.groups)) return null
  const groups: Record<string, PanelGroup> = {}
  for (const [id, group] of Object.entries(value.groups)) {
    if (!record(group) || !Array.isArray(group.instances)) return null
    const instances = []
    for (const instance of group.instances) {
      if (
        !record(instance) ||
        typeof instance.instanceId !== 'string' ||
        typeof instance.definitionId !== 'string' ||
        typeof instance.title !== 'string'
      )
        return null
      instances.push({
        instanceId: instance.instanceId,
        definitionId: instance.definitionId,
        title: instance.title,
        props: record(instance.props) ? instance.props : {},
      })
    }
    groups[id] = { id, instances, activeInstanceId: typeof group.activeInstanceId === 'string' ? group.activeInstanceId : null }
  }
  const layout = (node: unknown, depth = 0): LayoutNode | null => {
    if (!record(node) || depth > 8) return null
    if (node.type === 'leaf')
      return typeof node.groupId === 'string' && groups[node.groupId] != null ? { type: 'leaf', groupId: node.groupId } : null
    if (
      node.type !== 'split' ||
      typeof node.splitId !== 'string' ||
      (node.direction !== 'horizontal' && node.direction !== 'vertical') ||
      typeof node.ratio !== 'number' ||
      !Number.isFinite(node.ratio)
    )
      return null
    const first = layout(node.first, depth + 1)
    const second = layout(node.second, depth + 1)
    return first == null || second == null
      ? null
      : { type: 'split', splitId: node.splitId, direction: node.direction, ratio: Math.max(0.1, Math.min(0.9, node.ratio)), first, second }
  }
  const tree = value.layout == null ? null : layout(value.layout)
  if (value.layout != null && tree == null) return null
  return {
    groups,
    layout: tree,
    activeGroupId: typeof value.activeGroupId === 'string' && groups[value.activeGroupId] != null ? value.activeGroupId : null,
  }
}
