import { onBeforeUnmount, onMounted, type Ref, watch } from 'vue'
import type { Disposer, HotkeyBinding, HotkeyLayer, HotkeysExtension } from './hotkeys-extension'

// Tie declarations to a component's lifetime. Deliberately taking the extension as an argument rather
// than reaching for `useArxHub()`: that would put `@arxhub/uikit` in this package's dependencies, and
// the registry is the one thing in the product that nothing should have to depend on a UI library to
// reach.

export function useHotkeys(hotkeys: HotkeysExtension, bindings: HotkeyBinding[]): void {
  const disposers: Disposer[] = []
  onMounted(() => {
    for (const binding of bindings) disposers.push(hotkeys.register(binding))
  })
  onBeforeUnmount(() => {
    for (const dispose of disposers) dispose()
    disposers.length = 0
  })
}

// Push a layer whose root element arrives as a template ref — which is to say, after mount, and
// possibly again when a `v-if` above it swaps the node. Watched rather than read once: a layer holding
// an element that has left the document is a layer that can never be on the stack again, and it would
// sit in the registry silently claiming chords nobody can reach.
export function useHotkeyLayer(
  hotkeys: HotkeysExtension,
  layer: Omit<HotkeyLayer, 'element'>,
  element: Ref<HTMLElement | null | undefined>,
): void {
  let dispose: Disposer | null = null
  const release = (): void => {
    dispose?.()
    dispose = null
  }
  watch(
    element,
    (el) => {
      release()
      if (el != null) dispose = hotkeys.pushLayer({ ...layer, element: el })
    },
    { immediate: true, flush: 'post' },
  )
  onBeforeUnmount(release)
}
