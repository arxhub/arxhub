import { expect, test } from 'vitest'
import { manifest } from '../manifest'

// Shown on the Plugins page and the crash screen, which speak Russian too.
test('the manifest describes the plugin in Russian too', () => {
  expect(manifest.descriptions?.ru).toBeTruthy()
  expect(manifest.descriptions?.ru).not.toBe(manifest.description)
})
