import type { ObjectBar } from '@arxhub/plugin-shell'
import type { SettingsExtension } from './settings-extension'

// The phone's band in Settings: which section is on screen, and the one thing done to a section as a whole —
// dropping what was staged in it. Saving stays in SettingsChangesBar, because the set being saved spans
// sections and a band names one.
export function settingsBar(settings: SettingsExtension): ObjectBar | null {
  const id = settings.activeId.value
  const section = settings.sections.value.find((entry) => entry.id === id)
  if (section == null) return null
  const staged = settings.changes.staged.value.find((change) => change.sectionId === section.id)
  const edits = staged?.keys.length ?? 0
  return {
    icon: section.icon ?? 'lu:settings',
    name: section.title,
    sub: edits === 0 ? undefined : `${edits} unsaved`,
    menu: [
      {
        id: 'settings.discard',
        label: 'Discard section changes',
        icon: 'lu:undo-2',
        disabled: staged == null,
        onSelect: () => {
          staged?.revert()
          settings.changes.clear(section.id)
        },
      },
    ],
  }
}
