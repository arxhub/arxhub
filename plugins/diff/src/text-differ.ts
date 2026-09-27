import { t } from './i18n/messages'
import type { DiffCounts, DiffLine, DiffReplacedModel, DiffStop, DiffTextModel } from './model'
import { diffSequence } from './sequence'
import { decodeText, wordDiff } from './word-diff'

const PREVIEW_CHARS = 240

// Lines are compared with their '\r' kept — a CRLF → LF conversion changes every line it touches, and the file an
// accept writes would differ from what the view called identical — and drawn without it.
export function textDiff(left: string, right: string): DiffTextModel {
  const rawA = left.split('\n')
  const rawB = right.split('\n')
  const a = rawA.map(stripCr)
  const b = rawB.map(stripCr)
  const ops = diffSequence(rawA, rawB)
  const lines: DiffLine[] = []
  const stops: DiffStop[] = []
  const counts: DiffCounts = { added: 0, removed: 0, changed: 0 }
  const stop = (target: string, change: DiffStop['change']): number => {
    const index = stops.length
    stops.push({ index, target, change })
    counts[change === 'moved' ? 'changed' : change]++
    return index
  }

  let i = 0
  while (i < ops.length) {
    const op = ops[i]
    if (op.kind === 'equal') {
      lines.push({ id: `l${lines.length}`, change: 'equal', oldNumber: op.a + 1, newNumber: op.b + 1, segments: plain(a[op.a]) })
      i++
      continue
    }
    const removed: number[] = []
    const added: number[] = []
    while (i < ops.length && ops[i].kind !== 'equal') {
      const run = ops[i]
      if (run.kind === 'removed') removed.push(run.a)
      else if (run.kind === 'added') added.push(run.b)
      i++
    }
    // A pair is a line that was edited rather than replaced: removed[i] against added[i] inside one run, the
    // same zip GitHub draws. The rest of the longer side stays a plain removal or addition.
    const paired = Math.min(removed.length, added.length)
    const removedIds = removed.map((_, k) => `l${lines.length + k}`)
    const addedIds = added.map((_, k) => `l${lines.length + removed.length + k}`)
    const words = removed.slice(0, paired).map((at, k) => wordDiff(a[at], b[added[k]]))
    // Same text, different ending: the words show nothing, so the line says it.
    const endings = removed.slice(0, paired).map((at, k) => (a[at] === b[added[k]] ? endingNote(rawA[at], rawB[added[k]]) : undefined))
    removed.forEach((at, k) => {
      const id = removedIds[k]
      const isPair = k < paired
      lines.push({
        id,
        change: 'removed',
        oldNumber: at + 1,
        segments: isPair ? words[k].filter((it) => it.kind !== 'added') : plain(a[at]),
        ...(isPair ? { pair: addedIds[k] } : {}),
        stop: stop(id, isPair ? 'changed' : 'removed'),
      })
    })
    added.forEach((at, k) => {
      const id = addedIds[k]
      const isPair = k < paired
      lines.push({
        id,
        change: 'added',
        newNumber: at + 1,
        segments: isPair ? words[k].filter((it) => it.kind !== 'removed') : plain(b[at]),
        ...(isPair ? { pair: removedIds[k] } : { stop: stop(id, 'added') }),
        ...(isPair && endings[k] != null ? { note: endings[k] } : {}),
      })
    })
  }
  return { format: 'text', lines, stops, counts, identical: stops.length === 0 }
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

function endingNote(before: string, after: string): string {
  const name = (line: string) => (line.endsWith('\r') ? 'CRLF' : 'LF')
  return t('lineEnding', { before: name(before), after: name(after) })
}

function plain(text: string): DiffLine['segments'] {
  return [{ kind: 'equal', text }]
}

export function replacedModel(left: Uint8Array, right: Uint8Array): DiffReplacedModel {
  const identical = sameBytes(left, right)
  return {
    format: 'replaced',
    left: { bytes: left.byteLength, preview: preview(left) },
    right: { bytes: right.byteLength, preview: preview(right) },
    stops: identical ? [] : [{ index: 0, target: 'replaced', change: 'changed' }],
    counts: { added: 0, removed: 0, changed: identical ? 0 : 1 },
    identical,
  }
}

function preview(bytes: Uint8Array): string {
  const text = decodeText(bytes)
  return text == null ? t('binaryPreview', { count: bytes.byteLength }) : text.slice(0, PREVIEW_CHARS)
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}
