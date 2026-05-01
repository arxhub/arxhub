export declare function hash(data: Uint8Array): string

export interface Hasher {
  update(data: Uint8Array): this
  digest(encoding: 'hex'): string
}

export declare function createHasher(): Hasher
