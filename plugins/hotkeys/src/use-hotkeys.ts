import { onBeforeUnmount, onMounted, type Ref, watch } from 'vue'
import type { Disposer, HotkeyBinding, HotkeyLayer, HotkeysExtension } from './hotkeys-extension'

// Tie declarations to a component's lifetime. Deliberately taking the extension as an argument rather
// than reaching for `useArxHub()`: that would put `@arxhub/uikit` in this package's dependencies, and
// the registry is the one thing in the product that nothing should have to depend on a UI library to
// reach.
//
// For a surface that exists at most ONCE — a frame, a mini-app's bar — whose `run` needs that
// component's own state. A component the product mounts several times at once (a viewer of a type: an
// open note is one of several) declares from its plugin's `configure()` instead, because the layer id
// is per type while the mount is per object: N mounts would be N declarations of one fact, of which
// the registry keeps the first and refuses the rest — and then the first one to unmount takes the
// surviving declaration with it and the chord is claimed by nobody. `declareCodeMirrorChords` is the
// worked example.

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
