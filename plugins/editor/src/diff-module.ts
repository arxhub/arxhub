import { posix } from '@arxhub/path'
import type { Node, Schema } from 'prosemirror-model'
import { versionText } from './document-history'
import type { ArxFormatConfig } from './document-migrations'
import { deserialize } from './editor-format'
import { type BlockDifference, versionDifferences } from './version-diff'

export type DiffLineType = 'equal' | 'added' | 'removed'

export interface DiffLine {
  type: DiffLineType
  text: string
}

export interface DiffBlockSummary {
  key: string
  kind: BlockDifference['kind']
  summary: string
  beforeText?: string
  afterText?: string
}

export interface DiffResult {
  kind: 'lines' | 'blocks' | 'replaced'
  leftLabel: string
  rightLabel: string
  lines?: DiffLine[]
  blocks?: DiffBlockSummary[]
  leftPreview?: string
  rightPreview?: string
  leftBytes?: number
  rightBytes?: number
}

export interface DiffTextsInput {
  left: string | Uint8Array
  right: string | Uint8Array
  pathname: string
  leftLabel: string
  rightLabel: string
  schema?: Schema
  format?: ArxFormatConfig
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    return text.includes('\0') ? null : text
  } catch {
    return null
  }
}

function previewOf(text: string | null, bytes: Uint8Array): string {
  if (text != null) return text.slice(0, 240)
  return `[binary ${bytes.byteLength} bytes]`
}

/** Line diff via LCS (dependency-free; fine for note-sized texts). */
export function diffLines(left: string, right: string): DiffLine[] {
  const a = left.split('\n')
  const b = right.split('\n')
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'equal', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'removed', text: a[i] })
      i++
    } else {
      out.push({ type: 'added', text: b[j] })
      j++
    }
  }
  while (i < m) {
    out.push({ type: 'removed', text: a[i] })
    i++
  }
  while (j < n) {
    out.push({ type: 'added', text: b[j] })
    j++
  }
  return out
}

function blockSummary(change: BlockDifference): DiffBlockSummary {
  const node = change.after ?? change.before
  const label = node ? versionText(node) || node.textContent || node.type.name : ''
  return {
    key: change.key,
    kind: change.kind,
    summary: `${change.kind} · ${label}`.trim(),
    beforeText: change.before ? versionText(change.before) || change.before.textContent : undefined,
    afterText: change.after ? versionText(change.after) || change.after.textContent : undefined,
  }
}

export function diffNodes(input: { left: Node; right: Node; leftLabel: string; rightLabel: string }): DiffResult {
  // versionDifferences(current, previous) — right is current, left is the saved/base side.
  const blocks = versionDifferences(input.right, input.left).map(blockSummary)
  return {
    kind: 'blocks',
    leftLabel: input.leftLabel,
    rightLabel: input.rightLabel,
    blocks,
    leftPreview: versionText(input.left),
    rightPreview: versionText(input.right),
  }
}

export function diffTexts(input: DiffTextsInput): DiffResult {
  const leftBytes = toBytes(input.left)
  const rightBytes = toBytes(input.right)
  const leftText = decodeText(leftBytes)
  const rightText = decodeText(rightBytes)

  if (leftText == null || rightText == null) {
    return {
      kind: 'replaced',
      leftLabel: input.leftLabel,
      rightLabel: input.rightLabel,
      leftPreview: previewOf(leftText, leftBytes),
      rightPreview: previewOf(rightText, rightBytes),
      leftBytes: leftBytes.byteLength,
      rightBytes: rightBytes.byteLength,
    }
  }

  const ext = posix.extname(input.pathname).toLowerCase()
  if (ext === '.arx' && input.schema) {
    try {
      const leftDoc = deserialize(input.schema, leftText, input.format)
      const rightDoc = deserialize(input.schema, rightText, input.format)
      return diffNodes({
        left: leftDoc,
        right: rightDoc,
        leftLabel: input.leftLabel,
        rightLabel: input.rightLabel,
      })
    } catch {
      // Invalid .arx on either side — fall through to a line diff of the raw text.
    }
  }

  return {
    kind: 'lines',
    leftLabel: input.leftLabel,
    rightLabel: input.rightLabel,
    lines: diffLines(leftText, rightText),
    leftPreview: leftText.slice(0, 240),
    rightPreview: rightText.slice(0, 240),
  }
}
