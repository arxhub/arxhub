import { createHash } from 'node:crypto'
import type { CreateHasher, Hash } from './types'

export * from './auth'
export * from './cipher'
export * from './errors'
export * from './keyring'
export * from './mnemonic'
export * from './paths'
export * from './request-auth'
export type { HashAlgorithm, Hasher } from './types'

export const hash: Hash = async (data, algorithm) => createHash(algorithm).update(data).digest('hex')

export const createHasher: CreateHasher = (algorithm) => {
  const h = createHash(algorithm)
  return {
    update(data) {
      h.update(data)
      return this
    },
    async digest(encoding) {
      return h.digest(encoding)
    },
  }
}
