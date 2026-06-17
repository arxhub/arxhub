import type { VirtualFile } from '../virtual-file'

export interface VirtualWalker extends AsyncIterable<VirtualFile> {
  cursor(): string
  hasNext(): Promise<boolean>
  next(): Promise<VirtualFile | null>
}

// Cap total cursor entries to bound memory: the cursor is opaque to clients and, over the HTTP VFS,
// fully attacker-controlled. A pathological token could otherwise allocate unbounded string arrays.
const MAX_CURSOR_ENTRIES = 100_000

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((it) => typeof it === 'string')
}

// btoa/atob only handle Latin1, so encode/decode UTF-8 explicitly — otherwise a non-ASCII pathname
// (e.g. a Cyrillic or emoji filename) throws InvalidCharacterError when a cursor is serialized.
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(token: string): string {
  const binary = atob(token)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function serializeCursor(state: { queue: string[]; pending: string[] }): string {
  return encodeBase64(JSON.stringify(state))
}

export function deserializeCursor(token: string): { queue: string[]; pending: string[] } {
  const empty = { queue: [], pending: [] }
  try {
    const parsed = JSON.parse(decodeBase64(token)) as unknown
    if (parsed == null || typeof parsed !== 'object') return empty
    const { queue, pending } = parsed as Record<string, unknown>
    // Validate shape before trusting it — never cast untrusted JSON straight to the cursor type.
    if (!Array.isArray(queue) || !Array.isArray(pending)) return empty
    // Cheap length cap before the O(n) per-element type scan, so a huge payload is rejected early.
    if (queue.length + pending.length > MAX_CURSOR_ENTRIES) return empty
    if (!isStringArray(queue) || !isStringArray(pending)) return empty
    return { queue, pending }
  } catch {
    return empty
  }
}
