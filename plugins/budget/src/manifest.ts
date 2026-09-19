import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'budget',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Accounts, income, expenses and monthly totals',
} satisfies PluginManifest

export const BUDGET_NAMESPACE = 'budget'

export const serverManifest = {
  ...manifest,
  name: 'BudgetServer',
  namespace: BUDGET_NAMESPACE,
  description: 'Private receipt lookup through the official FNS API',
} satisfies PluginManifest
