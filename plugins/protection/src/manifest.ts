import { definePluginManifest } from '@arxhub/core'

export const manifest = definePluginManifest({
  name: 'protection',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Identity, content-encryption keys, and request authentication for ArxHub',
  // A protected VFS rejects unsigned requests, so switching this off would take config with it.
  essential: true,
})
