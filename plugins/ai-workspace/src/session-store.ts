import { AppError, notFound, validation } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { nanoid } from 'nanoid'

function archivedError(): AppError {
  return new AppError({
    code: 'AiWorkspaceSessionArchivedError',
    statusCode: 409,
    title: 'Session archived',
    message: 'Archived sessions do not accept tool calls or a second accept',
  })
}

function acceptBlocked(message: string): AppError {
  return new AppError({
    code: 'AiWorkspaceAcceptBlockedError',
    statusCode: 409,
    title: 'Accept blocked',
    message,
  })
}

export type SessionStatus = 'open' | 'proposed' | 'archived'
export type SessionResult = 'accepted' | 'rejected' | null
export type ChangeKind = 'created' | 'modified' | 'renamed' | 'deleted'

export interface SessionMeta {
  sessionId: string
  baseSnapshotHash: string
  status: SessionStatus
  result: SessionResult
  createdAt: string
  proposedAt: string | null
}

export interface ChangeEntry {
  pathname: string
  kind: ChangeKind
  fromPath?: string
  toPath?: string
}

export interface SourceEntry {
  pathname: string
  excerpt: string
}

export interface ActionEntry {
  at: string
  tool: string
  pathname?: string
  ok: boolean
  errorCode?: string
}

const SESSIONS = 'state/AiWorkspace/sessions'
const REPO_HEAD = 'state/Repository/repo/head'

function overlayPath(sessionId: string, pathname: string): string {
  return `${SESSIONS}/${sessionId}/overlay/${pathname.replace(/^\/+/, '')}`
}

function metaPath(sessionId: string): string {
  return `${SESSIONS}/${sessionId}/meta.json`
}

function changesPath(sessionId: string): string {
  return `${SESSIONS}/${sessionId}/changes.json`
}

function actionsPath(sessionId: string): string {
  return `${SESSIONS}/${sessionId}/actions.jsonl`
}

function sourcesPath(sessionId: string): string {
  return `${SESSIONS}/${sessionId}/sources.json`
}

function vaultPath(pathname: string): string {
  return `vault/${pathname.replace(/^\/+/, '')}`
}

function isStagingPath(pathname: string): boolean {
  return pathname.replace(/^\/+/, '').startsWith('_ai-workspace/')
}

export type CompareMode = 'agent' | 'apply'
export type ReadSide = 'base' | 'overlay' | 'main'

export class AiSessionStore {
  constructor(private readonly root: VirtualFileSystem) {}

  async createSession(): Promise<SessionMeta> {
    const headFile = this.root.file(REPO_HEAD)
    const baseSnapshotHash = (await headFile.exists()) ? (await headFile.readText()).trim() || 'none' : 'none'
    const sessionId = nanoid(12)
    const meta: SessionMeta = {
      sessionId,
      baseSnapshotHash,
      status: 'open',
      result: null,
      createdAt: new Date().toISOString(),
      proposedAt: null,
    }
    await this.root.file(metaPath(sessionId)).writeText(JSON.stringify(meta, null, 2))
    await this.root.file(changesPath(sessionId)).writeText('[]')
    await this.root.file(actionsPath(sessionId)).writeText('')
    await this.root.file(sourcesPath(sessionId)).writeText('[]')
    return meta
  }

  async listSessions(): Promise<SessionMeta[]> {
    if (!(await this.root.exists(SESSIONS))) return []
    const entries = await this.root.dir(SESSIONS).list()
    const out: SessionMeta[] = []
    for (const entry of entries) {
      if (entry.kind !== 'dir') continue
      const name = entry.pathname.split('/').pop()
      if (!name) continue
      try {
        out.push(await this.readMeta(name))
      } catch {
        // skip broken
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async readMeta(sessionId: string): Promise<SessionMeta> {
    const file = this.root.file(metaPath(sessionId))
    if (!(await file.exists())) throw notFound(`AiWorkspace session ${sessionId} not found`)
    return JSON.parse(await file.readText()) as SessionMeta
  }

  private async writeMeta(meta: SessionMeta): Promise<void> {
    await this.root.file(metaPath(meta.sessionId)).writeText(JSON.stringify(meta, null, 2))
  }

  async requireOpen(sessionId: string): Promise<SessionMeta> {
    const meta = await this.readMeta(sessionId)
    if (meta.status === 'archived') {
      throw archivedError()
    }
    return meta
  }

  async readChanges(sessionId: string): Promise<ChangeEntry[]> {
    const file = this.root.file(changesPath(sessionId))
    if (!(await file.exists())) return []
    return JSON.parse(await file.readText()) as ChangeEntry[]
  }

  private async writeChanges(sessionId: string, changes: ChangeEntry[]): Promise<void> {
    await this.root.file(changesPath(sessionId)).writeText(JSON.stringify(changes, null, 2))
  }

  async appendAction(sessionId: string, entry: Omit<ActionEntry, 'at'>): Promise<void> {
    const line = JSON.stringify({ ...entry, at: new Date().toISOString() })
    const file = this.root.file(actionsPath(sessionId))
    const prev = (await file.exists()) ? await file.readText() : ''
    await file.writeText(prev ? `${prev}${prev.endsWith('\n') ? '' : '\n'}${line}\n` : `${line}\n`)
  }

  async readActions(sessionId: string): Promise<ActionEntry[]> {
    const file = this.root.file(actionsPath(sessionId))
    if (!(await file.exists())) return []
    return (await file.readText())
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ActionEntry)
  }

  async readSources(sessionId: string): Promise<SourceEntry[]> {
    const file = this.root.file(sourcesPath(sessionId))
    if (!(await file.exists())) return []
    return JSON.parse(await file.readText()) as SourceEntry[]
  }

  private async addSource(sessionId: string, source: SourceEntry): Promise<void> {
    const sources = await this.readSources(sessionId)
    if (!sources.some((s) => s.pathname === source.pathname && s.excerpt === source.excerpt)) {
      sources.push(source)
      await this.root.file(sourcesPath(sessionId)).writeText(JSON.stringify(sources, null, 2))
    }
  }

  private async upsertChange(sessionId: string, entry: ChangeEntry): Promise<void> {
    const changes = await this.readChanges(sessionId)
    const i = changes.findIndex((c) => c.pathname === entry.pathname || (entry.kind === 'renamed' && c.toPath === entry.toPath))
    if (i >= 0) changes[i] = entry
    else changes.push(entry)
    await this.writeChanges(sessionId, changes)
  }

  async readFile(sessionId: string, pathname: string): Promise<string> {
    await this.requireOpen(sessionId)
    const path = pathname.replace(/^\/+/, '')
    const over = this.root.file(overlayPath(sessionId, path))
    if (await over.exists()) {
      const text = await over.readText()
      await this.appendAction(sessionId, { tool: 'read', pathname: path, ok: true })
      await this.addSource(sessionId, { pathname: path, excerpt: text.slice(0, 240) })
      return text
    }
    const vault = this.root.file(vaultPath(path))
    if (!(await vault.exists())) throw notFound(`File not found: ${path}`)
    const text = await vault.readText()
    await this.appendAction(sessionId, { tool: 'read', pathname: path, ok: true })
    await this.addSource(sessionId, { pathname: path, excerpt: text.slice(0, 240) })
    return text
  }

  async writeFile(sessionId: string, pathname: string, content: string): Promise<void> {
    await this.requireOpen(sessionId)
    const path = pathname.replace(/^\/+/, '')
    if (!path) throw validation('pathname is required')
    const vault = this.root.file(vaultPath(path))
    const existed = await vault.exists()
    const baseFile = this.root.file(`${SESSIONS}/${sessionId}/base/${path}`)
    if (!(await baseFile.exists())) {
      await baseFile.writeText(existed ? await vault.readText() : '')
    }
    await this.root.file(overlayPath(sessionId, path)).writeText(content)
    await this.upsertChange(sessionId, { pathname: path, kind: existed ? 'modified' : 'created' })
    await this.appendAction(sessionId, { tool: 'write', pathname: path, ok: true })
  }

  async mkdir(sessionId: string, pathname: string): Promise<void> {
    await this.requireOpen(sessionId)
    const path = pathname.replace(/^\/+/, '')
    await this.root.file(overlayPath(sessionId, `${path}/.keep`)).writeText('')
    await this.appendAction(sessionId, { tool: 'mkdir', pathname: path, ok: true })
  }

  async rename(sessionId: string, fromPath: string, toPath: string): Promise<void> {
    await this.requireOpen(sessionId)
    const from = fromPath.replace(/^\/+/, '')
    const to = toPath.replace(/^\/+/, '')
    const content = await this.readContentForMutation(sessionId, from)
    await this.root.file(overlayPath(sessionId, to)).writeText(content)
    const fromOver = this.root.file(overlayPath(sessionId, from))
    if (await fromOver.exists()) await fromOver.delete()
    await this.upsertChange(sessionId, { pathname: to, kind: 'renamed', fromPath: from, toPath: to })
    const changes = (await this.readChanges(sessionId)).filter((c) => c.pathname !== from)
    await this.writeChanges(sessionId, changes)
    await this.appendAction(sessionId, { tool: 'rename', pathname: `${from}→${to}`, ok: true })
  }

  async deletePath(sessionId: string, pathname: string): Promise<void> {
    await this.requireOpen(sessionId)
    const path = pathname.replace(/^\/+/, '')
    const over = this.root.file(overlayPath(sessionId, path))
    if (await over.exists()) await over.delete()
    await this.root.file(overlayPath(sessionId, `${path}.__deleted__`)).writeText('1')
    await this.upsertChange(sessionId, { pathname: path, kind: 'deleted' })
    await this.appendAction(sessionId, { tool: 'delete', pathname: path, ok: true })
  }

  private async readContentForMutation(sessionId: string, path: string): Promise<string> {
    const over = this.root.file(overlayPath(sessionId, path))
    if (await over.exists()) return over.readText()
    const vault = this.root.file(vaultPath(path))
    if (!(await vault.exists())) throw notFound(`File not found: ${path}`)
    return vault.readText()
  }

  async search(sessionId: string, query: string): Promise<{ matches: Array<{ pathname: string; excerpt: string }>; sources: SourceEntry[] }> {
    await this.requireOpen(sessionId)
    if (!query.trim()) throw validation('query is required')
    const matches: Array<{ pathname: string; excerpt: string }> = []
    const q = query.toLowerCase()
    for await (const file of this.root.walk('vault')) {
      const rel = file.pathname.replace(/^vault\/?/, '')
      if (!rel || rel.includes('/.')) continue
      try {
        const over = this.root.file(overlayPath(sessionId, rel))
        const deleted = this.root.file(overlayPath(sessionId, `${rel}.__deleted__`))
        if (await deleted.exists()) continue
        const text = (await over.exists()) ? await over.readText() : await file.readText()
        if (text.toLowerCase().includes(q)) {
          const idx = text.toLowerCase().indexOf(q)
          const excerpt = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + query.length + 40))
          matches.push({ pathname: rel, excerpt })
          await this.addSource(sessionId, { pathname: rel, excerpt })
        }
      } catch {
        // skip unreadable
      }
    }
    await this.appendAction(sessionId, { tool: 'search', ok: true })
    return { matches, sources: await this.readSources(sessionId) }
  }

  async propose(sessionId: string): Promise<SessionMeta> {
    const meta = await this.requireOpen(sessionId)
    meta.status = 'proposed'
    meta.proposedAt = new Date().toISOString()
    await this.writeMeta(meta)
    await this.appendAction(sessionId, { tool: 'propose', ok: true })
    return meta
  }

  async reject(sessionId: string): Promise<SessionMeta> {
    const meta = await this.requireOpen(sessionId)
    meta.status = 'archived'
    meta.result = 'rejected'
    await this.writeMeta(meta)
    await this.appendAction(sessionId, { tool: 'reject', ok: true })
    return meta
  }

  async readSide(sessionId: string, pathname: string, side: ReadSide): Promise<string> {
    const path = pathname.replace(/^\/+/, '')
    if (side === 'base') {
      const file = this.root.file(`${SESSIONS}/${sessionId}/base/${path}`)
      if (!(await file.exists())) return ''
      return file.readText()
    }
    if (side === 'overlay') {
      const deleted = this.root.file(overlayPath(sessionId, `${path}.__deleted__`))
      if (await deleted.exists()) return ''
      const over = this.root.file(overlayPath(sessionId, path))
      if (!(await over.exists())) return ''
      return over.readText()
    }
    const vault = this.root.file(vaultPath(path))
    if (!(await vault.exists())) return ''
    return vault.readText()
  }

  async compare(
    sessionId: string,
    pathname: string,
    mode: CompareMode,
  ): Promise<{ leftLabel: string; rightLabel: string; left: string; right: string }> {
    await this.readMeta(sessionId)
    const path = pathname.replace(/^\/+/, '')
    if (mode === 'agent') {
      return {
        leftLabel: 'Base',
        rightLabel: 'Worktree',
        left: await this.readSide(sessionId, path, 'base'),
        right: await this.readSide(sessionId, path, 'overlay'),
      }
    }
    return {
      leftLabel: 'Worktree',
      rightLabel: 'Main',
      left: await this.readSide(sessionId, path, 'overlay'),
      right: await this.readSide(sessionId, path, 'main'),
    }
  }

  async archiveOnly(sessionId: string, result: 'accepted' | 'rejected'): Promise<SessionMeta> {
    const meta = await this.requireOpen(sessionId)
    meta.status = 'archived'
    meta.result = result
    await this.writeMeta(meta)
    await this.appendAction(sessionId, { tool: result === 'accepted' ? 'accept' : 'reject', ok: true })
    return meta
  }

  async accept(sessionId: string, options?: { clientApplied?: boolean }): Promise<SessionMeta> {
    if (options?.clientApplied) {
      return this.archiveOnly(sessionId, 'accepted')
    }
    const meta = await this.requireOpen(sessionId)
    const changes = (await this.readChanges(sessionId)).filter((c) => !isStagingPath(c.pathname))
    for (const change of changes) {
      if (change.kind === 'deleted') {
        const vault = this.root.file(vaultPath(change.pathname))
        if (await vault.exists()) await vault.delete()
        continue
      }
      if (change.kind === 'renamed' && change.fromPath && change.toPath) {
        const from = this.root.file(vaultPath(change.fromPath))
        if (await from.exists()) await from.delete()
        const content = await this.root.file(overlayPath(sessionId, change.toPath)).readText()
        await this.root.file(vaultPath(change.toPath)).writeText(content)
        continue
      }
      const content = await this.root.file(overlayPath(sessionId, change.pathname)).readText()
      const main = this.root.file(vaultPath(change.pathname))
      const baseFile = this.root.file(`${SESSIONS}/${sessionId}/base/${change.pathname}`)
      const base = (await baseFile.exists()) ? await baseFile.readText() : ''
      if (await main.exists()) {
        const current = await main.readText()
        if (current !== content && current !== base) {
          throw acceptBlocked(`Accept blocked: conflict on ${change.pathname}`)
        }
      }
      await main.writeText(content)
    }
    meta.status = 'archived'
    meta.result = 'accepted'
    await this.writeMeta(meta)
    await this.appendAction(sessionId, { tool: 'accept', ok: true })
    return meta
  }

  async getSessionView(sessionId: string): Promise<{
    meta: SessionMeta
    changes: ChangeEntry[]
    actions: ActionEntry[]
    sources: SourceEntry[]
  }> {
    const meta = await this.readMeta(sessionId)
    return {
      meta,
      changes: await this.readChanges(sessionId),
      actions: await this.readActions(sessionId),
      sources: await this.readSources(sessionId),
    }
  }
}
