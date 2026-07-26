import { definePluginManifest } from '@arxhub/core'

export const manifest = definePluginManifest({
  name: 'Logger',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Logger provider for ArxHub',
  // The log viewer is the diagnostic surface a recovery boot exists to give you.
  essential: true,
})
