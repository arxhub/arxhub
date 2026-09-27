// The VFS packages have no UI of their own; the codes they raise are said here, by the plugin that
// provides the file system to everything that shows one.
export const en = {
  errors: {
    FileNotFound: { title: 'File not found', message: 'The file is no longer there.' },
    MountNotFound: { title: 'Location not found', message: 'Nothing is mounted at this path.' },
    ScopeAccessDenied: { title: 'Access denied', message: 'This path is outside what this part of the app may reach.' },
  },
} as const
