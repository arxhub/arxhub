import type { WatchSource } from 'vue'
import { onUnmounted, watch } from 'vue'

// Dismissible layers — sheets, drawers, dialogs — have no navigation of their own, so on a phone the
// system back gesture would leave the app instead of closing what is open. Every open layer pushes a
// history entry and closes when that entry is popped, which makes back undo exactly the last thing
// that opened, in reverse order, and only exits once nothing is left.

const MARKER = 'arxhub.layer'

interface Layer {
  id: number
  close: () => void
}

const stack: Layer[] = []
let nextId = 1
let listening = false

// Set while unwinding a layer we closed ourselves, so the history.back() we issue does not read as a
// user pressing back again and close the layer underneath.
let unwinding = 0

function onPopState(): void {
  if (unwinding > 0) {
    unwinding--
    return
  }
  const top = stack.pop()
  top?.close()
}

function listen(): void {
  if (listening) return
  window.addEventListener('popstate', onPopState)
  listening = true
}

function push(close: () => void): number {
  listen()
  const id = nextId++
  stack.push({ id, close })
  window.history.pushState({ [MARKER]: id }, '')
  return id
}

// Removing a layer that is not on top would desynchronise the stack from history, so only the top
// entry unwinds; a lower one is dropped from the stack and its history entry is left inert.
function remove(id: number): void {
  const index = stack.findIndex((layer) => layer.id === id)
  if (index === -1) return
  stack.splice(index, 1)
  if (index === stack.length && window.history.state?.[MARKER] === id) {
    unwinding++
    window.history.back()
  }
}

// Binds an `open` flag to the back stack: opening pushes an entry, closing (by any route — the
// close button, a tap outside, Escape) removes it again.
export function useBackStack(open: WatchSource<boolean>, close: () => void): void {
  let id: number | null = null

  const detach = () => {
    if (id != null) {
      remove(id)
      id = null
    }
  }

  watch(
    open,
    (isOpen) => {
      if (isOpen && id == null) id = push(close)
      else if (!isOpen) detach()
    },
    { immediate: true },
  )

  onUnmounted(detach)
}
