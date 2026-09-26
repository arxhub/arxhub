import { describe, expect, test } from 'vitest'
import { downloadFacts } from '../ui/download-facts'

describe('downloadFacts', () => {
  test('says nothing is counted yet before the first read-out', () => {
    expect(downloadFacts(null)).toEqual({ percent: 0, documents: '—', downloaded: '—', cloud: '—' })
  })

  test('counts documents and bytes, with the bar on bytes', () => {
    const facts = downloadFacts({
      filesDone: 312,
      filesTotal: 1248,
      bytesDone: 1024 * 1024,
      bytesTotal: 4 * 1024 * 1024,
      cloudBytes: 3 * 1024 ** 3,
    })
    expect(facts).toEqual({ percent: 25, documents: '312 of 1,248', downloaded: '1.0 MB of 4.0 MB', cloud: '3.0 GB' })
  })

  test('falls back to files when the manifest carries no sizes', () => {
    expect(downloadFacts({ filesDone: 1, filesTotal: 4, bytesDone: 0, bytesTotal: 0, cloudBytes: 0 }).percent).toBe(25)
  })

  test('an empty download is complete, not stuck at zero', () => {
    expect(downloadFacts({ filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0, cloudBytes: 0 }).percent).toBe(100)
  })
})
