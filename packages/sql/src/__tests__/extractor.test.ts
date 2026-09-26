import { validation } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import { type DocumentExtractor, extractorSignature, linkExtensions, matchingExtractors, resolveExtractor } from '../extractor'
import { assembleDocument, extractDocument } from '../parse-document'

const encoder = new TextEncoder()

function extractor(overrides: Partial<DocumentExtractor> & Pick<DocumentExtractor, 'id'>): DocumentExtractor {
  return {
    version: 1,
    extensions: ['.fx'],
    extract: () => ({ blocks: [{ type: 'paragraph', content: overrides.id }] }),
    ...overrides,
  }
}

describe('resolveExtractor', () => {
  it('claims by extension, whatever its case, and in registration order', () => {
    const first = extractor({ id: 'first', extensions: ['.FX'] })
    const second = extractor({ id: 'second' })
    expect(resolveExtractor('notes/a.fx', [first, second])).toBe(first)
    expect(resolveExtractor('notes/A.FX', [first, second])).toBe(first)
    expect(matchingExtractors('notes/a.fx', [first, second])).toEqual([first, second])
  })

  it('lets `matches` narrow inside the extensions', () => {
    const cards = extractor({ id: 'cards', matches: (path) => path.startsWith('cards/') })
    const other = extractor({ id: 'other' })
    expect(resolveExtractor('cards/a.fx', [cards, other])).toBe(cards)
    expect(resolveExtractor('notes/a.fx', [cards, other])).toBe(other)
  })

  it('claims nothing without an extension', () => {
    expect(resolveExtractor('LICENSE', [extractor({ id: 'fx', extensions: [''] })])).toBeNull()
  })
})

describe('extractDocument', () => {
  it('uses the first extractor that answers, and its kind', async () => {
    const declines = extractor({ id: 'declines', extract: () => null })
    const answers = extractor({ id: 'answers', kind: 'fx-kind' })
    const doc = await extractDocument('a.fx', encoder.encode('x'), undefined, [declines, answers])
    expect(doc.kind).toBe('fx-kind')
    expect(doc.content).toBe('answers')
  })

  it('falls through to the built-in rule when every extractor declines', async () => {
    const declines = extractor({ id: 'declines', extensions: ['.md'], extract: async () => null })
    const doc = await extractDocument('a.md', encoder.encode('# Заголовок'), undefined, [declines])
    expect(doc.kind).toBe('markdown')
    expect(doc.title).toBe('Заголовок')
  })

  it('ends a declined binary format as metadata with its hash, so the walk does not retry it', async () => {
    const declines = extractor({ id: 'declines', extract: () => null })
    const doc = await extractDocument('a.fx', encoder.encode('x'), undefined, [declines])
    expect(doc.kind).toBe('binary')
    expect(doc.blocks).toEqual([])
    expect(doc.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('lets a throw through — the caller turns it into a metadata-only record', async () => {
    const throws = extractor({
      id: 'throws',
      extract: () => {
        throw validation('bad file')
      },
    })
    await expect(extractDocument('a.fx', encoder.encode('x'), undefined, [throws])).rejects.toThrow('bad file')
  })

  it('lets an extraction override the kind', async () => {
    const fallback = extractor({ id: 'fx', extract: (input) => ({ kind: 'text', blocks: [{ type: 'paragraph', content: input.text() }] }) })
    const doc = await extractDocument('a.fx', encoder.encode('﻿плоский текст'), undefined, [fallback])
    expect(doc.kind).toBe('text')
    expect(doc.content).toBe('плоский текст')
  })
})

describe('extractorSignature', () => {
  it('does not depend on the order extractors registered in', () => {
    const a = extractor({ id: 'a', extensions: ['.b', '.a'] })
    const b = extractor({ id: 'b', version: 3 })
    expect(extractorSignature([a, b])).toBe(extractorSignature([b, a]))
    expect(extractorSignature([a, b])).toBe('a@1:.a,.b;b@3:.fx')
  })

  it('changes with a version and with the set', () => {
    const a = extractor({ id: 'a' })
    expect(extractorSignature([a])).not.toBe(extractorSignature([{ ...a, version: 2 }]))
    expect(extractorSignature([a])).not.toBe(extractorSignature([]))
  })
})

describe('linkExtensions', () => {
  it('puts markdown first, the linkable formats next, text last', () => {
    const arx = extractor({ id: 'arx', extensions: ['.arx'], linkable: true })
    const pdf = extractor({ id: 'pdf', extensions: ['.pdf'] })
    expect(linkExtensions([pdf, arx])).toEqual(['md', 'markdown', 'arx', 'txt', 'text'])
    expect(linkExtensions([])).toEqual(['md', 'markdown', 'txt', 'text'])
  })
})

describe('assembleDocument', () => {
  const extraction = {
    blocks: [
      { type: 'cell' as const, content: '#not-a-tag [[not-a-link]]', anchor: { id: 'A1', part: 'sheet' } },
      { type: 'cell' as const, content: '#not-a-tag [[not-a-link]]', anchor: { id: 'A2', part: 'sheet' } },
    ],
    tags: ['attached'],
  }

  it('reads no inline markup out of data when told not to, but keeps document tags', () => {
    const doc = assembleDocument('book.fx', 'fx', extraction, encoder.encode('x'), undefined, { inlineMarkup: false })
    expect(doc.tags.map((tag) => tag.name)).toEqual(['attached'])
    expect(doc.refs).toEqual([])
    expect(doc.blocks.map((block) => [block.anchorId, block.part, block.occurrence])).toEqual([
      ['A1', 'sheet', 0],
      ['A2', 'sheet', 1],
    ])
  })

  it('reads inline markup by default', () => {
    const doc = assembleDocument('book.fx', 'fx', extraction, encoder.encode('x'))
    expect(doc.tags.map((tag) => tag.name)).toEqual(['attached', 'not-a-tag', 'not-a-tag'])
    expect(doc.refs.map((ref) => ref.targetRaw)).toEqual(['not-a-link'])
  })

  it('takes an explicit title over the first heading, and the file name when there is neither', () => {
    const heading = { blocks: [{ type: 'heading' as const, content: 'Заголовок', level: 1 }] }
    expect(assembleDocument('a.fx', 'fx', { ...heading, title: 'Явный' }, encoder.encode('x')).title).toBe('Явный')
    expect(assembleDocument('a.fx', 'fx', heading, encoder.encode('x')).title).toBe('Заголовок')
    expect(assembleDocument('a.fx', 'fx', { blocks: [] }, encoder.encode('x')).title).toBe('a')
  })

  it('keeps a checked state on a task only', () => {
    const doc = assembleDocument(
      'a.fx',
      'fx',
      {
        blocks: [
          { type: 'task', content: 'сделать' },
          { type: 'paragraph', content: 'абзац', checked: true },
        ],
      },
      encoder.encode('x'),
    )
    expect(doc.blocks.map((block) => block.checked)).toEqual([false, null])
  })

  it('attaches structural links to their block and skips them in code', () => {
    const doc = assembleDocument(
      'a.fx',
      'fx',
      {
        blocks: [
          { type: 'paragraph', content: 'сюда' },
          { type: 'code', content: 'code' },
        ],
        links: [
          { blockIndex: 0, ref: { kind: 'markdown', targetRaw: 'other.md', label: 'сюда' } },
          { blockIndex: 1, ref: { kind: 'markdown', targetRaw: 'code.md', label: null } },
        ],
      },
      encoder.encode('x'),
    )
    expect(doc.refs).toEqual([{ kind: 'markdown', targetRaw: 'other.md', label: 'сюда', srcBlock: 'a.fx#0' }])
  })
})
