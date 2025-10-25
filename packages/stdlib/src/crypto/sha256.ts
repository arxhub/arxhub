import crypto from 'node:crypto'

export function sha256(data: crypto.BinaryLike): string {
  const hash = crypto.createHash('sha256')
  hash.update(data)
  return hash.digest('hex')
}
