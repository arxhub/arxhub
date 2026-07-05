const OBJECT_HASH = /^[0-9a-f]{64}$/

// An object address is exactly the lowercase sha256 hex of the object's plaintext. Everything that
// turns a hash into a storage path or wire frame validates with this first, so an untrusted hash can
// never smuggle path segments or corrupt a frame.
export function isObjectHash(value: string): boolean {
  return OBJECT_HASH.test(value)
}
