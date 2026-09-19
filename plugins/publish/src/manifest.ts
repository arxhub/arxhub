import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'publish',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Publishes vault pages/folders to the server as public read-only content',
} satisfies PluginManifest

export const serverManifest = {
  name: 'PublishServer',
  namespace: 'publish',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Serves published (plaintext, content-addressed) content and its owner-only upload routes',
} satisfies PluginManifest
