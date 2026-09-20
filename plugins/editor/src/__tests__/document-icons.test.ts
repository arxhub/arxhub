import { VfsWatcher, type VirtualFileSystem } from '@arxhub/vfs'
import { expect, test, vi } from 'vitest'
import { createDocumentIcons } from '../document-icons'

test('icon cache ignores stale reads after live edits and reloads renamed files', async () => {
  let finish!: (text: string) => void
  const readText = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(JSON.stringify({ appearance: { icon: 'lu:book-open' } }))
  const watcher = new VfsWatcher()
  const cache = createDocumentIcons({ file: () => ({ readText }) } as unknown as VirtualFileSystem, watcher)
  expect(cache.get('old.arx')).toBeUndefined()
  await Promise.resolve()
  cache.set('old.arx', 'lu:star')
  finish(JSON.stringify({ appearance: { icon: 'lu:heart' } }))
  await vi.waitFor(() => expect(cache.get('old.arx')).toBe('lu:star'))
  watcher.notify({ kind: 'renamed', from: 'old.arx', pathname: 'new.arx' })
  expect(cache.get('new.arx')).toBeUndefined()
  await vi.waitFor(() => expect(cache.get('new.arx')).toBe('lu:book-open'))
  cache.dispose()
})
