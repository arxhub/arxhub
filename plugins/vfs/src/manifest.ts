import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'Vfs',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Virtual file system provider for ArxHub',
  // Every plugin's config and state is a file; without the VFS there is nothing to read them from.
  essential: true,
} satisfies PluginManifest

export const serverManifest = {
  name: 'VfsHttpServer',
  namespace: 'vfs',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Serves a VirtualFileSystem over HTTP for browser-mode clients',
} satisfies PluginManifest
