import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'keystore',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Client-local secure key/secret storage',
  // The store the identity was already resolved from before start(); requests are signed with it.
  essential: true,
} satisfies PluginManifest
