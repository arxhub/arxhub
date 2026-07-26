import { definePluginManifest } from '@arxhub/core'

export const manifest = definePluginManifest({
  name: 'Config',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Config provider for ArxHub',
  // Settings pages read and write through the scoped config service — no config, no way to fix things.
  essential: true,
})
