import type { PluginManifest } from '@arxhub/core'

export const AI_WORKSPACE_NAMESPACE = 'ai-workspace'

export const manifest = {
  name: 'AiWorkspace',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Agent worktree sessions and merge-request style acceptance',
  descriptions: { ru: 'Сессии агента в рабочей копии и приёмка правок целиком' },
} satisfies PluginManifest

export const serverManifest = {
  ...manifest,
  name: 'AiWorkspaceServer',
  namespace: AI_WORKSPACE_NAMESPACE,
  description: 'Local agent channel for AiWorkspace sessions (desktop/dev)',
  descriptions: { ru: 'Локальный канал агента для сессий AI (десктоп и стенд разработки)' },
} satisfies PluginManifest
