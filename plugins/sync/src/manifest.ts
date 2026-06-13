import { definePluginManifest } from '@arxhub/core'

export const manifest = definePluginManifest({
  name: 'sync',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Manual sync between local VFS and a remote ArxHub server',
  // Needs read/write across the whole synced tree (user content + every plugin's config) to chunk it.
  // Its own repo store lives in state/ (local, never synced), so it cannot chunk itself.
  permissions: ['vfs:default', { identifier: 'vfs:scope', allow: [{ path: 'vault/**' }, { path: 'storage/**' }] }],
})
