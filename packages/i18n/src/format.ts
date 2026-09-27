import { type Language, language } from './language'

// Each reads `language.value`, so a template or computed calling one re-renders on a switch.

export function locale(): Language {
  return language.value
}

// Constructing an Intl formatter is the expensive part, and a list of a thousand rows would build one per row.
const cache = new Map<string, unknown>()

function cached<T>(kind: string, options: object | undefined, build: (lang: Language) => T): T {
  const lang = locale()
  const key = `${kind}|${lang}|${options ? JSON.stringify(options) : ''}`
  let hit = cache.get(key) as T | undefined
  if (hit === undefined) {
    hit = build(lang)
    cache.set(key, hit)
  }
  return hit
}

export function pluralRules(lang: Language = locale()): Intl.PluralRules {
  const key = `plural|${lang}`
  let hit = cache.get(key) as Intl.PluralRules | undefined
  if (hit === undefined) {
    hit = new Intl.PluralRules(lang)
    cache.set(key, hit)
  }
  return hit
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return cached('number', options, (lang) => new Intl.NumberFormat(lang, options)).format(value)
}

type DateInput = Date | number | string

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return cached('date', options, (lang) => new Intl.DateTimeFormat(lang, options)).format(toDate(value))
}

export function formatTime(value: DateInput): string {
  return formatDate(value, { timeStyle: 'short' })
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.34524],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

// "3 minutes ago" / "через 2 дня": the largest unit the distance fills at least once.
// `short` is for a status bar: "5 min. ago" / "5 мин. назад".
export function formatRelative(value: DateInput, now: DateInput = Date.now(), style: Intl.RelativeTimeFormatStyle = 'long'): string {
  const formatter = cached('relative', { style }, (lang) => new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style }))
  let amount = (toDate(value).getTime() - toDate(now).getTime()) / 1000
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(amount) < size) return formatter.format(Math.round(amount), unit)
    amount /= size
  }
  return formatter.format(Math.round(amount), 'year')
}

export function formatList(items: readonly string[], type: Intl.ListFormatType = 'conjunction'): string {
  return cached('list', { type }, (lang) => new Intl.ListFormat(lang, { type })).format(items)
}

const BYTE_UNITS: Record<Language, readonly string[]> = {
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
  ru: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'],
}

// The same steps as stdlib's formatBytes (binary, one decimal under 100 of a unit), in the reader's language.
export function formatBytes(size: number): string {
  const units = BYTE_UNITS[locale()]
  if (size < 1024) return `${formatNumber(size)} ${units[0]}`
  let value = size / 1024
  let unit = 1
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value >= 100 ? 0 : 1
  return `${formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })} ${units[unit]}`
}
