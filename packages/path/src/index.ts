export const sep = '/'
export const delimiter = ':'

export function normalize(path: string): string {
  const isAbs = path.startsWith('/')
  const parts = path.split('/').filter(Boolean)
  const result: string[] = []
  for (const part of parts) {
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') result.pop()
      else if (!isAbs) result.push('..')
    } else if (part !== '.') {
      result.push(part)
    }
  }
  const out = (isAbs ? '/' : '') + result.join('/')
  return out || '.'
}

export function join(...paths: string[]): string {
  return normalize(paths.filter(p => p !== '').join('/'))
}

export function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  if (idx === -1) return '.'
  if (idx === 0) return '/'
  return path.slice(0, idx)
}

export function basename(path: string, ext?: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length)
  return base
}

export function extname(path: string): string {
  const base = basename(path)
  const idx = base.lastIndexOf('.')
  if (idx <= 0) return ''
  return base.slice(idx)
}

export function isAbsolute(path: string): boolean {
  return path.startsWith('/')
}

export function resolve(...paths: string[]): string {
  let resolved = ''
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i]
    if (path) {
      resolved = resolved ? `${path}/${resolved}` : path
      if (isAbsolute(resolved)) break
    }
  }
  return normalize(resolved || '.')
}

export function relative(from: string, to: string): string {
  const fromParts = from.split('/').filter(Boolean)
  const toParts = to.split('/').filter(Boolean)
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  const ups = fromParts.length - common
  return [...Array(ups).fill('..'), ...toParts.slice(common)].join('/') || '.'
}

export function normalizePath(path: string): string {
  return path.replace(/^\/+/, '')
}
