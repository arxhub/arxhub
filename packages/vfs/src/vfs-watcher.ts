// Suffix of the metadata sidecar a content write leaves next to the file (see InfoNamespaceImpl.flush).
// A sidecar is written by the write machinery itself, one per content write, and is not a file anyone
// asked to store — so it never reaches a watcher.
export const INFO_FILE_SUFFIX = '.arxmeta'

export type VfsChangeKind = 'written' | 'deleted' | 'renamed'

export interface VfsChange {
  kind: VfsChangeKind
  // Where the change landed, in the coordinates of the view that reported it (for a scoped view, a path
  // relative to its prefix).
  pathname: string
  // Where a 'renamed' change came from. Absent on every other kind.
  from?: string
}

export type VfsChangeListener = (change: VfsChange) => void

// The read side of a watcher — all a subscriber needs, and all a DI key hands out. A plugin observes
// changes; it does not announce them, because only the view that performed the operation knows one
// happened.
export interface VfsChangeSource {
  subscribe(listener: VfsChangeListener): () => void
}

export interface VfsWatcherOptions {
  // Reports a listener that threw. Without a handler the failure is dropped, because a listener must
  // never be able to fail an operation that already succeeded.
  onError?: (error: unknown, change: VfsChange) => void
}

// Registry of watchers over one file system view. Deliberately synchronous and unordered: a listener
// runs inside the operation that notified it (often under that path's lock), so it may only record what
// happened and return — anything slower belongs on the listener's own queue.
export class VfsWatcher implements VfsChangeSource {
  private readonly listeners = new Set<VfsChangeListener>()
  private readonly onError: ((error: unknown, change: VfsChange) => void) | undefined

  constructor(options: VfsWatcherOptions = {}) {
    this.onError = options.onError
  }

  subscribe(listener: VfsChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(change: VfsChange): void {
    // A snapshot: a listener that unsubscribes (or subscribes) while being notified must not mutate the
    // set being iterated.
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(change)
      } catch (error) {
        this.onError?.(error, change)
      }
    }
  }
}
