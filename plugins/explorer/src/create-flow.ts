import { readText } from '@arxhub/i18n'
import { posix } from '@arxhub/path'
import type { FileTemplate } from './explorer-extension'
import { t } from './i18n/messages'

// What the phone's New can make: the product's own document first (A-29), then whatever format a plugin
// registered a template for. Uploading files is the third answer and is not a kind — it starts with the
// system's picker, not with a name.
export interface CreateKind {
  extension: string
  label: string
  icon: string
  hint: string
  // How the confirm names the thing: "Create spreadsheet in «Work»".
  noun: string
  // The same noun after the verb (Russian accusative): «Создать таблицу в «Рабочее»».
  object: string
}

export const DOCUMENT_EXTENSION = '.arx'

// A function, not a constant: every text in it follows the language at the moment the sheet is drawn.
export function documentKind(): CreateKind {
  return {
    extension: DOCUMENT_EXTENSION,
    label: t('create.document.label'),
    icon: 'lu:file-text',
    hint: t('create.document.hint'),
    noun: t('create.document.noun'),
    object: t('create.document.object'),
  }
}

// A template that names no noun is read off its English label ("New spreadsheet"), which only reads well
// in English — a plugin with a catalog passes `noun`.
function nounOf(template: FileTemplate): string {
  if (template.noun != null) return readText(template.noun)
  return (
    readText(template.label)
      .replace(/^new\s+/i, '')
      .toLowerCase() || t('create.file')
  )
}

export function createKinds(templates: readonly FileTemplate[]): CreateKind[] {
  const own = templates
    .filter((template) => template.extension.toLowerCase() !== DOCUMENT_EXTENSION)
    .map((template) => ({
      extension: template.extension,
      label: readText(template.label),
      icon: template.icon,
      hint: readText(template.hint) ?? template.extension,
      noun: nounOf(template),
      object: template.object != null ? readText(template.object) : nounOf(template),
    }))
  return [documentKind(), ...own]
}

// A name is one entry of the folder the picker chose: a separator or a `.`/`..` segment would land the file
// somewhere the confirm did not say. Answers why it cannot be used, or null.
export function nameProblem(typed: string): string | null {
  const name = typed.trim()
  if (/[\\/]/.test(name)) return t('create.badSeparator')
  if (name === '.' || name === '..') return t('create.badDots')
  return null
}

// The name typed in the confirm, as a file: blank is "Untitled", and a name already carrying the extension
// keeps just the one.
export function fileNameFor(typed: string, extension: string): string {
  const stem = typed.trim() || t('create.untitled')
  return stem.toLowerCase().endsWith(extension.toLowerCase()) ? stem : `${stem}${extension}`
}

// What a folder is called in the flow's own words. The root has no name of its own, so it goes by the
// vault's.
export function folderLabel(folder: string): string {
  const name = posix.basename(folder.replace(/^\/+/, ''))
  return name === '' || name === '.' ? t('vault') : name
}

export function uploadLabel(count: number, folder: string): string {
  return t('create.uploadTo', { count, folder: folderLabel(folder) })
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
