import type { ChangeKind } from './session-store'

export type SessionChange = { pathname: string; kind: ChangeKind; fromPath?: string; toPath?: string }

export type SessionView = {
  sessionId: string
  status: string
  result: string | null
  baseSnapshotHash: string
  changes: SessionChange[]
  actions: Array<{ at: string; tool: string; pathname?: string; ok: boolean }>
  sources: Array<{ pathname: string; excerpt: string }>
}

export type CompareResult = {
  leftLabel: string
  rightLabel: string
  left: Uint8Array
  right: Uint8Array
}

// CompareResult as it crosses HTTP: each side is base64 (see bytes-wire.ts).
export type CompareWire = {
  leftLabel: string
  rightLabel: string
  left: string
  right: string
}
