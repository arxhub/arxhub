import type { ArxHub } from '@arxhub/core'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { mountGate, type ShellFrame } from '@arxhub/uikit/hooks'
import { SyncExtension } from '../sync-extension'
import InitialDownloadGate from './InitialDownloadGate.vue'

interface WakeLockSentinelLike {
  release(): Promise<void>
}

// Keeps the screen on while the vault comes down: a phone that dims and locks suspends the webview,
// which is the very thing the download screen asks the person not to do. Best effort — a browser
// without the API (or one that refuses it) just downloads with the screen's own timeout.
async function keepScreenOn(): Promise<WakeLockSentinelLike | null> {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock
  try {
    return (await wakeLock?.request('screen')) ?? null
  } catch {
    return null
  }
}

// Called by the boot after the plugins started and before the shell mounts. A device joining a vault is
// held here until its first download has landed and the person chose to open the app; any other boot —
// one that owes no download, a maintenance boot, one with sync switched off — goes straight through,
// and a join interrupted by such a boot is picked up by the next normal one, since the entry record
// stays until the download completes.
export async function holdForInitialDownload(arxhub: ArxHub, frame: ShellFrame): Promise<void> {
  if (!arxhub.extensions.has(SyncExtension)) return
  const sync = arxhub.extensions.get(SyncExtension)
  if (sync.initialDownload.value.status === 'none') return

  let open: () => void = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  const lock = await keepScreenOn()
  const gate = mountGate(InitialDownloadGate, { sync, repository: arxhub.extensions.get(RepositoryExtension), onOpen: () => open() }, frame)
  try {
    await opened
  } finally {
    gate.dispose()
    await lock?.release().catch(() => {})
  }
}
