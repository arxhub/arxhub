import { posix } from '@arxhub/path'
import type { ObjectBar } from '@arxhub/plugin-shell'
import { type AiWorkspaceCore, CHANGE_ICONS } from './use-ai-workspace'

// The phone's band for the AI workspace: the session on screen, its proposal files as the parts the name opens,
// and what is done to a proposal. While one file's diff is open the diff's own band takes the place (it knows
// the next change and the view options), so this one answers null rather than stacking a second band.
export function aiWorkspaceBar(state: AiWorkspaceCore): ObjectBar | null {
  if (state.diffOpen.value) return null
  const session = state.active.value
  const refresh = {
    id: 'ai.refresh',
    label: 'Refresh',
    icon: 'lu:refresh-cw',
    disabled: state.busy.value,
    onSelect: () => void state.refresh(),
  }
  if (session == null) {
    const count = state.sessions.value.length
    return { icon: 'lu:bot', name: 'AI workspace', sub: `${count} ${count === 1 ? 'session' : 'sessions'}`, actions: [refresh] }
  }
  const settled = state.busy.value || state.archived.value
  return {
    icon: 'lu:bot',
    name: session.sessionId,
    sub: session.status,
    parts:
      session.changes.length === 0
        ? undefined
        : {
            title: 'Proposal files',
            items: session.changes.map((change) => ({
              id: change.pathname,
              title: posix.basename(change.pathname),
              subtitle: change.kind,
              icon: CHANGE_ICONS[change.kind],
              selected: change.pathname === state.selectedPath.value,
            })),
            pick: (pathname) => state.openChange(pathname),
          },
    actions: [{ id: 'ai.accept', label: 'Accept all', icon: 'lu:check', disabled: settled, onSelect: () => void state.run('accept') }, refresh],
    menu: [
      { id: 'ai.sessions', label: 'All sessions', icon: 'lu:list', onSelect: () => state.selectSession(null) },
      { id: 'ai.reject', label: 'Reject', icon: 'lu:x', tone: 'danger', disabled: settled, onSelect: () => void state.run('reject') },
    ],
  }
}
