import { createEventBus, type Unsubscribe } from '@arxhub/events'
import { type ShallowRef, shallowRef } from 'vue'

export type Language = 'en' | 'ru'
export type LanguagePreference = Language | 'system'

export const LANGUAGES: readonly Language[] = ['en', 'ru']

// Device-local on purpose (owner's decision): a phone in Russian and a work laptop in English is the normal
// case, and a synced setting would switch the other device. Must match the pre-paint script in
// toolchains/vite/src/theme-boot.ts, which reads it before any module has loaded.
export const LANGUAGE_STORAGE_KEY = 'arxhub.language'

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ru'
}

// An explicit choice wins; otherwise the first system language that is Russian gives Russian and anything
// else English — English is what the world reads, so an unknown language is not a reason to pick Russian.
export function pickLanguage(preference: LanguagePreference | null | undefined, systemLanguages: readonly string[]): Language {
  if (isLanguage(preference)) return preference
  return systemLanguages.some((tag) => tag.toLowerCase().startsWith('ru')) ? 'ru' : 'en'
}

export function systemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages && navigator.languages.length > 0) return navigator.languages
  return navigator.language ? [navigator.language] : []
}

// Every storage access can throw (a private window, blocked site data), and a language is never worth a
// failed boot: a failed read is "system".
function readStoredPreference(): LanguagePreference {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY)
    return isLanguage(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function writeStoredPreference(preference: LanguagePreference): void {
  try {
    if (preference === 'system') globalThis.localStorage?.removeItem(LANGUAGE_STORAGE_KEY)
    else globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, preference)
  } catch {
    // The choice still applies for this session; it only will not survive a reload.
  }
}

function documentLanguage(): Language | null {
  if (typeof document === 'undefined') return null
  const lang = document.documentElement.getAttribute('lang')
  return isLanguage(lang) ? lang : null
}

function setDocumentLanguage(value: Language): void {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', value)
}

const preferenceRef: ShallowRef<LanguagePreference> = shallowRef(readStoredPreference())
// The pre-paint script already decided and wrote <html lang>; reading it back keeps the boot screens and
// the app on the one answer instead of computing a second one that could differ (a storage read that
// throws now but did not then).
const languageRef: ShallowRef<Language> = shallowRef(documentLanguage() ?? pickLanguage(preferenceRef.value, systemLanguages()))

export const language: Readonly<ShallowRef<Language>> = languageRef
export const preference: Readonly<ShallowRef<LanguagePreference>> = preferenceRef

interface LanguageEvents {
  change: Language
}

const bus = createEventBus<LanguageEvents>()

function apply(next: Language): void {
  setDocumentLanguage(next)
  if (languageRef.value === next) return
  languageRef.value = next
  bus.emit('change', next)
}

export function setLanguagePreference(next: LanguagePreference): void {
  writeStoredPreference(next)
  preferenceRef.value = next
  apply(pickLanguage(next, systemLanguages()))
}

// For what Vue reactivity does not reach: CodeMirror phrases, ProseMirror placeholders, document.title.
export function onLanguageChange(listener: (language: Language) => void): Unsubscribe {
  return bus.on('change', listener)
}

// "System" means following the system while the app runs, not the value it had at boot.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('languagechange', () => {
    if (preferenceRef.value === 'system') apply(pickLanguage('system', systemLanguages()))
  })
}
