import type { EntryRecord } from '@arxhub/plugin-protection'

export interface EntryServerHandover {
  entry: EntryRecord | null
  // What the synced config already says; '' when it names no server.
  serverUrl: string
  writeServerUrl(serverUrl: string): Promise<void>
  completeEntry(): void
}

// A new vault that chose its server during the first run hands the address over once, on sync's first
// start: the entry screens run before any plugin exists and cannot write this plugin's config. Nothing
// remote exists for this vault yet, so writing the synced config cannot conflict with another device's
// copy. An address already in the config wins — it was set on purpose, and the record is only a
// leftover. Returns the address to run on.
//
// A joining device is the opposite case: the remote holds this vault's config already, and writing ours
// before the first download would make a conflict copy of it. So the join runs on the record's address
// without writing anything; the config is completed only after the download (SyncPlugin.finishJoin).
export async function adoptEntryServer(handover: EntryServerHandover): Promise<string> {
  const { entry, serverUrl } = handover
  if (entry?.kind === 'join') return serverUrl === '' ? entry.serverUrl : serverUrl
  if (entry?.kind !== 'connect') return serverUrl
  if (serverUrl === '') await handover.writeServerUrl(entry.serverUrl)
  handover.completeEntry()
  return serverUrl === '' ? entry.serverUrl : serverUrl
}
