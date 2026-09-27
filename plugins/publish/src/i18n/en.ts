export const en = {
  type: {
    title: 'Publications',
    summary: 'Shared by link',
    sheetTitle: 'Paths',
  },
  settings: {
    title: 'Publishing',
    description: 'Share selected notes and folders through public links.',
  },
  config: {
    serverUrl: { title: 'Server URL', description: 'ArxHub server origin, e.g. https://hub.example.com' },
    'history.limit': { title: 'History length', description: 'How many publications are remembered — each one can be rolled back to.' },
  },
  warning: {
    file: '"{name}" and its attachments will be uploaded unencrypted and readable by anyone with the link. Unpublishing stops serving them, but cannot recall copies already downloaded.',
    folder:
      '"{name}" and everything inside it, attachments included, will be uploaded unencrypted and readable by anyone with the link. Unpublishing stops serving them, but cannot recall copies already downloaded.',
  },
  action: {
    publish: 'Publish',
    republish: 'Republish',
    unpublish: 'Unpublish',
    copyPublicLink: 'Copy public link',
    copyLink: 'Copy link',
    openInBrowser: 'Open in browser',
    rollBack: 'Roll back',
    cancel: 'Cancel',
    more: 'More publication actions',
    menuTitle: 'Publication',
  },
  toast: {
    published: 'Published',
    unpublished: 'Unpublished',
    linkCopied: 'Link copied',
    rolledBack: 'Rolled back',
    rolledBackDescription: '{counts} are public again',
  },
  failed: {
    publish: 'Could not publish {path}',
    unpublish: 'Could not unpublish {path}',
    copyLink: 'Could not copy link for {path}',
    rollBack: 'Could not roll back to {hash}',
  },
  export: {
    markdown: 'Export Markdown',
    html: 'Export HTML',
    print: 'Print / Save PDF',
    failed: 'Export failed',
    printFailed: 'Printing failed',
  },
  counts: {
    roots: { one: '{count} root', other: '{count} roots' },
    files: { one: '{count} file', other: '{count} files' },
    paths: { one: '{count} published path', other: '{count} published paths' },
  },
  bar: {
    nothingPublished: 'Nothing published',
    off: 'Publishing is off',
  },
  page: {
    offMeta: 'Publishing is off — set a server URL in Settings',
    published: 'Published',
    history: 'History',
    empty: 'Nothing is published. Publish a note or a folder from the tree.',
    offHint: 'Turn publishing on to share a note or a folder by link.',
    historyEmpty: 'History starts with the first publication.',
    current: 'Current',
  },
  kind: {
    publish: 'Published',
    unpublish: 'Unpublished',
    rollback: 'Rolled back',
  },
  sheet: {
    label: 'Published paths',
    empty: 'Nothing is published.',
  },
  errors: {
    PublishStorageUnavailableError: { title: 'Publication storage unavailable', message: 'Publication storage is not available' },
    PublishExportUnsavedError: { title: 'Document not saved', message: 'Save or recover the document before exporting it' },
    PublishUnsavedError: { title: 'Documents not saved', message: 'Save or recover open documents before publishing' },
    PublishExportUnsupportedError: { title: 'Cannot export', message: 'This document cannot be exported with the installed plugins' },
    PublishNotConfiguredError: {
      title: 'Publishing is off',
      message: 'Publishing is not configured — set the server URL and identity in Settings',
    },
    PublicationNotInHistoryError: { title: 'Publication not found', message: 'Publication {publication} is not in the history' },
    PublicationGoneError: { title: 'Publication gone', message: 'The server no longer holds publication {publication}' },
    PublishHistoryMovedError: {
      title: 'Publication changed',
      message: 'The publication changed on another device since this history was read — look at it again before rolling back',
    },
    PublishHeadMovedError: { title: 'Publication changed', message: 'Publish head moved during upload — try publishing again' },
  },
} as const
