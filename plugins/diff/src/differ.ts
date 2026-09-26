import type { DiffModel, DiffTextModel } from './model'

export interface DiffSide {
  bytes: Uint8Array
  // Strict UTF-8 without a NUL, else null — see decodeText.
  text: string | null
}

export interface DiffContext {
  pathname: string
  // The generic text differ, for a format that would rather fall back itself than decline.
  text(left: string, right: string): DiffTextModel
}

export interface DifferRegistration {
  id: string
  // Asked with the vault-relative posix path; case handling is the differ's own.
  matches(pathname: string): boolean
  // null declines and the next matcher is asked; a throw is logged and treated as a decline.
  diff(left: DiffSide, right: DiffSide, ctx: DiffContext): DiffModel | null | Promise<DiffModel | null>
  // Generic differs run only once every format owner declined or none matched. Unlike content mergers, an
  // owner's decline does reach them: viewing a file as text cannot corrupt it.
  fallback?: boolean
}

export interface DiffRequest {
  pathname: string
  left: string | Uint8Array
  right: string | Uint8Array
  leftLabel: string
  rightLabel: string
}
