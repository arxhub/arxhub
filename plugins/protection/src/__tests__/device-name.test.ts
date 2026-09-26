import { describe, expect, test } from 'vitest'
import { describeThisDevice } from '../entry/device-name'

describe('describeThisDevice', () => {
  test.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36', 'Android phone'],
    ['Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/128.0 Safari/537.36', 'Android tablet'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 'iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15', 'Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Windows computer'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', 'Linux computer'],
    ['', 'New device'],
  ])('%s → %s', (ua, name) => {
    expect(describeThisDevice(ua)).toBe(name)
  })
})
