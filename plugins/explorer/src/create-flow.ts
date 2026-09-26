import { posix } from '@arxhub/path'
import type { FileTemplate } from './explorer-extension'

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
}

export const DOCUMENT_KIND: CreateKind = {
  extension: '.arx',
  label: 'New document',
  icon: 'lu:file-text',
  hint: '.arx — text, tasks and tables',
  noun: 'document',
}

export function createKinds(templates: readonly FileTemplate[]): CreateKind[] {
  const own = templates
    .filter((template) => template.extension.toLowerCase() !== DOCUMENT_KIND.extension)
    .map((template) => ({
      extension: template.extension,
      label: template.label,
      icon: template.icon,
      hint: template.hint ?? template.extension,
      noun: template.label.replace(/^new\s+/i, '').toLowerCase() || 'file',
    }))
  return [DOCUMENT_KIND, ...own]
}

// A name is one entry of the folder the picker chose: a separator or a `.`/`..` segment would land the file
// somewhere the confirm did not say. Answers why it cannot be used, or null.
export function nameProblem(typed: string): string | null {
  const name = typed.trim()
  if (/[\\/]/.test(name)) return 'A name cannot contain / or \\'
  if (name === '.' || name === '..') return 'Choose another name'
  return null
}

// The name typed in the confirm, as a file: blank is "Untitled", and a name already carrying the extension
// keeps just the one.
export function fileNameFor(typed: string, extension: string): string {
  const stem = typed.trim() || 'Untitled'
  return stem.toLowerCase().endsWith(extension.toLowerCase()) ? stem : `${stem}${extension}`
}

// What a folder is called in the flow's own words. The root has no name of its own, so it goes by the
// vault's.
export function folderLabel(folder: string): string {
  const name = posix.basename(folder.replace(/^\/+/, ''))
  return name === '' || name === '.' ? 'Vault' : name
}

export function uploadLabel(count: number, folder: string): string {
  return `Upload · ${count === 1 ? '1 file' : `${count} files`} to «${folderLabel(folder)}»`
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
