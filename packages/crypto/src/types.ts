export type HashAlgorithm = 'sha256'

export interface Hasher {
  update(data: Uint8Array): this
  digest(encoding: 'hex'): Promise<string>
}

export type Hash = (data: Uint8Array, algorithm: HashAlgorithm) => Promise<string>
export type CreateHasher = (algorithm: HashAlgorithm) => Hasher
