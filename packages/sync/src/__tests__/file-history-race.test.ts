import { ConsoleLogger } from '@arxhub/core'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, expect, test } from 'vitest'
import { FileHistory } from '../file-history'
import { Repo } from '../repo'

// Two devices (or two tabs) pointed at the same server never share an in-process lock — `Repo.exclusive()`
// only serializes calls made through ONE Repo instance (see file-history.ts's comment on recordCheckpoint).
// These tests build two independent Repo/FileHistory pairs over two NodeFileSystem instances that both
// resolve to the SAME store directory, which is exactly that shape: nothing here shares memory, only files.
const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

let storeDir: string
let historyA: FileHistory
let historyB: FileHistory
let repoA: Repo
let repoB: Repo

beforeEach(async () => {
  storeDir = `${__dirname}/testdata/history-race`
  const root = new NodeFileSystem(storeDir, new ConsoleLogger())
  await root.delete('/', { recursive: true, force: true })
  repoA = new Repo(new NodeFileSystem(`${storeDir}/tree-a`, new ConsoleLogger()), new NodeFileSystem(`${storeDir}/store`, new ConsoleLogger()))
  repoB = new Repo(new NodeFileSystem(`${storeDir}/tree-b`, new ConsoleLogger()), new NodeFileSystem(`${storeDir}/store`, new ConsoleLogger()))
  // Both devices must agree on the empty root before racing — otherwise the race is conflated with the
  // ordinary "which of us creates head first" case `prepare()` already handles.
  await repoA.prepare()
  historyA = new FileHistory(repoA)
  historyB = new FileHistory(repoB)
})

test('every checkpoint recorded by either device across a shared store is reachable from list(), on both sides', async () => {
  const identity = 'doc-race'
  const path = 'vault/note.arx'
  const rounds = 10

  await Promise.all(
    Array.from({ length: rounds }, (_, i) => {
      const history = i % 2 === 0 ? historyA : historyB
      return history.record({ identity, path, content: encode(`v${i}`) })
    }),
  )

  const versionsA = await historyA.list({ identity })
  const versionsB = await historyB.list({ identity })
  const contentsA = await Promise.all(versionsA.map((v) => historyA.read({ identity }, v).then(decode)))

  const expected = new Set(Array.from({ length: rounds }, (_, i) => `v${i}`))
  expect(new Set(contentsA)).toEqual(expected)
  expect(versionsA).toHaveLength(rounds)
  expect(versionsB).toEqual(versionsA)
})

test('a checkpoint recorded for another path under the same identity does not erase one recorded concurrently', async () => {
  // The exact ArxEditor.buildState shape: two devices each believe they hold identity X, one at path A,
  // the other (a copy, or a rename this device has not seen yet) at path B. `recordCheckpoint` drops every
  // OTHER path holding the same identity when it writes (file-history.ts lines ~193-197) — so if device B's
  // write reaches head without ever having retried on top of device A's, A's entry silently disappears from
  // `list()`, and `buildState`'s "is this a copy" check (`list(id)` empty at path A) then answers wrongly.
  const identity = 'doc-buildstate'
  await Promise.all([
    historyA.record({ identity, path: 'vault/a.arx', content: encode('content-a') }),
    historyB.record({ identity, path: 'vault/b.arx', content: encode('content-b') }),
  ])

  const versions = await historyA.list({ identity })
  expect(versions.some((v) => v.path === 'vault/a.arx')).toBe(true)
  expect(versions.some((v) => v.path === 'vault/b.arx')).toBe(true)
})
