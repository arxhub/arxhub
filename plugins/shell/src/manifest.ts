import type { PluginManifest } from '@arxhub/core'

// Single source for ShellPlugin — composition and disabled/maintenance keys read this name.
const manifest = {
  name: 'Shell',
  version: '0.1.0',
  author: 'arxhub',
  description: 'App shell layout with the tab-type navigation registry',
  descriptions: { ru: 'Оболочка приложения и реестр типов' },
  // Nothing renders without the frame.
  essential: true,
} satisfies PluginManifest

export default manifest
