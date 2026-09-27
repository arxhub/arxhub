import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'budget',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Accounts, income, expenses and monthly totals',
  descriptions: { ru: 'Счета, доходы, расходы и итоги по месяцам' },
} satisfies PluginManifest

export const BUDGET_NAMESPACE = 'budget'

export const serverManifest = {
  ...manifest,
  name: 'BudgetServer',
  namespace: BUDGET_NAMESPACE,
  description: 'Private receipt lookup through the official FNS API',
  descriptions: { ru: 'Проверка чеков через официальный API ФНС' },
} satisfies PluginManifest
