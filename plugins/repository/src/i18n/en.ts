export const en = {
  settings: { title: 'Storage' },
  config: {
    materializeUpTo: {
      title: 'Keep files up to (MB) on this device',
      description: '0 keeps everything on this device; larger files stay on the server until opened',
      unit: 'MB',
    },
    'merge.textExtensions': {
      title: 'Merge as text',
      description:
        'Files with these extensions are merged line by line when both devices edited them; what still disagrees is marked in the file. Anything else becomes a conflict copy beside the original.',
    },
  },
  // packages/sync has no UI of its own, so the codes it raises are said here, by the plugin whose
  // surfaces show them.
  errors: {
    RepositoryVersionOfflineError: { title: 'Version on the server', message: 'Connect to the sync server to download this version.' },
    RepositoryFileOfflineError: { title: 'File on the server', message: 'This file is on the server — turn sync on to open it.' },
    RepositoryRangeOfflineError: { title: 'Not cached', message: 'This part of the file is not cached — turn sync on and retry.' },
    RepositoryStorageOfflineError: {
      title: 'Storage on the server',
      message: 'Storage for plugin "{plugin}" is on the server — turn sync on before using it.',
    },
    RepositoryStorageChangedError: {
      title: 'Storage changed',
      message: 'Storage for plugin "{plugin}" changed while it was being prepared — retry the action.',
    },
    SyncHeadMovedError: { title: 'Remote head moved', message: 'Another device committed to the remote while this sync was in progress.' },
    RepoHeadMovedError: {
      title: 'Repository head moved',
      message: 'Another writer advanced the repository head while this one was working; the change was not recorded.',
    },
  },
} as const
