import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'maintenance',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Plugin switches and the maintenance-mode boot',
  // The switch that turns other plugins off cannot be one of the things you can turn off.
  essential: true,
} satisfies PluginManifest
