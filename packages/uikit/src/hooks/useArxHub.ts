import type { ArxHub } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { type InjectionKey, inject } from 'vue'

export const ARXHUB_KEY: InjectionKey<ArxHub> = Symbol('arxhub')

export function useArxHub(): ArxHub {
  const arxhub = inject(ARXHUB_KEY)
  if (!arxhub) throw illegalState('useArxHub() called outside ArxHub context')
  return arxhub
}
