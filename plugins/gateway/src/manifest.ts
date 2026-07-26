import { definePluginManifest } from '@arxhub/core'

export default definePluginManifest({
  name: '@arxhub/plugin-gateway',
  version: '0.1.0',
  author: '',
  // The server IS the HTTP server; every other server plugin mounts its routes into this one.
  essential: true,
})
