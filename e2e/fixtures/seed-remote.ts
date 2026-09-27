import { apiBaseUrl } from '@arxhub/core'
import { keyringFromMnemonic, MutableRequestSigner } from '@arxhub/crypto'
import { EncryptedSyncRemote, HttpSyncRemote, type SnapshotFile, SYNC_NAMESPACE, snapshotHash } from '@arxhub/sync'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

// Pushes one vault file to the stand's sync store under the given phrase, driven from a page of the stand,
// so a device joining by that phrase finds a vault there. No device of the run syncs with the stand, so
// the store's head is this helper's alone; it still parents on whatever head is there, which keeps a
// --repeat-each copy honest instead of refused by the compare-and-swap.
export async function seedRemoteVault(mnemonic: string, pathname: string, text: string): Promise<void> {
  const keyring = keyringFromMnemonic(mnemonic)
  const signer = new MutableRequestSigner()
  signer.install(keyring)
  const remote = new EncryptedSyncRemote(
    new HttpSyncRemote({ baseUrl: apiBaseUrl(location.origin, SYNC_NAMESPACE), signer }),
    keyring.encryptionKey,
  )

  const content = new TextEncoder().encode(text)
  const hash = bytesToHex(sha256(content))
  const file: SnapshotFile = { pathname, hash, size: content.byteLength, chunks: [{ hash, size: content.byteLength }] }

  for (let attempt = 0; attempt < 5; attempt++) {
    const parent = await remote.getHead()
    const files = { [pathname]: file }
    const head = snapshotHash(parent, files)
    const snapshot = { hash: head, parent, timestamp: Math.floor(Date.now() / 1000), files }
    await remote.putObjects(
      new Map([
        [hash, content],
        [head, new TextEncoder().encode(JSON.stringify(snapshot))],
      ]),
    )
    if (await remote.setHead(parent, head)) return
  }
  throw new Error('the stand kept moving its sync head')
}
