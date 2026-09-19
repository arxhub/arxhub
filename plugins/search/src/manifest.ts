import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'search',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Local SQL index over the content store, and search on top of it',
  // Deliberately not essential: the app is usable without search, and an index that will not open on
  // one device must be switchable off there without taking the boot with it.
} satisfies PluginManifest
