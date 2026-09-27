import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'Documents',
  version: '0.1.0',
  author: 'arxhub',
  description: 'The "Documents" tab type: vault objects and the registry of what opens them',
  descriptions: { ru: 'Тип «Документы»: объекты хранилища и то, чем их открывать' },
  // There are no dependencies between ArxHub plugins — `PluginManifest` has no `dependsOn`. Without
  // `essential` two states nobody has designed become reachable: "documents off, explorer on" (a
  // navigation into a type that does not exist) and the reverse.
  essential: true,
} satisfies PluginManifest
