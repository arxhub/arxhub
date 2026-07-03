// BIP32 hardened derivation paths for ArxHub's purpose-specific keys. 83696968 is an
// app-namespace index (the BIP85 'purpose' constant, ASCII 'bip' interpreted as digits); every
// segment is hardened so a leaked child key can neither expose its siblings nor climb back to the
// parent. One BIP39 mnemonic is the single root; each purpose gets an isolated branch.
export const ENCRYPTION_PATH = "m/83696968'/0'"
export const AUTH_PATH = "m/83696968'/1'"
