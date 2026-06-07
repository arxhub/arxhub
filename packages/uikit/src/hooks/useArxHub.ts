import type { ArxHub } from '@arxhub/core'
import { type InjectionKey, inject } from 'vue'

export const ARXHUB_KEY: InjectionKey<ArxHub> = Symbol('arxhub')

export function useArxHub(): ArxHub {
  const arxhub = inject(ARXHUB_KEY)
  if (!arxhub) throw new Error('useArxHub() called outside ArxHub context')
  return arxhub
}
