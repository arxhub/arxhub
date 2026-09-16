import type { WatchSource } from 'vue'
import { onUnmounted, watch } from 'vue'

// Dismissible layers — sheets, drawers, dialogs — have no navigation of their own, so on a phone the
// system back gesture would leave the app instead of closing what is open. Every open layer pushes a
// history entry and closes when that entry is popped, which makes back undo exactly the last thing
// that opened, in reverse order, and only reaches the app itself once nothing is left. That last back
// is the one that throws the owner out of the app with no warning, so a frame may arm a guard over it
// (armExitGuard) and ask first.

const MARKER = 'arxhub.layer'

// The entry that sits under every layer. Back with nothing left to close unloads the document, and by
// then there is nothing left to ask the owner about — with this entry in the way that same back is a
// popstate like any other, and the frame can put a question in front of it.
const EXIT = 'arxhub.exit'

// What stands between the question and the browser's own back: this guard's entry, then the app's. The
// two are traversed one per popstate — two history.back() calls in one task are not reliably two
// traversals.
const EXIT_DEPTH = 2

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

// The question to put in front of a back that would leave, and how many traversals a confirmed exit
// still owes.
let askToLeave: (() => void) | null = null
let leaving = 0

function onPopState(): void {
  if (unwinding > 0) {
    unwinding--
    // The dialog that asked was still closing over an entry of its own when the exit was confirmed;
    // this is that entry going away, and the rest of the way out follows behind it.
    if (unwinding === 0 && leaving > 0) stepOut()
    return
  }
  if (leaving > 0) {
    stepOut()
    return
  }
  const top = stack.pop()
  if (top != null) {
    top.close()
    return
  }
  if (askToLeave != null) {
    // The entry this back just consumed goes straight back on: the dialog then pushes its own above it,
    // so back inside the dialog means cancel like anywhere else, and answering either way leaves the
    // history exactly as deep as it was.
    pushExit()
    askToLeave()
  }
}

function stepOut(): void {
  leaving--
  window.history.back()
}

function pushExit(): void {
  // Arming over an entry that is already the guard's would leave a second one for back to eat in
  // silence.
  if (window.history.state?.[EXIT] === true) return
  window.history.pushState({ [EXIT]: true }, '')
}

// Puts `ask` in front of the back that would otherwise leave the app, and returns the disarm. Nothing
// leaves by itself: `ask` may refuse, and the app is left only once leaveApp() is called.
export function armExitGuard(ask: () => void): () => void {
  listen()
  askToLeave = ask
  pushExit()
  return () => {
    if (askToLeave === ask) askToLeave = null
  }
}

// Leave for real. The dialog that asked is still on screen holding a history entry of its own, so the
// traversals are drained by onPopState as that entry unwinds rather than issued from here.
export function leaveApp(): void {
  leaving = EXIT_DEPTH
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
