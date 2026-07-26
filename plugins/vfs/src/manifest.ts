import { definePluginManifest } from '@arxhub/core'

export const manifest = definePluginManifest({
  name: 'Vfs',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Virtual file system provider for ArxHub',
  // Every plugin's config and state is a file; without the VFS there is nothing to read them from.
  essential: true,
})
