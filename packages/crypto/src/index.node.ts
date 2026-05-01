import { createHash } from 'node:crypto'
import type { CreateHasher, Hash } from './types'

export type { HashAlgorithm, Hasher } from './types'

export const hash: Hash = async (data, algorithm) =>
  createHash(algorithm).update(data).digest('hex')

export const createHasher: CreateHasher = (algorithm) => {
  const h = createHash(algorithm)
  return {
    update(data) { h.update(data); return this },
    async digest(encoding) { return h.digest(encoding) },
  }
}
