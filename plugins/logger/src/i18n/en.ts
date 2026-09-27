export const en = {
  type: {
    title: 'Logs',
    summary: 'App events',
    sheetTitle: 'Levels',
  },
  levels: {
    debug: 'Debug',
    info: 'Info',
    warn: 'Warnings',
    error: 'Errors',
    all: 'All levels',
    none: 'No levels',
  },
  bar: {
    errors: { one: '{count} error', other: '{count} errors' },
    reload: 'Reload sessions',
    clear: 'Clear log',
  },
  sheet: {
    label: 'Log levels and sessions',
    levels: 'Levels',
    session: 'Session',
  },
  session: {
    live: 'Live',
    label: 'Log session',
  },
  filter: {
    placeholder: 'Filter logs…',
    label: 'Filter logs',
  },
  panel: {
    reload: 'Reload sessions',
    clear: 'Clear',
    empty: 'No log entries.',
  },
  status: {
    open: 'Open logs',
    name: 'Logs',
  },
} as const
