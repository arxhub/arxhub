import { describe, expect, it, vi } from 'vitest'
import { createPendingChanges, type StagedChange } from '../pending-changes'

function change(overrides: Partial<StagedChange> = {}): StagedChange {
  return {
    sectionId: 'sync',
    title: 'Sync',
    values: { serverUrl: 'https://hub.example.com' },
    keys: ['serverUrl'],
    invalid: false,
    commit: vi.fn(async () => {}),
    revert: vi.fn(),
    ...overrides,
  }
}

describe('pending changes', () => {
  it('counts fields across sections, not sections alone', () => {
    const pending = createPendingChanges()
    pending.stage(change({ sectionId: 'sync', keys: ['serverUrl', 'autoSyncSeconds'] }))
    pending.stage(change({ sectionId: 'publish', title: 'Publishing', keys: ['serverUrl'] }))

    expect(pending.sectionCount.value).toBe(2)
    expect(pending.fieldCount.value).toBe(3)
  })

  it('replaces a section rather than accumulating its successive edits', () => {
    const pending = createPendingChanges()
    pending.stage(change({ keys: ['serverUrl'] }))
    pending.stage(change({ keys: ['serverUrl', 'autoSyncSeconds'] }))

    expect(pending.sectionCount.value).toBe(1)
    expect(pending.fieldCount.value).toBe(2)
  })

  it('drops a section that reports no changed keys — editing a value back is not a change', () => {
    const pending = createPendingChanges()
    pending.stage(change({ keys: ['serverUrl'] }))
    pending.stage(change({ keys: [] }))

    expect(pending.sectionCount.value).toBe(0)
  })

  it('commits every staged section and clears them', async () => {
    const pending = createPendingChanges()
    const sync = change({ sectionId: 'sync' })
    const publish = change({ sectionId: 'publish' })
    pending.stage(sync)
    pending.stage(publish)

    await pending.saveAll()

    expect(sync.commit).toHaveBeenCalledOnce()
    expect(publish.commit).toHaveBeenCalledOnce()
    expect(pending.sectionCount.value).toBe(0)
  })

  it('refuses to save while any section is invalid', async () => {
    const pending = createPendingChanges()
    const good = change({ sectionId: 'sync' })
    pending.stage(good)
    pending.stage(change({ sectionId: 'publish', invalid: true }))

    expect(pending.invalid.value).toBe(true)
    await pending.saveAll()

    expect(good.commit).not.toHaveBeenCalled()
    expect(pending.sectionCount.value).toBe(2)
  })

  it('stops at the first failure and leaves that section and the rest staged for a retry', async () => {
    const onError = vi.fn()
    const pending = createPendingChanges(onError)
    const first = change({ sectionId: 'a' })
    const boom = new Error('disk full')
    const second = change({
      sectionId: 'b',
      commit: vi.fn(async () => {
        throw boom
      }),
    })
    const third = change({ sectionId: 'c' })
    pending.stage(first)
    pending.stage(second)
    pending.stage(third)

    await pending.saveAll()

    expect(first.commit).toHaveBeenCalledOnce()
    expect(third.commit).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('b', boom)
    // 'a' committed and cleared; 'b' and 'c' remain so the retry resumes where it stopped.
    expect(pending.staged.value.map((c) => c.sectionId)).toEqual(['b', 'c'])
  })

  it('reverts every section and empties the set', () => {
    const pending = createPendingChanges()
    const sync = change({ sectionId: 'sync' })
    const publish = change({ sectionId: 'publish' })
    pending.stage(sync)
    pending.stage(publish)

    pending.revertAll()

    expect(sync.revert).toHaveBeenCalledOnce()
    expect(publish.revert).toHaveBeenCalledOnce()
    expect(pending.sectionCount.value).toBe(0)
  })

  it('hands a section back the draft it staged, so leaving settings does not lose the edit', () => {
    const pending = createPendingChanges()
    pending.stage(change({ sectionId: 'sync', values: { serverUrl: 'https://hub.example.com' } }))

    expect(pending.draftFor('sync')).toEqual({ serverUrl: 'https://hub.example.com' })
    expect(pending.draftFor('publish')).toBeUndefined()
  })

  it('clear removes one section without touching the others', () => {
    const pending = createPendingChanges()
    pending.stage(change({ sectionId: 'sync' }))
    pending.stage(change({ sectionId: 'publish' }))

    pending.clear('sync')

    expect(pending.staged.value.map((c) => c.sectionId)).toEqual(['publish'])
  })
})
