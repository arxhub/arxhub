import { AppError } from '@arxhub/errors'
import type { ChangeEntry } from './session-store'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function acceptBlocked(message: string): AppError {
  return new AppError({
    code: 'AiWorkspaceAcceptBlockedError',
    statusCode: 409,
    title: 'Accept blocked',
    message,
  })
}

function isStagingPath(pathname: string): boolean {
  return pathname.replace(/^\/+/, '').startsWith('_ai-workspace/')
}

/** Repo mergers match on `vault/...` paths (see textMerger / ContentMergerRegistration). */
export function mergerPathname(vaultRelative: string): string {
  const path = vaultRelative.replace(/^\/+/, '')
  return path.startsWith('vault/') ? path : `vault/${path}`
}

export interface ApplyAcceptDeps {
  changes: ChangeEntry[]
  beforeClose: (pathname: string) => Promise<boolean>
  readSide: (pathname: string, side: 'base' | 'overlay' | 'main') => Promise<string>
  writeVault: (pathname: string, content: string) => Promise<void>
  deleteVault: (pathname: string) => Promise<void>
  mergeContent: (pathname: string, base: Uint8Array | null, local: Uint8Array, remote: Uint8Array) => Promise<Uint8Array | null>
  archive: () => Promise<void>
}

/**
 * Client-driven three-way accept: flush dirty editors, merge each change into the vault,
 * then archive the session (server must not re-apply overlay when clientApplied).
 */
export async function applyAcceptWithMerge(deps: ApplyAcceptDeps): Promise<void> {
  const changes = deps.changes.filter((c) => !isStagingPath(c.pathname))
  for (const change of changes) {
    const paths = [change.pathname, change.fromPath, change.toPath].filter((p): p is string => !!p)
    for (const path of new Set(paths)) {
      const ok = await deps.beforeClose(path)
      if (!ok) throw acceptBlocked(`Unsaved changes blocked accept on ${path}`)
    }
  }

  for (const change of changes) {
    if (change.kind === 'deleted') {
      await deps.deleteVault(change.pathname)
      continue
    }
    if (change.kind === 'renamed' && change.fromPath && change.toPath) {
      await deps.deleteVault(change.fromPath)
      const theirs = await deps.readSide(change.toPath, 'overlay')
      await deps.writeVault(change.toPath, theirs)
      continue
    }

    const path = change.pathname
    const baseText = await deps.readSide(path, 'base')
    const theirs = await deps.readSide(path, 'overlay')
    const ours = await deps.readSide(path, 'main')

    if (ours === baseText) {
      await deps.writeVault(path, theirs)
      continue
    }
    if (ours === theirs) continue

    const merged = await deps.mergeContent(
      mergerPathname(path),
      baseText === '' ? null : encoder.encode(baseText),
      encoder.encode(ours),
      encoder.encode(theirs),
    )
    if (merged == null) throw acceptBlocked(`Accept blocked: conflict on ${path}`)
    await deps.writeVault(path, decoder.decode(merged))
  }

  await deps.archive()
}
