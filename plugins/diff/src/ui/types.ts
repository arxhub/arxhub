import type { ActionItem } from '@arxhub/uikit/core'
import type { ChangeKind, DiffResult } from '../model'
import type { DiffController } from './controller'

export type DiffLayout = 'stream' | 'side'
export type SheetView = 'list' | 'grid'

export const DIFF_ZOOM_STEPS = [0.75, 0.9, 1, 1.25, 1.5] as const

// One piece of what a host compares — a file of an AI proposal, a sheet of a workbook — listed in the mobile band.
export interface DiffPart {
  id: string
  label: string
  meta?: string
  icon?: string
  change?: ChangeKind | 'renamed'
}

export interface DiffViewProps {
  result: DiffResult
  // Passed when the host draws a band of its own (the phone's dock) that must step the same view.
  controller?: DiffController
  title: string
  icon?: string
  // Host items appended to «…» (restore, accept, back…).
  actions?: readonly ActionItem[]
  openDocument?: () => void
}

// The phone's band for a diff. It shares its `controller` with the DiffView it steps, since the host draws the two
// in different places (content above, band in the dock).
export interface DiffBandProps {
  controller: DiffController
  title: string
  icon?: string
  // Host parts (an AI proposal's files, saved versions); the name opens them when there is more than one.
  parts?: readonly DiffPart[]
  partsTitle?: string
  activePart?: string
  actions?: readonly ActionItem[]
  openDocument?: () => void
}
