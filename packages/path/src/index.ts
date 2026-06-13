import { basename, delimiter, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'path-browserify'

export { basename, delimiter, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep }

// Always-POSIX ('/') path API. The named exports above are platform-dependent in the node build
// (see index.node.ts: '\' on Windows), so code manipulating a virtual '/'-only namespace — e.g. VFS
// logical pathnames — must use `posix.*`, never the bare exports. In this (browser) build they're
// identical, but a separate `posix` keeps those call sites correct across both builds.
export const posix = { basename, delimiter, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep }

export function normalizePath(path: string): string {
  return path.replace(/^\/+/, '')
}
