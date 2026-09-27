import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'protection',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Identity, content-encryption keys, and request authentication for ArxHub',
  descriptions: { ru: 'Ключ устройства, шифрование содержимого и подпись запросов' },
  // A protected VFS rejects unsigned requests, so switching this off would take config with it.
  essential: true,
} satisfies PluginManifest

export const serverManifest = {
  name: 'ProtectionServer',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Authenticates gateway requests via signed challenges with TOFU key pinning',
  descriptions: { ru: 'Проверка подписанных запросов и закрепление первого ключа' },
  namespace: 'pair',
  // Switching this off would leave the vault open to anyone who can reach the port. A recovery boot
  // must not be a way to get there.
  essential: true,
} satisfies PluginManifest
