import type { CreateHasher, Hash } from './types'

export type { HashAlgorithm, Hasher } from './types'

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

const subtleAlgorithm: Record<string, string> = { sha256: 'SHA-256' }

export const hash: Hash = async (data, algorithm) => {
  const buf = await globalThis.crypto.subtle.digest(subtleAlgorithm[algorithm], toArrayBuffer(data))
  return toHex(buf)
}

export const createHasher: CreateHasher = (algorithm) => {
  const chunks: Uint8Array[] = []
  return {
    update(data) { chunks.push(data); return this },
    async digest(_encoding) {
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const merged = new Uint8Array(total)
      let offset = 0
      for (const c of chunks) { merged.set(c, offset); offset += c.length }
      const buf = await globalThis.crypto.subtle.digest(subtleAlgorithm[algorithm], merged.buffer as ArrayBuffer)
      return toHex(buf)
    },
  }
}
