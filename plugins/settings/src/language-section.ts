import { type Language, type LanguagePreference, pickLanguage, systemLanguages } from '@arxhub/i18n'
import type { SelectOption } from '@arxhub/uikit/core'
import { t } from './i18n/messages'

export const LANGUAGE_SECTION_ID = 'language'

// A language's own name, never translated: someone who cannot read the current language still has to be
// able to find their own in the list.
export const AUTONYMS: Record<Language, string> = { en: 'English', ru: 'Русский' }

export function languageOptions(): SelectOption[] {
  const system = pickLanguage('system', systemLanguages())
  return [
    { value: 'system' satisfies LanguagePreference, label: t('language.system', { name: AUTONYMS[system] }), hint: t('language.systemHint') },
    { value: 'en' satisfies LanguagePreference, label: AUTONYMS.en },
    { value: 'ru' satisfies LanguagePreference, label: AUTONYMS.ru },
  ]
}

export function isLanguagePreference(value: string): value is LanguagePreference {
  return value === 'system' || value === 'en' || value === 'ru'
}
