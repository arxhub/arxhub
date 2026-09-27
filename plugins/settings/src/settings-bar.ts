import { readText } from '@arxhub/i18n'
import type { ObjectBar } from '@arxhub/plugin-shell'
import { t } from './i18n/messages'
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
    name: readText(section.title),
    sub: edits === 0 ? undefined : t('pending.sub', { count: edits }),
    menu: [
      {
        id: 'settings.discard',
        label: t('pending.discard'),
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
