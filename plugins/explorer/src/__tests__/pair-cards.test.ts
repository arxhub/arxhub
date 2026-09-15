import { describe, expect, test } from 'vitest'
import { pairCards, type TreeNode } from '../explorer-extension'

function fileNode(pathname: string): TreeNode {
  return { entry: { kind: 'file', pathname }, children: null, expanded: false }
}

function dirNode(pathname: string): TreeNode {
  return { entry: { kind: 'dir', pathname }, children: null, expanded: false }
}

describe('pairCards', () => {
  test('a card with a subject present is folded into the subject row', () => {
    const nodes = [fileNode('photo.jpg'), fileNode('photo.jpg.arx')]
    const paired = pairCards(nodes)

    expect(paired).toHaveLength(1)
    expect(paired[0].entry.pathname).toBe('photo.jpg')
    expect(paired[0].propertiesCardPath).toBe('photo.jpg.arx')
  })

  test('a card whose subject is gone stays a visible row — an orphan the owner can see', () => {
    const nodes = [fileNode('ghost.jpg.arx'), fileNode('unrelated.md')]
    const paired = pairCards(nodes)

    expect(paired).toEqual(nodes)
  })

  test('an .arx note that is not a card for anything is left alone', () => {
    const nodes = [fileNode('journal.arx')]
    expect(pairCards(nodes)).toEqual(nodes)
  })

  test('a directory is never folded and never gains a card path', () => {
    const nodes = [dirNode('notes'), fileNode('notes.arx')]
    // 'notes' the directory and 'notes.arx' the file share no name once the extension is considered —
    // pairing only ever matches a FILE named exactly the card's name minus '.arx'.
    expect(pairCards(nodes)).toEqual(nodes)
  })

  test('leaves nodes untouched (same array) when nothing pairs', () => {
    const nodes = [fileNode('a.md'), fileNode('b.md')]
    expect(pairCards(nodes)).toBe(nodes)
  })

  test('pairs only within the same directory, never by basename alone', () => {
    const nodes = [fileNode('notes/photo.jpg'), fileNode('notes/photo.jpg.arx'), fileNode('other/photo.jpg')]
    const paired = pairCards(nodes)

    expect(paired.find((node) => node.entry.pathname === 'notes/photo.jpg')?.propertiesCardPath).toBe('notes/photo.jpg.arx')
    expect(paired.some((node) => node.entry.pathname === 'notes/photo.jpg.arx')).toBe(false)
    // 'other/photo.jpg' shares a basename with 'notes/photo.jpg' but has no card of its own beside it.
    expect(paired.find((node) => node.entry.pathname === 'other/photo.jpg')?.propertiesCardPath).toBeUndefined()
  })
})
