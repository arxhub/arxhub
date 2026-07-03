import { generateMnemonic as gen, mnemonicToSeedSync, validateMnemonic as validate } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

// Entropy strength in bits: 128 → 12 words, 256 → 24 words. 12 words is the standard and gives
// 128-bit security (ample); 24 words is offered for users who want extra margin.
export type MnemonicStrength = 128 | 256

// Generate a fresh BIP39 mnemonic (the single human-backupable root secret). Entropy comes from
// the platform CSPRNG via @scure/bip39.
export function generateMnemonic(strength: MnemonicStrength = 128): string {
  return gen(wordlist, strength)
}

// True only for a well-formed mnemonic with a valid checksum. Use to gate user input before deriving.
export function validateMnemonic(mnemonic: string): boolean {
  return validate(mnemonic, wordlist)
}

// Derive the 64-byte BIP39 seed (synchronous PBKDF2). Deterministic: same mnemonic → same seed →
// same keys on every device, which is what lets two paired devices converge.
export function mnemonicToSeed(mnemonic: string): Uint8Array {
  return mnemonicToSeedSync(mnemonic)
}
