import type { Messages } from '../catalog'

export interface CatalogProblemOptions {
  // Keys whose Russian is legitimately the English text: PDF, OK, a language's own name.
  sameAsEn?: readonly string[]
}

const RU_PLURAL_FORMS = new Intl.PluralRules('ru').resolvedOptions().pluralCategories.filter((form) => form !== 'other')

type Node = Record<string, unknown>

function isObject(value: unknown): value is Node {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

// A leaf of the catalog: a string, or a plural's forms. Recognised by shape, the same way `t` reads it.
function isPluralNode(value: unknown): value is Node {
  return isObject(value) && Object.values(value).every((v) => typeof v === 'string') && ('one' in value || 'other' in value)
}

function params(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort()
}

function braceProblem(text: string): boolean {
  let depth = 0
  for (const char of text) {
    if (char === '{') depth++
    else if (char === '}') depth--
    if (depth < 0 || depth > 1) return true
  }
  return depth !== 0
}

function forms(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (isObject(node)) return Object.values(node).filter((v): v is string => typeof v === 'string')
  return []
}

function sameSet(a: string[], b: string[]): boolean {
  const left = [...new Set(a)].sort()
  const right = [...new Set(b)].sort()
  return left.length === right.length && left.every((v, i) => v === right[i])
}

// Everything a reviewer would otherwise have to spot by eye in two long files: a key only one side has,
// placeholders that drifted apart, a plural missing a form Russian needs, and an untranslated copy.
export function catalogProblems(messages: Pick<Messages, 'namespace' | 'en' | 'ru'>, options: CatalogProblemOptions = {}): string[] {
  const problems: string[] = []
  const same = new Set(options.sameAsEn ?? [])
  const ns = messages.namespace

  function checkText(where: string, text: string): void {
    if (text.trim() === '') problems.push(`${ns}:${where} is empty`)
    if (braceProblem(text)) problems.push(`${ns}:${where} has unbalanced braces`)
  }

  function walk(en: unknown, ru: unknown, path: string): void {
    if (isObject(en) && !isPluralNode(en)) {
      if (!isObject(ru) || isPluralNode(ru)) {
        problems.push(`${ns}:${path} is a section in en but not in ru`)
        return
      }
      for (const key of Object.keys(en)) {
        const next = path ? `${path}.${key}` : key
        if (!Object.hasOwn(ru, key)) problems.push(`${ns}:${next} is missing in ru`)
        else walk(en[key], ru[key], next)
      }
      for (const key of Object.keys(ru))
        if (!Object.hasOwn(en, key)) problems.push(`${ns}:${path ? `${path}.${key}` : key} is in ru but not in en`)
      return
    }

    if (isPluralNode(en)) {
      for (const form of ['one', 'other']) if (typeof en[form] !== 'string') problems.push(`${ns}:${path} (en) lacks the plural form "${form}"`)
      if (!isPluralNode(ru)) {
        problems.push(`${ns}:${path} is a plural in en but not in ru`)
        return
      }
      for (const form of RU_PLURAL_FORMS) if (typeof ru[form] !== 'string') problems.push(`${ns}:${path} (ru) lacks the plural form "${form}"`)
    } else if (typeof en === 'string') {
      if (typeof ru !== 'string') {
        problems.push(`${ns}:${path} is a string in en but not in ru`)
        return
      }
    } else {
      problems.push(`${ns}:${path} is neither a string, a plural nor a section`)
      return
    }

    for (const text of forms(en)) checkText(`${path} (en)`, text)
    for (const text of forms(ru)) checkText(`${path} (ru)`, text)
    const enParams = forms(en).flatMap(params)
    const ruParams = forms(ru).flatMap(params)
    if (!sameSet(enParams, ruParams))
      problems.push(`${ns}:${path} placeholders differ: en {${[...new Set(enParams)].join(', ')}} ru {${[...new Set(ruParams)].join(', ')}}`)
    if (!same.has(path) && sameSet(forms(en), forms(ru)) && forms(en).some((text) => /\p{L}/u.test(text)))
      problems.push(`${ns}:${path} (ru) is the English text — translate it or list it in sameAsEn`)
  }

  walk(messages.en, messages.ru, '')
  return problems
}

interface DescribedManifest {
  name: string
  description?: string
  descriptions?: Readonly<Record<string, string>>
}

// A manifest's description is shown on the Plugins page and the crash screen, so it is copy like any other:
// one that has English must have Russian, and the Russian must not be the English left in place.
export function manifestProblems(...manifests: readonly DescribedManifest[]): string[] {
  const problems: string[] = []
  for (const manifest of manifests) {
    if (manifest.description == null) continue
    const ru = manifest.descriptions?.ru
    if (ru == null || ru.trim() === '') problems.push(`${manifest.name}: description has no Russian`)
    else if (ru === manifest.description) problems.push(`${manifest.name}: Russian description is the English text`)
  }
  return problems
}
