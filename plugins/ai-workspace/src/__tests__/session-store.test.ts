import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from '@arxhub/core'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AiSessionStore } from '../session-store'

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silent,
}

describe('AiSessionStore', () => {
  let dir: string
  let root: NodeFileSystem
  let store: AiSessionStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ai-workspace-'))
    root = new NodeFileSystem(dir, silent)
    store = new AiSessionStore(root)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('write stays in overlay until accept', async () => {
    await root.file('vault/note.md').writeText('main A\n')
    const session = await store.createSession()

    await store.writeFile(session.sessionId, 'note.md', 'overlay B\n')
    expect(await root.file('vault/note.md').readText()).toBe('main A\n')
    expect(await store.readFile(session.sessionId, 'note.md')).toBe('overlay B\n')

    await store.accept(session.sessionId)
    expect(await root.file('vault/note.md').readText()).toBe('overlay B\n')
    await expect(store.writeFile(session.sessionId, 'note.md', 'x')).rejects.toMatchObject({ body: { statusCode: 409 } })
  })

  test('search cites vault sources without mutating main', async () => {
    const marker = 'unique-ai-source-marker'
    await root.file('vault/src.md').writeText(`Context about ${marker}.\n`)
    const session = await store.createSession()

    const result = await store.search(session.sessionId, marker)
    expect(result.sources.some((s) => s.pathname === 'src.md')).toBe(true)
    expect(await root.file('vault/src.md').readText()).toContain(marker)
  })

  test('accept refuses when main diverged from base and overlay', async () => {
    await root.file('vault/note.md').writeText('base\n')
    const session = await store.createSession()
    await store.writeFile(session.sessionId, 'note.md', 'agent\n')
    await root.file('vault/note.md').writeText('human edit\n')

    await expect(store.accept(session.sessionId)).rejects.toMatchObject({ body: { statusCode: 409 } })
    expect(await root.file('vault/note.md').readText()).toBe('human edit\n')
  })

  test('compare returns base→overlay and overlay→main sides', async () => {
    await root.file('vault/note.md').writeText('main\n')
    const session = await store.createSession()
    await store.writeFile(session.sessionId, 'note.md', 'overlay\n')

    const agent = await store.compare(session.sessionId, 'note.md', 'agent')
    expect(agent.leftLabel).toBe('Base')
    expect(agent.rightLabel).toBe('Worktree')
    expect(agent.left).toBe('main\n')
    expect(agent.right).toBe('overlay\n')

    const apply = await store.compare(session.sessionId, 'note.md', 'apply')
    expect(apply.leftLabel).toBe('Worktree')
    expect(apply.rightLabel).toBe('Main')
    expect(apply.left).toBe('overlay\n')
    expect(apply.right).toBe('main\n')
  })

  test('clientApplied accept only archives', async () => {
    await root.file('vault/note.md').writeText('main\n')
    const session = await store.createSession()
    await store.writeFile(session.sessionId, 'note.md', 'overlay\n')
    await store.accept(session.sessionId, { clientApplied: true })
    expect(await root.file('vault/note.md').readText()).toBe('main\n')
    const meta = await store.readMeta(session.sessionId)
    expect(meta.status).toBe('archived')
    expect(meta.result).toBe('accepted')
  })

  test('accept skips staging paths', async () => {
    await root.file('vault/note.md').writeText('main\n')
    const session = await store.createSession()
    await store.writeFile(session.sessionId, 'note.md', 'overlay\n')
    await store.writeFile(session.sessionId, '_ai-workspace/x/staged.md', 'staged\n')
    await store.accept(session.sessionId)
    expect(await root.file('vault/note.md').readText()).toBe('overlay\n')
    expect(await root.file('vault/_ai-workspace/x/staged.md').exists()).toBe(false)
  })
})
