import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { illegalState } from '@arxhub/errors'

// Not `env.ts`: `env.d.ts` beside it is Vite's own name for a bundle's ambient declarations, and TS
// reads a `.d.ts` next to a same-named `.ts` as that file's generated output and drops it from the
// program — which cost the build its `__APP_VERSION__`.
//
// The headless server has nobody to click a button, so its switches come from the environment — and an
// environment variable is typed by whoever wrote the compose file. Every reader here refuses a value it
// does not understand instead of falling back to a default (FR-209): a typo that silently means "off"
// is a maintenance boot that never happened, and a port nobody expects is a server nobody reaches.

export function readPort(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return 3000
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw illegalState(`ARXHUB_PORT must be an integer between 1 and 65535, got '${raw}'`)
  }
  return port
}

const ON = new Set(['1', 'true'])
const OFF = new Set(['0', 'false'])

export function readMaintenance(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase() ?? ''
  if (value === '' || OFF.has(value)) return false
  if (ON.has(value)) return true
  throw illegalState(`ARXHUB_MAINTENANCE must be 1, 0, true or false, got '${raw}'`)
}

// Comma-separated manifest names, e.g. ARXHUB_DISABLED_PLUGINS=PublishServer,SyncServer.
export function readDisabledPlugins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((it) => it.trim())
    .filter(Boolean)
}

// Core skips a name it does not know without a word — right for a client whose stored switch may name
// a plugin a later version removed, wrong for an operator who just misspelled one and now believes it
// is off. The roster is only known once the plugins are instantiated, so this runs from start()'s
// configure hook, before anything listens.
export function refuseUnknownPlugins(disabled: readonly string[], known: readonly string[]): void {
  const unknown = disabled.filter((name) => !known.includes(name))
  if (unknown.length === 0) return
  const quoted = (names: readonly string[]) => names.map((it) => `'${it}'`).join(', ')
  throw illegalState(`ARXHUB_DISABLED_PLUGINS names ${quoted(unknown)}, which no registered plugin is called; the names are ${quoted(known)}`)
}

// NodeFileSystem creates its root in its constructor without awaiting, so a data dir that cannot exist
// used to surface as an unhandled rejection somewhere after boot. Checked up front, with the path in
// the message, because a server with no writable store has nothing to serve.
export async function ensureWritableDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true })
    await access(path, constants.W_OK)
  } catch (error) {
    const reason = error instanceof Error && 'code' in error ? String(error.code) : String(error)
    throw illegalState(`The data directory '${path}' cannot be created or written (${reason}) — check ARXHUB_DATA_DIR and its permissions`)
  }
}
