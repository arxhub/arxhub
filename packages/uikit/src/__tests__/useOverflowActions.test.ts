import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useOverflowActions } from '../hooks/useOverflowActions'

let observers: Array<{ measure: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>
const scopes: ReturnType<typeof effectScope>[] = []

beforeEach(() => {
  observers = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(public measure: () => void) {
        observers.push(this)
      }
    },
  )
  vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: '8px', paddingRight: '8px', borderLeftWidth: '1px', borderRightWidth: '1px' }))
})

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.unstubAllGlobals()
})

function element(width: number): HTMLElement {
  return { getBoundingClientRect: () => ({ width }) } as HTMLElement
}

test('reserves pinned content, insets and a differently sized More trigger, and reacts to changed actions', async () => {
  const items = shallowRef(['create', 'folder', 'import', 'collapse', 'refresh'])
  const container = shallowRef(element(278))
  const scope = effectScope()
  scopes.push(scope)
  const result = scope.run(() =>
    useOverflowActions(items, {
      container,
      item: () => element(40),
      overflow: () => element(60),
      leading: () => element(40),
      trailing: () => element(40),
    }),
  )!
  await nextTick()
  expect(result.visible.value).toEqual(['create', 'folder', 'import'])
  expect(result.overflow.value).toEqual(['collapse', 'refresh'])

  items.value = ['create', 'folder', 'import', 'collapse']
  expect(result.visible.value).toEqual(items.value)
  expect(result.overflow.value).toEqual([])

  items.value = []
  expect(result.visible.value).toEqual([])
  expect(result.overflow.value).toEqual([])
})

test('observes late and replaced elements, handles all actions overflowing, and disconnects on disposal', async () => {
  let width = 138
  const node = { getBoundingClientRect: () => ({ width }) } as HTMLElement
  const container = shallowRef<HTMLElement | null>(null)
  const item = shallowRef(element(40))
  const scope = effectScope()
  scopes.push(scope)
  const result = scope.run(() => useOverflowActions(['one', 'two', 'three'], { container, item }))!
  await nextTick()
  expect(observers).toHaveLength(0)
  container.value = node
  await nextTick()
  expect(result.visible.value).toEqual(['one', 'two', 'three'])

  width = 58
  observers[0].measure()
  expect(result.visible.value).toEqual([])
  expect(result.overflow.value).toEqual(['one', 'two', 'three'])

  width = 138
  observers[0].measure()
  expect(result.overflow.value).toEqual([])

  container.value = element(98)
  await nextTick()
  expect(observers[0].disconnect).toHaveBeenCalledOnce()
  expect(observers[1].observe).toHaveBeenCalledWith(container.value)
  expect(result.visible.value).toEqual(['one'])
  scope.stop()
  expect(observers[1].disconnect).toHaveBeenCalledOnce()
})
