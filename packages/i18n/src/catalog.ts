import { formatNumber, pluralRules } from './format'
import { type Language, language } from './language'

// English has two plural forms; Russian needs three for whole numbers, and `other` only for fractions
// ("1,5 файла"), where `many` reads acceptably, so it may be left out.
export interface Plural {
  one: string
  other: string
}

export interface PluralRu {
  one: string
  few: string
  many: string
  other?: string
}

export interface Catalog {
  readonly [key: string]: string | Plural | Catalog
}

export type Translation<E> = {
  [K in keyof E]: E[K] extends string ? string : E[K] extends Plural ? PluralRu : Translation<E[K]>
}

// Every leaf as a [dotted path, value] pair. One flattening serves both the key union and the lookup of a
// key's value; walking a dotted key back down split at its dots would fail for a key that contains one.
export type Entries<E> = {
  [K in keyof E & string]: E[K] extends string | Plural
    ? [K, E[K]]
    : Entries<E[K]> extends infer Inner
      ? Inner extends [infer Sub extends string, infer Value]
        ? [`${K}.${Sub}`, Value]
        : never
      : never
}[keyof E & string]

export type MessageKey<E> = Entries<E>[0]

export type Leaf<E, K extends string> = Extract<Entries<E>, [K, unknown]>[1]

export type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never

export type ParamValue = string | number

export type ParamsOf<L> = L extends Plural
  ? [params: { count: number } & { [P in Exclude<Placeholders<L['one'] | L['other']>, 'count'>]: ParamValue }]
  : [Placeholders<L>] extends [never]
    ? []
    : [params: { [P in Placeholders<L>]: ParamValue }]

export type ParamsFor<E, K extends string> = ParamsOf<Leaf<E, K>>

export interface Messages<E extends Catalog = Catalog> {
  readonly namespace: string
  readonly en: E
  readonly ru: Translation<E>
  t<K extends MessageKey<E>>(key: K, ...params: ParamsFor<E, K>): string
  // The sentence with its `{name}` placeholders left in, for a renderer that puts markup there (a `<code>`
  // sample, a `<strong>` word) — uikit's `Interpolated`. The translation keeps its own word order.
  raw(key: MessageKey<E>): string
  has(key: string): boolean
}

export function isPlural(value: unknown): value is Plural | PluralRu {
  return value != null && typeof value === 'object' && typeof (value as Plural).one === 'string' && !Array.isArray(value)
}

// A key segment may itself contain a dot — the `config` section is keyed by literal config keys such as
// `sql.maxRows` — so each level takes the longest run of segments that names an entry.
export function lookup(catalog: unknown, key: string): unknown {
  const segments = key.split('.')
  let node: unknown = catalog
  let index = 0
  while (index < segments.length) {
    if (node == null || typeof node !== 'object') return undefined
    let found = false
    for (let end = segments.length; end > index; end--) {
      const name = segments.slice(index, end).join('.')
      if (Object.hasOwn(node, name)) {
        node = (node as Record<string, unknown>)[name]
        index = end
        found = true
        break
      }
    }
    if (!found) return undefined
  }
  return node
}

export function interpolate(template: string, params: Record<string, unknown> | undefined): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (!Object.hasOwn(params, name)) return whole
    const value = params[name]
    if (name === 'count' && typeof value === 'number') return formatNumber(value)
    return String(value)
  })
}

function pluralForm(value: Plural | PluralRu, count: number, lang: Language): string {
  const category = pluralRules(lang).select(count)
  const forms = value as unknown as Record<string, string | undefined>
  return forms[category] ?? forms.other ?? forms.many ?? value.one
}

// A string or a plural entry in `lang`, with `{name}` filled in; anything else (a section) is `undefined`.
export function render(value: unknown, lang: Language, params: Record<string, unknown> | undefined): string | undefined {
  if (typeof value === 'string') return interpolate(value, params)
  if (isPlural(value)) {
    const count = typeof params?.count === 'number' ? params.count : 0
    return interpolate(pluralForm(value, count, lang), params)
  }
  return undefined
}

const registry = new Map<string, Messages>()

// Registration happens on import of the package's own messages module, not in a lifecycle phase: the
// unlock gate, the crash screen and the boot screen render before any ArxHub exists.
export function defineMessages<const E extends Catalog>(namespace: string, en: E, ru: Translation<E>): Messages<E> {
  const messages: Messages<E> = {
    namespace,
    en,
    ru,
    t(key, ...rest) {
      const params = (rest as unknown[])[0] as Record<string, unknown> | undefined
      const lang = language.value
      const catalog = lang === 'ru' ? ru : en
      const own = render(lookup(catalog, key), lang, params)
      if (own !== undefined) return own
      const fallback = render(lookup(en, key), 'en', params)
      return fallback ?? `${namespace}:${key}`
    },
    raw(key) {
      const value = lookup(language.value === 'ru' ? ru : en, key) ?? lookup(en, key)
      return typeof value === 'string' ? value : `${namespace}:${key}`
    },
    has(key) {
      return render(lookup(en, key), 'en', undefined) !== undefined
    },
  }
  // A second registration of the same name is a hot reload of that module, and the new catalog is the truth.
  registry.set(namespace, messages as unknown as Messages)
  return messages
}

export function registeredMessages(): readonly Messages[] {
  return [...registry.values()]
}

export function messagesFor(namespace: string): Messages | undefined {
  return registry.get(namespace)
}
