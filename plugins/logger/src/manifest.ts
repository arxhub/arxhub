import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'Logger',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Logger provider for ArxHub',
  descriptions: { ru: 'Журнал событий ArxHub' },
  // The log viewer is the diagnostic surface a recovery boot exists to give you.
  essential: true,
} satisfies PluginManifest
