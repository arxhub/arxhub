import type { VfsChangeSource, VirtualFileSystem } from '@arxhub/vfs'
import { shallowReactive } from 'vue'
import { parseAppearance } from './document-appearance'

/** Lazy projection for the tree. The .arx file, never this cache, owns the icon. */
export function createDocumentIcons(vfs: VirtualFileSystem, changes: VfsChangeSource) {
  const icons = shallowReactive(new Map<string, string | null>())
  const tickets = new Map<string, object>()
  let stopped = false
  const stop = changes.subscribe((change) => {
    for (const path of new Set([...icons.keys(), ...tickets.keys()])) {
      if ([change.pathname, change.from].some((prefix) => prefix != null && (path === prefix || path.startsWith(`${prefix}/`)))) {
        tickets.delete(path)
        icons.delete(path)
      }
    }
  })
  return {
    get(path: string): string | undefined {
      if (stopped || !path.toLowerCase().endsWith('.arx')) return undefined
      if (!icons.has(path) && !tickets.has(path)) {
        const ticket = {}
        tickets.set(path, ticket)
        // Defer reads out of both rendering and the VFS watcher's write notification.
        void Promise.resolve().then(async () => {
          let icon: string | null = null
          try {
            icon = parseAppearance(JSON.parse(await vfs.file(path).readText()).appearance).icon
          } catch {
            /* A bad file must not break navigation. */
          }
          if (!stopped && tickets.get(path) === ticket) {
            tickets.delete(path)
            icons.set(path, icon)
          }
        })
      }
      return icons.get(path) ?? undefined
    },
    set(path: string, icon: string | null) {
      tickets.delete(path)
      icons.set(path, icon)
    },
    dispose() {
      stopped = true
      stop()
      tickets.clear()
      icons.clear()
    },
  }
}
