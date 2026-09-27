export const en = {
  type: {
    title: 'Settings',
    sections: 'Sections',
    summary: 'App and device',
  },
  nav: {
    label: 'Settings sections',
  },
  page: {
    unknown: 'Unknown settings section: {id}',
    none: 'No plugin has registered a settings section.',
  },
  pending: {
    title: 'Unsaved settings changes',
    count: { one: '{count} unsaved setting', other: '{count} unsaved settings' },
    sub: '{count} unsaved',
    discard: 'Discard section changes',
  },
  changes: {
    applying: 'Applying…',
    fields: { one: '{count} unsaved change', other: '{count} unsaved changes' },
    across: { one: '{changes} across {count} section', other: '{changes} across {count} sections' },
    applied: { one: 'Applied {count} change', other: 'Applied {count} changes' },
    saveFailed: 'Could not save {name}',
    unreported: 'The reason was not reported — see the log.',
    blocked: 'Fix the highlighted fields to apply',
    revert: 'Revert',
    apply: 'Save & apply',
    hotkey: 'Save & apply settings',
  },
  language: {
    title: 'Language',
    description: 'The language of the interface. It is kept on this device only — other devices keep their own.',
    label: 'Interface language',
    system: 'System ({name})',
    systemHint: 'Follows the language this device is set to',
  },
} as const
