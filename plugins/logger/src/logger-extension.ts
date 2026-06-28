import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { LogBuffer, LogRecord } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { ref, shallowRef } from 'vue'

type LoggerExtensionArgs = ExtensionArgs & { buffer: LogBuffer }

const SESSION_RE = /session-.*\.ndjson$/

// Bridges the framework-free LogBuffer into Vue reactivity for the panel + footer. Holds the live
// window as a shallowRef (replaced wholesale on each push so the ref triggers), the current session
// file path, and a clear() that empties both the buffer and the ref. Also fronts all log-file access:
// the panel reads sessions ONLY through here, because the plugin's PluginVfs is per-plugin-scoped and
// is NOT resolvable from the root services container a Vue component sees via useArxHub().
export class LoggerExtension extends Extension {
  readonly buffer: LogBuffer
  readonly records = shallowRef<LogRecord[]>([])
  readonly sessionFile = ref<string | null>(null)
  // The plugin's scoped state VFS (state/<id>), injected by LoggerPlugin.start() once available.
  private vfs: VirtualFileSystem | null = null

  constructor(args: LoggerExtensionArgs) {
    super(args)
    this.buffer = args.buffer
    this.records.value = [...args.buffer.getAll()]
    args.buffer.subscribe(() => {
      this.records.value = [...this.buffer.getAll()]
    })
  }

  bindVfs(vfs: VirtualFileSystem): void {
    this.vfs = vfs
  }

  clear(): void {
    this.buffer.clear()
    this.records.value = []
  }

  // Past session files, newest first. Empty until the VFS is bound (or if the dir doesn't exist yet).
  async listSessions(): Promise<string[]> {
    if (!this.vfs) return []
    try {
      const entries = await this.vfs.list('logs')
      return entries
        .filter((e) => e.kind === 'file' && SESSION_RE.test(e.pathname))
        .map((e) => e.pathname)
        .sort()
        .reverse()
    } catch {
      return []
    }
  }

  // Parse an NDJSON session file into records, skipping blank/malformed lines.
  async loadSession(path: string): Promise<LogRecord[]> {
    if (!this.vfs) return []
    const text = new TextDecoder().decode(await this.vfs.read(path))
    return text
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => {
        try {
          return JSON.parse(l) as LogRecord
        } catch {
          return null
        }
      })
      .filter((r): r is LogRecord => r !== null)
  }
}
