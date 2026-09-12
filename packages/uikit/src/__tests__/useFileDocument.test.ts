import { AppError } from '@arxhub/errors'
import { describe, expect, test } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useFileDocument } from '../hooks/useFileDocument'

// useFileDocument calls onMounted() to kick off the first load — a no-op outside a component instance,
// which is exactly what we want here: every test drives `reload()` itself so it controls timing.
function fileNotFoundError(): AppError {
  return new AppError({ code: 'FileNotFound', statusCode: 404, title: 'File Not Found', message: 'nope' })
}

function transportError(): AppError {
  return new AppError({ code: 'Offline', statusCode: 503, title: 'Offline', message: 'no connection' })
}

describe('useFileDocument', () => {
  test('an existing document that disappeared cannot become an editable empty file', async () => {
    const applied: unknown[] = []
    const doc = useFileDocument(ref('gone.md'), {
      allowMissing: false,
      read: () => Promise.reject(fileNotFoundError()),
      build: (_path, bytes) => bytes,
      apply: (_path, state) => applied.push(state),
    })
    await doc.reload('gone.md')
    expect(applied).toEqual([])
    expect(doc.canSave.value).toBe(false)
    expect(doc.error.value).toBeInstanceOf(AppError)
  })

  test('renaming a loaded document retains its buffer until an explicit reload', async () => {
    const path = ref('before.md')
    const reads: string[] = []
    const applied: string[] = []
    const scope = effectScope()
    const doc = scope.run(() =>
      useFileDocument(path, {
        retainOnPathChange: true,
        read: async (name) => {
          reads.push(name)
          return new Uint8Array()
        },
        build: (name) => name,
        apply: (_path, state) => applied.push(state),
      }),
    )!
    try {
      await doc.reload(path.value)
      path.value = 'after.md'
      await nextTick()
      expect(reads).toEqual(['before.md'])
      expect(applied).toEqual(['before.md'])
      expect(doc.canSave.value).toBe(true)
      await doc.reload(path.value)
      expect(applied).toEqual(['before.md', 'after.md'])
    } finally {
      scope.stop()
    }
  })

  test('a genuine FileNotFound opens empty and allows saving', async () => {
    const applied: unknown[] = []
    const doc = useFileDocument<string>(ref('a.md'), {
      read: () => Promise.reject(fileNotFoundError()),
      build: (_path, bytes) => `built:${bytes.length}`,
      apply: (_path, state) => applied.push(state),
    })

    await doc.reload('a.md')

    expect(applied).toEqual(['built:0'])
    expect(doc.canSave.value).toBe(true)
    expect(doc.error.value).toBeNull()
  })

  test('a read failure that is not FileNotFound blocks saving and applies nothing', async () => {
    const applied: unknown[] = []
    const err = transportError()
    const doc = useFileDocument<string>(ref('a.md'), {
      read: () => Promise.reject(err),
      build: (_path, bytes) => `built:${bytes.length}`,
      apply: (_path, state) => applied.push(state),
    })

    await doc.reload('a.md')

    expect(applied).toEqual([])
    expect(doc.canSave.value).toBe(false)
    expect(doc.error.value).toBe(err)
  })

  // Bug 1: malformed content used to be swallowed by the per-editor `build` and silently replaced with
  // an empty document, leaving canSave true — a subsequent save (manual or auto) would then overwrite
  // the original, possibly still-recoverable bytes. A `build` failure must be indistinguishable from a
  // read failure: no apply, no save.
  test('a build failure on non-empty bytes is treated like a read failure, not like an empty file', async () => {
    const applied: unknown[] = []
    const buildError = new Error('invalid schema')
    const doc = useFileDocument<string>(ref('a.md'), {
      read: () => Promise.resolve(new TextEncoder().encode('{ not json')),
      build: () => {
        throw buildError
      },
      apply: (_path, state) => applied.push(state),
    })

    await doc.reload('a.md')

    expect(applied).toEqual([])
    expect(doc.canSave.value).toBe(false)
    expect(doc.error.value).toBe(buildError)
  })

  test('a build failure on genuinely empty bytes never happens — build only sees empty as a choice, not a failure', async () => {
    const applied: unknown[] = []
    const doc = useFileDocument<string>(ref('a.md'), {
      read: () => Promise.resolve(new Uint8Array()),
      build: (_path, bytes) => `built:${bytes.length}`,
      apply: (_path, state) => applied.push(state),
    })

    await doc.reload('a.md')

    expect(applied).toEqual(['built:0'])
    expect(doc.canSave.value).toBe(true)
  })

  test('a build failure from a superseded load does not clobber the newer load already in progress', async () => {
    const applied: unknown[] = []
    let resolveSlowBuild: (v: string) => void = () => {}
    let calls = 0
    const doc = useFileDocument<string>(ref('a.md'), {
      read: () => Promise.resolve(new TextEncoder().encode('x')),
      build: () => {
        calls += 1
        // First call (for the load about to be superseded) hangs; the second call throws immediately.
        if (calls === 1) return new Promise<string>((resolve) => (resolveSlowBuild = resolve))
        throw new Error('second load failed')
      },
      apply: (_path, state) => applied.push(state),
    })

    const first = doc.reload('a.md')
    const second = doc.reload('a.md')
    await second
    // The superseded first load resolves after the second has already failed — it must be dropped
    // rather than overwriting the error state the second load just set.
    resolveSlowBuild('stale')
    await first

    expect(applied).toEqual([])
    expect(doc.canSave.value).toBe(false)
    expect(doc.error.value).toBeInstanceOf(Error)
  })
})
