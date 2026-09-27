import { sheetsError } from './errors'
import { pointOf } from './model'

export function validateEmbedPath(path: unknown): asserts path is string {
  if (
    typeof path !== 'string' ||
    path.length > 1024 ||
    (path !== '' &&
      (!path.endsWith('.arxs') ||
        path.startsWith('/') ||
        /[\\\0]/.test(path) ||
        path.split('/').some((part) => !part || part === '.' || part === '..')))
  )
    throw sheetsError('SheetEmbedPath')
}
export function embedRange(range: unknown) {
  if (typeof range !== 'string') throw sheetsError('SheetEmbedInvalidRange')
  const parts = range.split(':')
  const from = pointOf(parts[0]),
    to = pointOf(parts[1] ?? parts[0])
  if (
    parts.length > 2 ||
    !from ||
    !to ||
    from.row > to.row ||
    from.column > to.column ||
    to.row - from.row >= 20 ||
    to.column - from.column >= 8
  )
    throw sheetsError('SheetEmbedRangeTooLarge')
  return { from, to }
}
