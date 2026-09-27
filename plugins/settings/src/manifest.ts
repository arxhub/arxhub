import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'settings',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Global settings screen with a per-plugin section registry',
  descriptions: { ru: 'Экран настроек с разделами от плагинов' },
  // Where the plugin switches live.
  essential: true,
} satisfies PluginManifest
