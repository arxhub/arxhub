import { describe, expect, test } from 'vitest'
import { createKinds, DOCUMENT_KIND, fileNameFor, folderLabel, nameProblem, uploadLabel } from '../create-flow'

describe('what the phone can create', () => {
  test('the document first, then every registered format, named by its template', () => {
    const kinds = createKinds([{ extension: '.arxs', label: 'New spreadsheet', icon: 'lu:table-2', seed: () => '{}' }])

    expect(kinds.map((it) => it.label)).toEqual(['New document', 'New spreadsheet'])
    expect(kinds[1]).toMatchObject({ extension: '.arxs', noun: 'spreadsheet', hint: '.arxs' })
  })

  test('a template for the document itself does not make a second document row', () => {
    const kinds = createKinds([{ extension: '.ARX', label: 'New page', icon: 'lu:file', seed: () => '' }])

    expect(kinds).toEqual([DOCUMENT_KIND])
  })
})

describe('the name of a new file', () => {
  test('appends the extension to what was typed', () => {
    expect(fileNameFor('  Plan ', '.arx')).toBe('Plan.arx')
  })

  test('keeps an extension that was typed already', () => {
    expect(fileNameFor('Plan.ARXS', '.arxs')).toBe('Plan.ARXS')
  })

  test('a blank name is Untitled', () => {
    expect(fileNameFor('   ', '.arx')).toBe('Untitled.arx')
  })

  test('a name that would leave the chosen folder is refused', () => {
    expect(nameProblem('../x')).not.toBeNull()
    expect(nameProblem('a/b')).not.toBeNull()
    expect(nameProblem('a\\b')).not.toBeNull()
    expect(nameProblem(' .. ')).not.toBeNull()
    expect(nameProblem('.')).not.toBeNull()
  })

  test('an ordinary name, dots included, is accepted', () => {
    expect(nameProblem('Plan v1.2')).toBeNull()
    expect(nameProblem('')).toBeNull()
    expect(nameProblem('..notes')).toBeNull()
  })
})

describe('where it lands, in words', () => {
  test('a folder by its own name, the root by the vault', () => {
    expect(folderLabel('work/2026')).toBe('2026')
    expect(folderLabel('')).toBe('Vault')
    expect(folderLabel('/')).toBe('Vault')
  })

  test('counts the files being uploaded', () => {
    expect(uploadLabel(1, 'work')).toBe('Upload · 1 file to «work»')
    expect(uploadLabel(3, '')).toBe('Upload · 3 files to «Vault»')
  })
})
