import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'Notes',
  version: '0.1.0',
  author: 'arxhub',
  description: 'The "Notes" tab type: vault objects and the registry of what opens them',
  // There are no dependencies between ArxHub plugins — `PluginManifest` has no `dependsOn`. Without
  // `essential` two states nobody has designed become reachable: "notes off, explorer on" (a
  // navigation into a type that does not exist) and the reverse.
  essential: true,
} satisfies PluginManifest
