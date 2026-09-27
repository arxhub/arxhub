import type { PluginManifest } from '@arxhub/core'

// Single source for PanelsPlugin — composition and disabled/maintenance keys read this name.
const manifest = {
  name: 'Panels',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Tiling panel layout system',
  descriptions: { ru: 'Панели: вкладки и разделение экрана' },
  // Settings renders its pages into a panel store.
  essential: true,
} satisfies PluginManifest

export default manifest
