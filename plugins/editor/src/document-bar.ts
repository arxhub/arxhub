import type { ActionItem } from '@arxhub/uikit/core'
import type { EditorMode } from './editor-mode'
import { t } from './i18n/messages'

export const EDITOR_MODES: readonly EditorMode[] = ['readonly', 'editable', 'interactive']

export function modeLabel(mode: EditorMode): string {
  return t(`modes.${mode}.label`)
}

export function modeDescription(mode: EditorMode): string {
  return t(`modes.${mode}.description`)
}

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
  return [
    { id: 'editor.outline', label: t('tools.outline'), icon: 'lu:list-tree', disabled: unavailable, onSelect: on.outline },
    { id: 'editor.find', label: t('tools.find'), icon: 'lu:search', disabled: unavailable, onSelect: on.find },
    { id: 'editor.properties', label: t('tools.properties'), icon: 'lu:tags', disabled: unavailable, onSelect: on.properties },
    ...(state.hasHistory
      ? [{ id: 'editor.versions', label: t('tools.versions'), icon: 'lu:history', disabled: unavailable, onSelect: on.versions }]
      : []),
    // One row that opens the choice rather than three rows beside the tools: the choice needs to say
    // which one is current, which a row of a flat menu has no way to.
    {
      id: 'editor.mode',
      label: t('modes.row', { mode: modeLabel(state.mode) }),
      icon: 'lu:pencil',
      disabled: state.busy,
      onSelect: () => on.mode(state.mode),
    },
    {
      id: 'editor.appearance',
      label: t('tools.appearance'),
      icon: 'lu:image',
      disabled: unavailable || state.busy || state.mode !== 'editable',
      onSelect: on.appearance,
    },
    ...(state.mode !== 'readonly'
      ? [{ id: 'editor.save', label: t('tools.save'), icon: 'lu:save', disabled: unavailable, onSelect: on.save }]
      : []),
    ...(state.hasLinks
      ? [
          { id: 'editor.backlinks', label: t('tools.backlinks'), icon: 'lu:link-2', disabled: unavailable, onSelect: on.backlinks },
          { id: 'editor.copy-link', label: t('tools.copyLink'), icon: 'lu:link', disabled: unavailable, onSelect: on.copyLink },
        ]
      : []),
    ...state.publication.map((action) => ({ ...action, disabled: unavailable || state.busy || action.disabled })),
  ]
}

// The picker the mode row opens: the current mode is the one row that cannot be picked again.
export function editorModeMenu(current: EditorMode, pick: (mode: EditorMode) => void): ActionItem[] {
  return EDITOR_MODES.map((mode) => ({
    id: `editor.mode.${mode}`,
    label: mode === current ? t('modes.current', { mode: modeLabel(mode) }) : modeLabel(mode),
    icon: mode === 'readonly' ? 'lu:eye' : mode === 'editable' ? 'lu:pencil' : 'lu:mouse-pointer-click',
    disabled: mode === current,
    onSelect: () => pick(mode),
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
  if (status.loadError) return t('status.unavailableShort')
  if (!status.canSave) return t('status.loading')
  if (status.saveError) return t('status.saveFailed')
  if (status.uploading) return t('status.uploading')
  if (status.saving) return t('status.saving')
  if (status.unsaved) return t('status.unsaved')
  if (status.mode !== 'editable') return modeLabel(status.mode)
  return undefined
}
