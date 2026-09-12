import { columnName, type Point, pointOf } from './model'

export interface FormulaReference {
  start: number
  end: number
  text: string
  sheet?: string
  from: string
  to?: string
}
export function formulaReferences(raw: string): FormulaReference[] {
  if (!raw.startsWith('=')) return []
  const pattern =
    /"(?:[^"]|"")*"|(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_]*))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,4})(?:\s*:\s*(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,4}))?/g
  const result: FormulaReference[] = []
  for (const match of raw.matchAll(pattern)) {
    if (
      match[0].startsWith('"') ||
      /[A-Za-z0-9_!$]/.test(raw[match.index - 1] ?? '') ||
      /[A-Za-z0-9_(]/.test(raw[match.index + match[0].length] ?? '')
    )
      continue
    result.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      sheet: match[1]?.replaceAll("''", "'") ?? match[2],
      from: match[3],
      to: match[4],
    })
  }
  return result
}
export function quoteSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'!`
}
export function mapReferences(raw: string, transform: (reference: FormulaReference) => string): string {
  let text = '',
    offset = 0
  for (const reference of formulaReferences(raw)) {
    text += raw.slice(offset, reference.start) + transform(reference)
    offset = reference.end
  }
  return text + raw.slice(offset)
}
export function anchoredAddress(raw: string, point: Point): string {
  return `${raw.startsWith('$') ? '$' : ''}${columnName(point.column)}${/\$\d+$/.test(raw) ? '$' : ''}${point.row + 1}`
}
export function cycleAnchor(raw: string, caret: number): { text: string; caret: number } | null {
  const ref = formulaReferences(raw).find((ref) => ref.start <= caret && caret <= ref.end)
  if (!ref) return null
  const cycle = (value: string) => {
    const point = pointOf(value)
    if (!point) return value
    const c = value.startsWith('$'),
      r = /\$\d+$/.test(value)
    const prefix = !c ? '$' : '',
      suffix = (!c && !r) || (c && r) ? '$' : ''
    return `${prefix}${columnName(point.column)}${suffix}${point.row + 1}`
  }
  const reference = (ref.sheet ? quoteSheet(ref.sheet) : '') + cycle(ref.from) + (ref.to ? `:${cycle(ref.to)}` : '')
  return { text: raw.slice(0, ref.start) + reference + raw.slice(ref.end), caret: ref.start + reference.length }
}
