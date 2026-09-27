import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'ArxSheets',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Spreadsheets with offline formulas',
  descriptions: { ru: 'Таблицы с формулами, работающими без сети' },
} satisfies PluginManifest
