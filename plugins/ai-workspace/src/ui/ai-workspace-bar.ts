import { posix } from '@arxhub/path'
import { type DiffController, diffBarControls, sheetIcon, sheetMeta } from '@arxhub/plugin-diff/ui'
import type { ObjectBar, ObjectBarPart } from '@arxhub/plugin-shell'
import type { ActionItem } from '@arxhub/uikit/core'
import { type AiWorkspaceCore, CHANGE_ICONS, MODE_OPTIONS } from './use-ai-workspace'

// Part ids say which list they came from: a proposal file and a workbook's sheet share one parts sheet.
const FILE = 'file:'
const SHEET = 'sheet:'

// An action picked in the band's More runs while that sheet is still closing over a history entry of its own;
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

// The phone's band for the AI workspace: the session on screen, its proposal files as the parts the name opens,
// and what is done to a proposal. While one file's diff is open the same band carries the diff — the file's name,
// "k из n", the two steps and the view options — and a workbook's sheets hang under its file in the parts, so
// the phone has one band for the diff as it has for everything else.
export function aiWorkspaceBar(state: AiWorkspaceCore): ObjectBar | null {
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
  const accept: ActionItem = {
    id: 'ai.accept',
    label: 'Accept all',
    icon: 'lu:check',
    disabled: settled,
    onSelect: () => void finish(state, 'accept'),
  }
  const reject: ActionItem = {
    id: 'ai.reject',
    label: 'Reject',
    icon: 'lu:x',
    tone: 'danger',
    disabled: settled,
    onSelect: () => void finish(state, 'reject'),
  }
  if (state.diffOpen.value) return diffBar(state, state.diffController.value, accept, reject)
  const files = fileParts(state, [])
  return {
    icon: 'lu:bot',
    name: session.sessionId,
    sub: session.status,
    parts: files.length === 0 ? undefined : { title: 'Proposal files', items: files, pick: (id) => pickPart(state, null, id, true) },
    actions: [accept, refresh],
    menu: [{ id: 'ai.sessions', label: 'All sessions', icon: 'lu:list', onSelect: () => state.selectSession(null) }, reject],
  }
}

async function finish(state: AiWorkspaceCore, action: 'accept' | 'reject'): Promise<void> {
  if (await state.run(action)) state.diffOpen.value = false
}

function fileParts(state: AiWorkspaceCore, sheets: ObjectBarPart[]): ObjectBarPart[] {
  return (state.active.value?.changes ?? []).flatMap((change) => {
    const selected = change.pathname === state.selectedPath.value
    const file: ObjectBarPart = {
      id: FILE + change.pathname,
      title: posix.basename(change.pathname),
      subtitle: change.kind,
      icon: CHANGE_ICONS[change.kind],
      selected,
    }
    return selected ? [file, ...sheets] : [file]
  })
}

function pickPart(state: AiWorkspaceCore, controller: DiffController | null, id: string, open: boolean): void {
  if (id.startsWith(SHEET)) {
    if (controller != null) controller.tabId.value = id.slice(SHEET.length)
    return
  }
  const pathname = id.slice(FILE.length)
  if (open) state.openChange(pathname)
  else state.selectChange(pathname)
}

function diffBar(state: AiWorkspaceCore, controller: DiffController | null, accept: ActionItem, reject: ActionItem): ObjectBar {
  const back: ActionItem = {
    id: 'ai.back',
    label: 'Back to proposal',
    icon: 'lu:arrow-left',
    onSelect: () =>
      afterSheet(() => {
        state.diffOpen.value = false
      }),
  }
  const mode: ActionItem = {
    id: 'ai.mode',
    label: `Mode: ${MODE_OPTIONS.find((option) => option.value !== state.diffMode.value)?.label ?? ''}`,
    icon: 'lu:git-compare',
    onSelect: state.toggleMode,
  }
  // The diff is still being computed (or failed): the band still says which file, and the way back.
  if (controller?.result.value == null) {
    return { icon: 'lu:file-text', name: state.selectedName.value, menu: [mode, back, accept, reject] }
  }
  const controls = diffBarControls(controller, { openDocument: () => void state.openInDocuments() })
  const sheets = controls.sheets.map(
    (tab): ObjectBarPart => ({
      id: SHEET + tab.id,
      title: tab.name,
      subtitle: sheetMeta(tab),
      icon: sheetIcon(tab),
      selected: tab.id === controls.activeSheet,
      tone: tab.status === 'removed' ? 'danger' : 'neutral',
      depth: 1,
    }),
  )
  const items = fileParts(state, sheets)
  return {
    icon: controls.sheets.length > 0 ? 'lu:table-2' : 'lu:file-text',
    name: state.selectedName.value,
    sub: controls.sub || undefined,
    // A chevron promises a choice; one file with no sheets under it is none.
    parts: items.length > 1 ? { title: 'Proposal files', items, pick: (id) => pickPart(state, controller, id, false) } : undefined,
    actions: controls.actions,
    menu: [...controls.menu, mode, back, accept, reject],
  }
}
