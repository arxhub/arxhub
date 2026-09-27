import type { PluginManifest } from '@arxhub/core'

// Not essential: without it a proposal or a version still opens whole, it only loses the comparison.
export const manifest = {
  name: 'Diff',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Format-neutral comparison of two versions of a file',
  descriptions: { ru: 'Сравнение двух версий файла в любом формате' },
} satisfies PluginManifest
