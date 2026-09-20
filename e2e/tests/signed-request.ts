import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import type { APIResponse, Page } from '@playwright/test'

// Mirrors @arxhub/crypto request signing for Playwright's Node-side APIRequestContext.
// Importing @arxhub/crypto itself pulls that package's tsconfig into Playwright's loader, which
// cannot resolve `@arxhub/toolchain-tsconfig` from there — so this helper stays on catalog deps only.

const AUTH_PATH = "m/83696968'/1'"

export const AUTH_HEADERS = {
  timestamp: 'x-arx-timestamp',
  nonce: 'x-arx-nonce',
  signature: 'x-arx-signature',
  publicKey: 'x-arx-pubkey',
} as const

function keyringFromMnemonic(mnemonic: string) {
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
  const authNode = root.derive(AUTH_PATH)
  return {
    authPublicKey: authNode.publicExtendedKey,
    sign: (message: Uint8Array) => authNode.sign(sha256(message)),
  }
}

function signRequest(
  keyring: ReturnType<typeof keyringFromMnemonic>,
  desc: { method: string; host: string; path: string; query: string; body: Uint8Array },
) {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = bytesToHex(randomBytes(16))
  const bodyHash = bytesToHex(sha256(desc.body))
  const canonical = [desc.method.toUpperCase(), desc.host, desc.path, desc.query, String(timestamp), nonce, bodyHash].join('\n')
  const signature = bytesToHex(keyring.sign(utf8ToBytes(canonical)))
  return { timestamp: String(timestamp), nonce, signature, publicKey: keyring.authPublicKey }
}

export async function signedPost(
  page: Page,
  mnemonic: string,
  path: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<APIResponse> {
  const origin = new URL(page.url()).origin
  const url = new URL(path, origin)
  const body = data === undefined ? undefined : JSON.stringify(data)
  const signed = signRequest(keyringFromMnemonic(mnemonic), {
    method: 'POST',
    host: url.host,
    path: url.pathname,
    query: url.search.replace(/^\?/, ''),
    body: body === undefined ? new Uint8Array() : new TextEncoder().encode(body),
  })
  const headers: Record<string, string> = {
    [AUTH_HEADERS.timestamp]: signed.timestamp,
    [AUTH_HEADERS.nonce]: signed.nonce,
    [AUTH_HEADERS.signature]: signed.signature,
    [AUTH_HEADERS.publicKey]: signed.publicKey,
    ...extraHeaders,
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  return page.request.post(url.toString(), { headers, data: body })
}
