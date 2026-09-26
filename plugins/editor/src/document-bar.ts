import type { ActionItem } from '@arxhub/uikit/core'
import type { EditorMode } from './editor-mode'

export const EDITOR_MODES: readonly { value: EditorMode; label: string; description: string }[] = [
  { value: 'readonly', label: 'Read only', description: 'Read and copy; no changes' },
  { value: 'editable', label: 'Editable', description: 'Write, format and arrange blocks' },
  { value: 'interactive', label: 'Interactive', description: 'Change control values; protect text' },
]

export interface DocumentBarState {
  mode: EditorMode
  // The document is loaded and may be written — every tool but the mode needs it.
  canSave: boolean
  // An attachment is uploading: nothing may rearrange the document under it.
  busy: boolean
  hasLinks: boolean
  hasHistory: boolean
  publication: readonly ActionItem[]
}

export interface DocumentBarHandlers {
  outline(): void
  find(): void
  properties(): void
  versions(): void
  mode(mode: EditorMode): void
  appearance(): void
  save(): void
  backlinks(): void
  copyLink(): void
}

// What the editor adds to its document's More on the phone, after the type's own Close. The order is the
// mock's: the reader's tools first (outline, find), then what describes the document (properties, its
// versions), then everything rarer. Undo and redo are not here: they belong to editing, and the band's
// editing toolbar carries them for exactly as long as the keyboard is up.
export function documentBarMenu(state: DocumentBarState, on: DocumentBarHandlers): ActionItem[] {
  const unavailable = !state.canSave
  const mode = EDITOR_MODES.find((item) => item.value === state.mode)
  return [
    { id: 'editor.outline', label: 'Document outline', icon: 'lu:list-tree', disabled: unavailable, onSelect: on.outline },
    { id: 'editor.find', label: 'Find in document', icon: 'lu:search', disabled: unavailable, onSelect: on.find },
    { id: 'editor.properties', label: 'Properties', icon: 'lu:tags', disabled: unavailable, onSelect: on.properties },
    ...(state.hasHistory
      ? [{ id: 'editor.versions', label: 'Saved versions', icon: 'lu:history', disabled: unavailable, onSelect: on.versions }]
      : []),
    // One row that opens the choice rather than three rows beside the tools: the choice needs to say
    // which one is current, which a row of a flat menu has no way to.
    {
      id: 'editor.mode',
      label: `Editor mode: ${mode?.label ?? state.mode}`,
      icon: 'lu:pencil',
      disabled: state.busy,
      onSelect: () => on.mode(state.mode),
    },
    {
      id: 'editor.appearance',
      label: 'Page icon and cover',
      icon: 'lu:image',
      disabled: unavailable || state.busy || state.mode !== 'editable',
      onSelect: on.appearance,
    },
    ...(state.mode !== 'readonly' ? [{ id: 'editor.save', label: 'Save', icon: 'lu:save', disabled: unavailable, onSelect: on.save }] : []),
    ...(state.hasLinks
      ? [
          { id: 'editor.backlinks', label: 'Backlinks', icon: 'lu:link-2', disabled: unavailable, onSelect: on.backlinks },
          { id: 'editor.copy-link', label: 'Copy link to block', icon: 'lu:link', disabled: unavailable, onSelect: on.copyLink },
        ]
      : []),
    ...state.publication.map((action) => ({ ...action, disabled: unavailable || state.busy || action.disabled })),
  ]
}

// The picker the mode row opens: the current mode is the one row that cannot be picked again.
export function editorModeMenu(current: EditorMode, pick: (mode: EditorMode) => void): ActionItem[] {
  return EDITOR_MODES.map((item) => ({
    id: `editor.mode.${item.value}`,
    label: item.value === current ? `${item.label} (current)` : item.label,
    icon: item.value === 'readonly' ? 'lu:eye' : item.value === 'editable' ? 'lu:pencil' : 'lu:mouse-pointer-click',
    disabled: item.value === current,
    onSelect: () => pick(item.value),
  }))
}

export interface DocumentBarStatus {
  canSave: boolean
  loadError: boolean
  saveError: boolean
  saving: boolean
  uploading: boolean
  unsaved: boolean
  mode: EditorMode
}

// The quieter half of the band's name. Silent while all is well, as the desktop tab is: "Saved" on every
// screen would be a word nobody reads, and the one that matters would then be missed.
export function documentBarSub(status: DocumentBarStatus): string | undefined {
  if (status.loadError) return 'Unavailable'
  if (!status.canSave) return 'Loading…'
  if (status.saveError) return 'Save failed'
  if (status.uploading) return 'Uploading attachment…'
  if (status.saving) return 'Saving…'
  if (status.unsaved) return 'Unsaved changes'
  if (status.mode === 'readonly') return 'Read only'
  if (status.mode === 'interactive') return 'Interactive'
  return undefined
}
