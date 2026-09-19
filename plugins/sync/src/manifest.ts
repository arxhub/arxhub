import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'sync',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Manual sync between local VFS and a remote ArxHub server',
} satisfies PluginManifest

export const serverManifest = {
  name: 'SyncServer',
  namespace: 'sync',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Serves the batched sync object-store protocol over HTTP',
} satisfies PluginManifest
