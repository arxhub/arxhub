import { describe, expect, test } from 'vitest'
import { freeName, nthCandidateName } from '../free-name'

describe('nthCandidateName', () => {
  test('the first attempt is the name as asked for', () => {
    expect(nthCandidateName('photo.jpg', 1)).toBe('photo.jpg')
  })

  test('a retry counts inside the stem so the extension survives', () => {
    expect(nthCandidateName('photo.jpg', 2)).toBe('photo 2.jpg')
    expect(nthCandidateName('photo.jpg', 7)).toBe('photo 7.jpg')
  })

  test('a name with no extension counts at the end', () => {
    expect(nthCandidateName('notes', 2)).toBe('notes 2')
  })

  test('a dotfile has no extension to keep — node reads .gitignore as a bare stem', () => {
    expect(nthCandidateName('.gitignore', 2)).toBe('.gitignore 2')
  })

  test('only the last dot is the extension', () => {
    expect(nthCandidateName('report.final.pdf', 2)).toBe('report.final 2.pdf')
  })
})

describe('freeName', () => {
  const takenIn = (names: readonly string[]) => async (candidate: string) => names.includes(candidate)

  test('hands back the name itself when nothing holds it', async () => {
    await expect(freeName('photo.jpg', takenIn([]))).resolves.toBe('photo.jpg')
  })

  test('walks past every taken candidate rather than overwriting one', async () => {
    await expect(freeName('photo.jpg', takenIn(['photo.jpg', 'photo 2.jpg', 'photo 3.jpg']))).resolves.toBe('photo 4.jpg')
  })

  test('asks in order, starting at the name that was wanted', async () => {
    const asked: string[] = []
    await freeName('note.md', async (candidate) => {
      asked.push(candidate)
      return candidate !== 'note 3.md'
    })
    expect(asked).toEqual(['note.md', 'note 2.md', 'note 3.md'])
  })
})
