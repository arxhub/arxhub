import { normalizePath } from '@arxhub/path'

// A single allow/deny rule. `path` is a glob over root-absolute pathnames (Tauri fs:scope shape):
//   'vault/**'      → 'vault' and anything beneath it
//   'storage/sync/*'→ direct children of 'storage/sync' only
//   'a/b/c.toml'    → that exact path
//   '**'            → everything
export interface ScopeRule {
  path: string
}

// An allow-list + deny-list. Deny always wins. An empty/absent allow-list means "allow all
// (subject to deny)"; a non-empty allow-list means "only paths matching some allow rule".
export interface Scope {
  allow?: ScopeRule[]
  deny?: ScopeRule[]
}

function matchGlob(pattern: string, path: string): boolean {
  const pat = normalizePath(pattern)
  if (pat === '**') return true
  if (pat.endsWith('/**')) {
    const base = pat.slice(0, -3)
    return path === base || path.startsWith(`${base}/`)
  }
  if (pat.endsWith('/*')) {
    const base = pat.slice(0, -2)
    if (!path.startsWith(`${base}/`)) return false
    return !path.slice(base.length + 1).includes('/')
  }
  return path === pat
}

export function matchesScope(pathname: string, scope: Scope): boolean {
  const path = normalizePath(pathname)
  if (scope.deny?.some((r) => matchGlob(r.path, path))) return false
  if (scope.allow == null || scope.allow.length === 0) return true
  return scope.allow.some((r) => matchGlob(r.path, path))
}
