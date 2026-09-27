import { describe, expect, it } from 'vitest'
import { catalogProblems } from '../testing'
import { readText } from '../text'

const check = (en: object, ru: object, sameAsEn?: string[]) =>
  catalogProblems({ namespace: 'x', en: en as never, ru: ru as never }, { sameAsEn })

describe('catalogProblems', () => {
  it('passes a complete catalog', () => {
    expect(
      check(
        { a: 'Open {name}', n: { one: 'One', other: '{count} items' }, s: { pdf: 'PDF' } },
        { a: 'Открыть {name}', n: { one: '{count} элемент', few: '{count} элемента', many: '{count} элементов' }, s: { pdf: 'PDF' } },
        ['s.pdf'],
      ),
    ).toEqual([])
  })

  it('reports keys only one side has', () => {
    expect(check({ a: 'A', b: 'B' }, { a: 'А', c: 'В' })).toEqual(['x:b is missing in ru', 'x:c is in ru but not in en'])
  })

  it('reports placeholders that drifted, unbalanced braces and empty strings', () => {
    expect(check({ a: 'Open {name}' }, { a: 'Открыть {title}' })).toEqual(['x:a placeholders differ: en {name} ru {title}'])
    expect(check({ a: 'Open {name' }, { a: 'Открыть {name' })).toContain('x:a (en) has unbalanced braces')
    expect(check({ a: 'A' }, { a: ' ' })).toContain('x:a (ru) is empty')
  })

  it('reports a plural missing a form either language needs', () => {
    expect(check({ n: { one: 'One' } }, { n: { one: 'Один', few: 'Два', many: 'Пять' } })).toContain('x:n (en) lacks the plural form "other"')
    expect(check({ n: { one: 'One', other: 'Many' } }, { n: { one: 'Один', many: 'Пять' } })).toEqual(['x:n (ru) lacks the plural form "few"'])
    expect(check({ n: { one: 'One', other: 'Many' } }, { n: 'Много' })).toEqual(['x:n is a plural in en but not in ru'])
  })

  it('reports an untranslated copy unless it is listed', () => {
    expect(check({ a: 'Save' }, { a: 'Save' })).toEqual(['x:a (ru) is the English text — translate it or list it in sameAsEn'])
    expect(check({ a: 'Save' }, { a: 'Save' }, ['a'])).toEqual([])
    expect(check({ a: '…' }, { a: '…' })).toEqual([])
  })
})

describe('readText', () => {
  it('calls a function and passes a string through', () => {
    expect(readText('Vault')).toBe('Vault')
    expect(readText(() => 'Хранилище')).toBe('Хранилище')
    expect(readText(undefined)).toBeUndefined()
  })
})
