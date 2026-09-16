import { describe, expect, test } from 'vitest'
import { describeImport, describeImportFailure, type ImportedFile } from '../import-files'

function landed(name: string, path: string): ImportedFile {
  return { name, path }
}

describe('describeImport', () => {
  test('one file is named singular', () => {
    expect(describeImport([landed('photo.jpg', 'trip/photo.jpg')])).toEqual({ title: 'File added', description: 'photo.jpg' })
  })

  test('several are counted and listed', () => {
    const added = [landed('a.txt', 'a.txt'), landed('b.txt', 'b.txt')]
    expect(describeImport(added)).toEqual({ title: '2 files added', description: 'a.txt, b.txt' })
  })

  test('past three the list gives way to a count', () => {
    const added = ['a', 'b', 'c', 'd', 'e'].map((name) => landed(`${name}.txt`, `${name}.txt`))
    expect(describeImport(added).description).toBe('a.txt, b.txt, c.txt and 2 more')
  })

  // The point of the whole report: nothing was overwritten, so what the owner will look for under the
  // name they picked is somewhere else and the toast has to say where.
  test('a name that had to change is spelled out, old and new', () => {
    const added = [landed('photo.jpg', 'trip/photo 2.jpg')]
    expect(describeImport(added)).toEqual({ title: 'File added', description: 'The name was taken, so photo.jpg → photo 2.jpg.' })
  })

  test('with a mix, only the renames are spent on — the rest landed where they said they would', () => {
    const added = [landed('a.txt', 'a.txt'), landed('photo.jpg', 'photo 2.jpg')]
    expect(describeImport(added)).toEqual({ title: '2 files added', description: 'The name was taken, so photo.jpg → photo 2.jpg.' })
  })
})

describe('describeImportFailure', () => {
  test('a total failure names only what failed', () => {
    expect(describeImportFailure(['clip.mp4'], 0)).toBe('clip.mp4 could not be written.')
  })

  // A partial import that reported only the failure would have the owner pick the whole set again over
  // the copies already sitting in the vault.
  test('a partial one says how much of the set did land', () => {
    expect(describeImportFailure(['clip.mp4'], 2)).toBe('clip.mp4 could not be written — 2 of 3 were added.')
  })
})
