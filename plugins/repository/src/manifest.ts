import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'Repository',
  version: '0.1.0',
  author: 'arxhub',
  description: 'The local repository: manifest chain, chunk store, checkout index and file history',
  // The editor's version history and the explorer's cloud (pending) nodes stand on this — a switch
  // that silently removed version history is a switch nobody would knowingly flip (A-50). `Sync`
  // stays optional: it is the remote exchange layered on top of this.
  essential: true,
} satisfies PluginManifest
