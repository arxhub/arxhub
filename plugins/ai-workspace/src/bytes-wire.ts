// A compared side travels as base64 rather than as decoded text: decoding on the server turns an image or a PDF
// into U+FFFD, which then passes as valid UTF-8 and is diffed line by line instead of reaching the binary summary.

const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // String.fromCharCode spreads its arguments onto the stack, so a whole file at once overflows it.
  for (let at = 0; at < bytes.length; at += CHUNK) binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
