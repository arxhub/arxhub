import { basename, delimiter, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'path-browserify'

export { basename, delimiter, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep }

export function normalizePath(path: string): string {
  return path.replace(/^\/+/, '')
}
