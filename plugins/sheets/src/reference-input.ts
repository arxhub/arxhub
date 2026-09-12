import { address, MAX_INPUT, type Point } from './model'
import { formulaReferences } from './references'

export interface ReferenceInsertion {
  text: string
  start: number
  end: number
  from: Point
  to: Point
}

function inString(text: string, position: number): boolean {
  let quoted = false
  for (let i = 1; i < position; i++) {
    if (text[i] !== '"') continue
    if (quoted && text[i + 1] === '"' && i + 1 < position) i++
    else quoted = !quoted
  }
  return quoted
}

export function canInsertReference(text: string, start: number, end: number): boolean {
  return text.startsWith('=') && !inString(text, Math.max(1, start)) && !inString(text, end)
}

export function insertReference(
  text: string,
  start: number,
  end: number,
  from: Point,
  to = from,
  previous?: ReferenceInsertion | null,
): ReferenceInsertion | null {
  if (!canInsertReference(text, start, end)) return null
  start = Math.max(1, start)
  end = Math.max(start, end)
  if (previous?.text === text && start === previous.end && end === start) {
    start = previous.start
  } else if (start === end) {
    const current = formulaReferences(text).find((reference) => reference.start <= start && start <= reference.end)
    if (current) {
      start = current.start
      end = current.end
    }
  }
  const topLeft = { row: Math.min(from.row, to.row), column: Math.min(from.column, to.column) }
  const bottomRight = { row: Math.max(from.row, to.row), column: Math.max(from.column, to.column) }
  const reference = address(topLeft) === address(bottomRight) ? address(topLeft) : `${address(topLeft)}:${address(bottomRight)}`
  const result = text.slice(0, start) + reference + text.slice(end)
  if (result.length > MAX_INPUT) return null
  return { text: result, start, end: start + reference.length, from, to }
}
