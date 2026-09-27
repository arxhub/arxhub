import { LANGUAGES, language, preference, setLanguagePreference } from './language'

export function useLanguage() {
  return { language, preference, setPreference: setLanguagePreference, languages: LANGUAGES }
}
