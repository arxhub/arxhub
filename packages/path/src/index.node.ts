import { basename, delimiter, dirname, extname, isAbsolute, join, normalize, posix, relative, resolve, sep } from 'node:path'

// Always-POSIX ('/') path API. The bare exports above are node:path — '\'-delimited on Windows — so
// code manipulating a virtual '/'-only namespace (VFS logical pathnames) must use `posix.*`. This
// re-exports node's guaranteed-POSIX sub-namespace; the browser build mirrors the same shape.
export { basename, delimiter, dirname, extname, isAbsolute, join, normalize, posix, relative, resolve, sep }

export function normalizePath(path: string): string {
  return path.replace(/^\/+/, '')
}
