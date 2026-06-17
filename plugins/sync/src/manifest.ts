import { definePluginManifest } from '@arxhub/core'

export const manifest = definePluginManifest({
  name: 'sync',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Manual sync between local VFS and a remote ArxHub server',
})
