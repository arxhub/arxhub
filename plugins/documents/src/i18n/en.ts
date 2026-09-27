export const en = {
  type: {
    title: 'Documents',
    vault: 'Vault',
    vaultDetail: 'All documents · search',
    newNote: 'New note',
    openDocuments: 'Open documents',
    find: 'Find a document…',
    newDocument: 'New document',
  },
  // The stem of a note created with no tree to name it (the explorer switched off) — a file name, so the
  // reader's language, not a format word.
  defaultStem: 'New note',
  nav: {
    off: 'The explorer is switched off, so there is no vault tree here.',
    offHint: 'Documents open from search.',
  },
  unsupported: {
    headline: 'Nothing can open this file',
    hint: 'No installed viewer claims this extension.',
    openExternally: 'Open in system app',
    openFailed: 'Could not open the file in the system app',
  },
  actions: {
    rename: 'Rename',
    close: 'Close',
    delete: 'Delete',
    cancel: 'Cancel',
    deleteConfirm: 'Delete "{name}"? This action cannot be undone.',
    deleteFailed: 'Could not delete {name}',
    renameFailed: 'Could not rename to {name}',
  },
  rename: {
    title: 'Rename',
    name: 'Name',
    newName: 'New name',
    confirm: 'Rename',
  },
  common: {
    unreported: 'The reason was not reported — see the log.',
  },
  settings: {
    title: 'Documents',
    description: 'How ArxHub names the files it can open.',
  },
  config: {
    groups: { names: 'Names' },
    'names.hideKnownExtensions': {
      title: 'Hide known extensions',
      description:
        'A file whose extension a registered viewer recognises (".arx", ".md", …) shows its name only — in the tree and above the open document alike. The extension is still there on disk, and switching this off is how one is renamed.',
    },
  },
  errors: {
    DocumentNameEmptyError: { title: 'No name', message: 'A file needs a name' },
    DocumentNameInvalidError: { title: 'Not a name', message: '"{name}" is not a name' },
    DocumentNameSlashError: { title: 'Not a name', message: 'A name cannot hold a slash — rename a file here, move it in the tree' },
    DocumentNameTakenError: { title: 'Name taken', message: '"{name}" is already here' },
  },
} as const
